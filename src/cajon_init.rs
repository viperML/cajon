use color_eyre::Result;
use std::{os::unix::process::CommandExt, path::PathBuf, process::Command};

use libc::getuid;

pub(crate) fn init() {
    if std::env::var("XDG_RUNTIME_DIR").is_err() {
        let id = unsafe { getuid() };
        let runtime_dir = PathBuf::from("/run").join("user").join(format!("{id}"));
        let res = std::fs::create_dir_all(&runtime_dir);
        if let Err(e) = res {
            eprintln!("[cajon-init] Failed to create XDG_RUNTIME_DIR: {e}");
        } else {
            unsafe {
                std::env::set_var("XDG_RUNTIME_DIR", runtime_dir.to_str().unwrap());
            }
        }
    }

    let mut args = std::env::args_os();
    args.next().unwrap();

    let mut cmd: Command;

    match args.next() {
        None => {
            let cajon_cmd =
                std::env::var("CAJON_CMD").expect("No arguments, and CAJON_CMD is empty");

            let mut cajon_cmd: Vec<String> =
                serde_json::from_str(&cajon_cmd).expect("Failed to deserialize CAJON_CMD");

            cmd = Command::new(cajon_cmd.pop().unwrap());
            for arg in cajon_cmd {
                cmd.arg(arg);
            }
        }
        Some(argv0) => {
            cmd = Command::new(argv0);
            for arg in args {
                cmd.arg(arg);
            }
        }
    }

    let err = cmd.exec();
    panic!("Failed to exec: {err}");
}

pub(crate) fn load_cajon_init() -> Result<PathBuf> {
    let selfprog = std::env::current_exe()?;

    return Ok(selfprog);
}
