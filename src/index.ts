import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path/posix";
import { spawn } from "node:child_process";
import styles from 'ansi-styles';
import which from "which";

import { z } from "zod";
import { cli } from "cleye";

const args = cli({
    flags: {
        cajonFile: {
            type: String,
            description: "Path to the cajonfile",
            default: ".cajon.js",
            alias: "c"
        }
    }
})


const cajonFile = args.flags.cajonFile;

const mod = await (async () => {
    try {
        let f;
        if (cajonFile.startsWith("/")) {
            f = cajonFile;
        } else {
            f = path.join(process.cwd(), cajonFile);
        }
        await fs.stat(f);
        return await import(`file://${f}`);
    } catch (e) {
        console.log("Error while loading the cajonfile:")
        console.error(e);
        process.exit(1);
    }
})();


const configZ = z.object({
    image: z.string(),
    mountCwd: z.boolean().default(true),
    env: z.object().catchall(z.string()).default({}),
    dockerFlags: z.array(z.string()).default([]),
    cmd: z.array(z.string()).optional(),
    preScript: z.string().optional(),
    volumes: z.array(z.string()).default([]),
    workdir: z.string().default("/mnt"),
});

const config = configZ.parse(mod.default);

const prog = await (async () => {
    const podman = await which("podman", { nothrow: true, });
    if (podman !== null) return podman;
    const docker = await which("docker", { nothrow: true, });
    if (docker !== null) return docker;
    console.error("Error: neither podman nor docker was found in PATH.");
    process.exit(1);
})();

const progArgs: string[] = [
    "run",
    "--interactive",
    "--tty",
    "--rm",
    "--network=host",
];

for (const [k, v] of Object.entries(config.env)) {
    progArgs.push("-e", `${k}=${v}`);
}

if (config.mountCwd) {
    progArgs.push(
        "-v",
        `${process.cwd()}:/mnt`,
        "--workdir",
        config.workdir,
    );
}

for (const volume of config.volumes) {
    progArgs.push(
        "-v",
        volume,
    )
}

progArgs.push(...config.dockerFlags, config.image);

if (args._.length > 0) {
    progArgs.push(...args._.map(String));
} else if (config.cmd) {
    progArgs.push(...config.cmd);
} else if (config.preScript) {
    progArgs.push("bash", "-lc",
        `${config.preScript}
exec $SHELL`)
}


process.stderr.write(`${styles.dim.open}$ ${prog} ${progArgs.join(" ")}${styles.reset.open}\n`);

const proc = spawn(prog, progArgs, {
    stdio: "inherit",
});

proc.on("exit", (code: number | null) => {
    process.exit(code ?? 0);
});
