use owo_colors::OwoColorize;
use std::process::Command;

pub(crate) fn print_command(cmd: &Command) {
    let mut res = String::new();
    res.push_str(&format!("{} ", "$".blue()));
    res.push_str(&format!(
        "{}",
        cmd.get_program().to_string_lossy().bright_black()
    ));

    for arg in cmd.get_args() {
        let mut a = arg.to_string_lossy().to_string();
        if a.contains('\n') {
            a = serde_json::to_string(&a).unwrap();
        }
        res.push_str(&format!(" {}", a.bright_black()));
    }

    println!("{}", res);
}
