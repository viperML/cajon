use std::collections::BTreeMap;
use std::collections::HashMap;
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
use color_eyre::eyre::bail;
use mlua::LuaSerdeExt;
use mlua::prelude::*;
use serde::Deserialize;

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
    extra_flags: Option<String>,
    #[serde(default)]
    stateful: bool,
    #[serde(default = "default_workdir")]
    workdir: String,
    #[serde(default = "default_name")]
    name: String,
}

impl Config {
    fn hash_str(&self) -> String {
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
    /// Path to the cajon configuration file
    config_file: PathBuf,
}

fn print_command(cmd: &Command) {
    let mut info = cmd.get_program().to_owned();
    for arg in cmd.get_args() {
        info.push(" ");
        info.push(arg);
    }
    println!("$ {}", info.to_string_lossy());
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InspectState {
    running: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InspectConfig {
    cmd: String,
    annotations: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InspectOutput {
    state: InspectState,
    config: InspectConfig,
}

impl Config {
    fn inspect_container(&self) -> Result<Option<InspectOutput>> {
        let mut cmd = Command::new("podman");
        cmd.args(&[
            "container",
            "inspect",
            self.name.as_str(),
            "--format",
            "json",
        ]);

        print_command(&cmd);

        let output = cmd.output().wrap_err("inspecting container")?;
        let stdout = String::from_utf8(output.stdout)?;

        if output.status.success() == false {
            return Ok(None);
        }

        let mut res: Vec<InspectOutput> =
            serde_json::from_str(&stdout).wrap_err("deserializing output")?;

        let res2 = res.pop();

        return Ok(res2);
    }

    fn run(&self) -> Result<()> {
        let mut cmd = Command::new("podman");

        cmd.args(&["run", "--interactive", "--tty"]);

        if !self.stateful {
            cmd.arg("--rm");
        }

        cmd.arg("--workdir");
        cmd.arg(&self.workdir);

        let hash = self.hash_str();
        cmd.arg("--annotation");
        cmd.arg(format!("cajon.hash={hash}"));

        cmd.arg("--name");
        cmd.arg(&self.name);

        cmd.arg(&self.image);

        print_command(&cmd);

        bail!(cmd.exec());
    }

    fn attach(&self) -> Result<()> {
        let mut cmd = Command::new("podman");
        cmd.args(&["exec", "--interactive", "--tty"]);
        cmd.arg(&self.name);
        cmd.arg("/bin/sh");
        print_command(&cmd);
        bail!(cmd.exec());
    }

    fn start(&self) -> Result<()> {
        let mut cmd = Command::new("podman");
        cmd.args(&["start", "--attach", "--interactive"]);
        cmd.arg(&self.name);
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

    fn cook(&self) -> Result<()> {
        let cook_script = self
            .cook_script
            .as_deref()
            .expect("cook called without cook_script");

        let mut cmd = Command::new("podman");
        cmd.args(&["run", "--name"]);
        cmd.arg(&self.name);

        let hash = self.hash_str();
        cmd.arg("--annotation");
        cmd.arg(format!("cajon.hash={hash}"));

        cmd.arg("--workdir");
        cmd.arg(&self.workdir);

        cmd.arg(&self.image);
        cmd.args(&["/bin/sh", "-c"]);
        cmd.arg(cook_script);

        print_command(&cmd);
        cmd.status().wrap_err("running cook script")?;

        self.start()
    }
}

fn main() -> Result<()> {
    color_eyre::install()?;

    let cli = Cli::global();

    let mut config: Config = {
        let contents =
            fs::read_to_string(&cli.config_file).wrap_err("reading configuration file")?;
        let lua = Lua::new();
        lua.from_value(lua.load(contents).eval()?)
            .wrap_err("parsing configuration")?
    };

    config.stateful = config.stateful || config.cook_script.is_some();
    if let Some(s) = config.cook_script.as_mut() {
        *s = textwrap::dedent(s.as_str()).trim().to_string();
    }

    if !config.stateful {
        config.destroy()?;
        return config.run();
    }

    let inspect = config.inspect_container()?;
    let new_hash = config.hash_str();

    let old_hash = inspect
        .as_ref()
        .and_then(|o| o.config.annotations.get("cajon.hash"))
        .map(String::as_str)
        .unwrap_or("");

    let container_valid = inspect.is_some() && old_hash == new_hash;

    if config.cook_script.is_some() && !container_valid {
        config.destroy()?;
        return config.cook();
    }

    if !container_valid {
        config.destroy()?;
        return config.run();
    }

    let o = inspect.as_ref().unwrap();
    if o.state.running {
        config.attach()
    } else {
        config.start()
    }
}
