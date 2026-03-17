use std::env::current_dir;
use std::fs;

use color_eyre::Result;
use color_eyre::eyre::Context;
use color_eyre::eyre::bail;

const INIT_TEMPLATE: &str = r#"--- @meta

--- @class Config
--- @field image string                  Image to use.
--- @field mount_cwd boolean|nil         Mount the current working directory into the container. (default: true)
--- @field workdir string|nil            Working directory inside the container. (default: "/mnt")
--- @field name string|nil               Container name. (default: derived from directory name)
--- @field stateful boolean|nil          Keep the container state between runs. (default: false)
--- @field env table<string,string>|nil  Environment variables to pass into the container.
--- @field volumes string[]|nil          Additional volume mounts in "host:container" format.
--- @field script string|nil             Shell script to run inside the container before the default command.
--- @field cook_script string|nil        Shell script to use to cook the container.
--- @field extra_flags string[]|nil      Extra flags to pass verbatim.

--- @type Config
return {
  image = "docker.io/library/fedora:latest",
}
"#;

pub fn init() -> Result<()> {
    let dest = current_dir()?.join(".cajon.lua");
    if dest.exists() {
        bail!(".cajon.lua already exists in the current directory");
    }
    fs::write(&dest, INIT_TEMPLATE).wrap_err("writing .cajon.lua")?;
    println!("Created {}", dest.display());
    Ok(())
}
