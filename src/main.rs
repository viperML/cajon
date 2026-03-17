use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

use clap::Parser;
use color_eyre::Result;
use color_eyre::eyre::Context;
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

#[derive(Debug, Deserialize)]
struct Config {
    image: String,
    #[serde(default = "default_true")]
    mount_cwd: bool,
    #[serde(default)]
    env: HashMap<String, String>,
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
    annotations: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InspectOutput {
    state: InspectState,
    config: InspectConfig,
}

fn inspect_container(config: &Config) -> Result<Option<InspectOutput>> {
    let mut cmd = Command::new("podman");
    cmd.args(&[
        "container",
        "inspect",
        config.name.as_str(),
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

fn main() -> Result<()> {
    color_eyre::install()?;

    let cli = Cli::global();

    let config: Config = {
        let contents =
            fs::read_to_string(&cli.config_file).wrap_err("reading configuration file")?;
        let lua = Lua::new();
        lua.from_value(lua.load(contents).eval()?)
            .wrap_err("parsing configuration")?
    };

    println!("{config:#?}");

    let inspect = inspect_container(&config)?;
    println!("{inspect:#?}");

    Ok(())
}
