import { spawn } from "node:child_process";
import which from "which";

export async function getProg(): Promise<string | undefined> {
    const podman = await which("podman", { nothrow: true });
    if (podman !== null) return podman;
    const docker = await which("docker", { nothrow: true });
    if (docker !== null) return docker;
    return undefined;
}

export async function isRunning(prog: string, name: string) {
    return new Promise<boolean>((resolve) => {
        const inspect = spawn(
            prog,
            ["container", "inspect", name, "--format", "{{.State.Running}}"],
            { stdio: "pipe" }
        );
        let output = "";
        inspect.stdout.on("data", (data) => {
            output += data.toString();
        });
        inspect.on("close", (code) => {
            if (code === 0) {
                resolve(output.trim() === "true");
            } else {
                resolve(false);
            }
        });
    });
}
