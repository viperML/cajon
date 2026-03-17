mod init;
mod log;

use std::collections::BTreeMap;
use std::collections::HashMap;
use std::env::current_dir;
use std::fs;
use std::hash::DefaultHasher;
use std::hash::Hash;
use std::hash::Hasher;
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use std::process::Stdio;
use std::sync::OnceLock;

use clap::Parser;
use color_eyre::Result;
use color_eyre::eyre::Context;
use color_eyre::eyre::ContextCompat;
use color_eyre::eyre::bail;
use mlua::LuaSerdeExt;
use mlua::prelude::*;
use serde::Deserialize;

use crate::log::print_command;

fn default_true() -> bool {
    true
}

fn default_workdir() -> String {
    "/mnt".to_string()
}

fn default_name() -> String {
    let dirname: String = Cli::global()
        .config_file
        .canonicalize()
        .unwrap()
        .parent()
        .unwrap()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();

    format!("cajon-{dirname}")
}

#[derive(Debug, Deserialize, Hash)]
struct Config {
    image: String,
    #[serde(default = "default_true")]
    mount_cwd: bool,
    #[serde(default)]
    env: BTreeMap<String, String>,
    #[serde(default)]
    volumes: Vec<String>,
    script: Option<String>,
    cook_script: Option<String>,
    #[serde(default)]
    extra_flags: Vec<String>,
    #[serde(default)]
    stateful: bool,
    #[serde(default = "default_workdir")]
    workdir: String,
    #[serde(default = "default_name")]
    name: String,
    #[serde(default = "default_true")]
    with_ssh: bool,
}

impl Config {
    fn cook_hash(&self) -> String {
        let mut hasher = DefaultHasher::new();
        self.image.hash(&mut hasher);
        self.cook_script.hash(&mut hasher);
        let hash = hasher.finish();
        format!("{hash:016x}")
    }

    fn runtime_hash(&self) -> String {
        let mut hasher = DefaultHasher::new();
        self.hash(&mut hasher);
        let hash = hasher.finish();
        format!("{hash:016x}")
    }
}

impl Cli {
    fn global() -> &'static Self {
        static CLI: OnceLock<Cli> = OnceLock::new();
        CLI.get_or_init(|| Self::parse())
    }
}

#[derive(Debug, clap::Parser)]
struct Cli {
    #[arg(short, long, default_value = ".cajon.lua")]
    /// Path to the cajon configuration file.
    config_file: PathBuf,
    #[arg(short, long, default_value = "false")]
    /// If using `stateful = true`, destroy and recreate the container.
    recreate: bool,
    #[arg(long, default_value = "false")]
    /// Create an empty .cajon.lua with type hints and an example in the current directory.
    init: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InspectContainerState {
    running: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InspectContainerConfig {
    annotations: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InspectContainer {
    state: InspectContainerState,
    config: InspectContainerConfig,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InspectImageConfig {
    cmd: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InspectImage {
    config: InspectImageConfig,
}

impl Config {
    fn inspect_container(&self) -> Result<Option<InspectContainer>> {
        let mut cmd = Command::new("podman");
        cmd.args(&[
            "container",
            "inspect",
            self.name.as_str(),
            "--format",
            "json",
        ]);

        let output = cmd.output().wrap_err("inspecting container")?;
        let stdout = String::from_utf8(output.stdout)?;

        if output.status.success() == false {
            return Ok(None);
        }

        let mut res: Vec<InspectContainer> =
            serde_json::from_str(&stdout).wrap_err("deserializing output")?;

        let res2 = res.pop();

        return Ok(res2);
    }

    fn inspect_image(&self) -> Result<InspectImage> {
        let mut exists_cmd = Command::new("podman");
        exists_cmd.args(&["image", "exists"]);
        exists_cmd.arg(&self.image);
        exists_cmd.stdout(Stdio::null());
        exists_cmd.stderr(Stdio::null());
        let st = exists_cmd.status()?;

        // Pull image if doesn't exists locally
        if !st.success() {
            let mut cmd = Command::new("podman");
            cmd.args(&["image", "pull"]);
            cmd.arg(&self.image);
            print_command(&cmd);
            let st = cmd.status()?;
            if !st.success() {
                bail!(st);
            }
        }

        let mut cmd = Command::new("podman");
        cmd.args(&["image", "inspect"]);
        cmd.arg(&self.image);
        let output = cmd.output()?;
        if !output.status.success() {
            bail!(output.status);
        }

        let stdout = String::from_utf8(output.stdout)?;
        let mut parsed: Vec<InspectImage> =
            serde_json::from_str(&stdout).wrap_err("parsing image inspect")?;

        let res = parsed.pop().wrap_err("failed getting images")?;

        return Ok(res);
    }

    fn run(&self, image_cmd: &[String]) -> Result<()> {
        let mut cmd = Command::new("podman");

        cmd.args(&[
            "run",
            "--interactive",
            "--tty",
            "--network",
            "host",
            "--init",
            "--privileged",
        ]);

        if !self.stateful {
            cmd.arg("--rm");
        } else {
            cmd.arg("--annotation");
            cmd.arg(format!("cajon.hash={}", self.runtime_hash()));
        }

        if self.mount_cwd {
            cmd.arg("--workdir");
            cmd.arg(&self.workdir);

            let workdir = current_dir()?;
            cmd.arg("--volume");
            cmd.arg(format!("{}:{}", workdir.to_string_lossy(), &self.workdir));
        }

        cmd.arg("--name");
        cmd.arg(&self.name);

        for (k, v) in &self.env {
            cmd.arg("--env");
            cmd.arg(format!("{k}={v}"));
        }

        for flag in &self.extra_flags {
            cmd.arg(flag);
        }

        if self.with_ssh {
            use owo_colors::OwoColorize;
            match std::env::var("SSH_AUTH_SOCK") {
                Err(_) => {
                    eprintln!(
                        "{} with_ssh is enabled, but SSH_AUTH_SOCK is not set",
                        "error:".red()
                    );
                }
                Ok(ssh_auth_sock) => {
                    let new_ssh_auth_sock = "/run/ssh-agent";
                    cmd.arg("--volume");
                    cmd.arg(format!("{ssh_auth_sock}:{new_ssh_auth_sock}"));
                    cmd.arg("--env");
                    cmd.arg(format!("SSH_AUTH_SOCK={new_ssh_auth_sock}"));
                }
            }
        }

        cmd.arg(&self.image);

        if let Some(ref script) = self.script {
            let shell_cmd = format!("{script}\nexec {}", image_cmd.join(" "));
            cmd.args(image_cmd);
            cmd.arg("-c");
            cmd.arg(shell_cmd);
        }

        print_command(&cmd);

        bail!(cmd.exec());
    }

    fn destroy(&self) -> Result<()> {
        let mut cmd = Command::new("podman");
        cmd.args(&["container", "rm", "--force", "--volumes", "--ignore"]);
        cmd.arg(&self.name);

        cmd.stderr(Stdio::null());
        cmd.stdout(Stdio::null());

        print_command(&cmd);
        cmd.status()?;

        Ok(())
    }

    fn start(&self) -> Result<()> {
        let mut cmd = Command::new("podman");
        cmd.args(&["container", "start", "--attach", "--interactive"]);
        cmd.arg(&self.name);
        print_command(&cmd);
        bail!(cmd.exec());
    }

    fn cook(&mut self, final_cmd: Vec<String>) -> Result<()> {
        let cook_script = match self.cook_script.as_deref() {
            None => return Ok(()),
            Some(x) => x,
        };

        let hash = self.cook_hash();
        let final_image = format!("localhost/cajon-{}", hash);

        let mut exists_cmd = Command::new("podman");
        exists_cmd.args(&["image", "exists"]);
        exists_cmd.arg(&final_image);
        exists_cmd.stderr(Stdio::null());
        exists_cmd.stdout(Stdio::null());
        let st = exists_cmd.status()?;
        if st.success() {
            self.image = final_image.clone();
            return Ok(());
        }

        let cooking_name = format!("{}-cook", self.name);

        let mut cook_cmd = Command::new("podman");
        cook_cmd.args(&["run", "--interactive", "--tty", "--replace"]);
        cook_cmd.arg("--name");
        cook_cmd.arg(&cooking_name);
        cook_cmd.arg(&self.image);
        cook_cmd.args(&["/bin/sh", "-c"]);
        cook_cmd.arg(&cook_script);

        print_command(&cook_cmd);
        let st = cook_cmd.status()?;
        if !st.success() {
            bail!(st);
        }

        let final_cmd_json = serde_json::to_string(&final_cmd)?;

        let mut commit_cmd = Command::new("podman");
        commit_cmd.args(&["container", "commit"]);
        commit_cmd.arg("--change");
        commit_cmd.arg(format!("CMD={}", final_cmd_json));
        commit_cmd.arg(&cooking_name);
        commit_cmd.arg(&final_image);
        print_command(&commit_cmd);
        let st = commit_cmd.status()?;
        if !st.success() {
            bail!(st);
        }

        self.image = final_image.clone();

        Ok(())
    }
}

fn main() -> Result<()> {
    color_eyre::install()?;

    let cli = Cli::global();

    if cli.init {
        return init::init();
    }

    let mut config: Config = {
        let contents =
            fs::read_to_string(&cli.config_file).wrap_err("reading configuration file")?;
        let lua = Lua::new();
        lua.from_value(lua.load(contents).eval()?)
            .wrap_err("parsing configuration")?
    };

    if let Some(s) = config.cook_script.as_mut() {
        *s = textwrap::dedent(s.as_str()).trim().to_string();
    }

    if let Some(s) = config.script.as_mut() {
        *s = textwrap::dedent(s.as_str()).trim().to_string();
    }

    let container_inspect = config.inspect_container()?;
    if let Some(ref i) = container_inspect
        && i.state.running
    {
        bail!("Container is already running in other session!");
    }
    let image_inspect = config.inspect_image()?;
    let cmd = image_inspect.config.cmd;
    config.cook(cmd.clone())?;

    if config.stateful && !cli.recreate {
        if let Some(old_container) = container_inspect {
            let new_hash = config.runtime_hash();

            let old_hash = old_container
                .config
                .annotations
                .get("cajon.hash")
                .cloned()
                .unwrap_or(String::new());

            if old_hash == new_hash {
                config.start()?;
            }
        }
    }

    config.destroy()?;
    config.run(&cmd)?;

    Ok(())
}
