import { spawn } from "node:child_process";

export async function run(command: string, args: string[]): Promise<number> {
    const proc = spawn(command, args, {
        stdio: "inherit",
    });

    let res = 0;

    proc.on("exit", (code) => {
        if (code !== null) res = code;
    });

    return new Promise((resolve) => {
        proc.on("close", () => {
            resolve(res);
        });
    });
}

export async function exec(command: string, args: string[]): Promise<never> {
    const reattachProc = spawn(command, args, {
        stdio: "inherit",
    });

    reattachProc.on("exit", (code: number | null) => {
        process.exit(code ?? 0);
    });

    await new Promise<void>((resolve) => {
        reattachProc.on("close", () => {
            resolve();
        });
    });

    throw new Error("FIXME");
}

export async function runCapture(
    command: string,
    args: string[],
): Promise<{ stdout: string; stderr: string; exit: number }> {
    const proc = spawn(command, args, {
        stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    let exit = 0;

    proc.stdout.on("data", (data) => {
        stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
        stderr += data.toString();
    });

    proc.on("exit", (code) => {
        exit = code ?? 1;
    });

    return new Promise((resolve) => {
        proc.on("close", () => {
            resolve({ stdout, stderr, exit });
        });
    });
}
