import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path/posix";
import { spawn } from "node:child_process";
import styles from 'ansi-styles';

import { z } from "zod";
import { cli } from "cleye";

const argv = process.argv.slice(2);

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
    command: z.array(z.string()).optional(),
    script: z.string().optional(),
    volumes: z.array(z.string()).default([]),
});

const config = configZ.parse(mod.default);

const envFlags = Object.entries(config.env).map(([k, v]) => {
    return ["-e", `${k}=${v}`]
}).flat();

let commandFlags: string[];

if (config.command !== undefined) {
    commandFlags = config.command;
} else if (config.script !== undefined) {
    commandFlags = ["bash", "-lc",
        `${config.script}

exec $SHELL
`
    ];
} else {
    commandFlags = [];
}

const mountCwdFlags = config.mountCwd ? [
    "-v",
    `${process.cwd()}:/mnt`,
    "--workdir",
    "/mnt"
] : [];

const cmd = [
    "podman",
    "run",
    "--interactive",
    "--tty",
    "--rm",
    "--network=host",
    ...envFlags,
    ...mountCwdFlags,
    ...config.dockerFlags,
    ...(config.volumes.flatMap(x => ["-v", x])),
    config.image,
    ...commandFlags,
]


process.stderr.write(`${styles.dim.open}$ ${cmd.join(" ")}${styles.reset.open}\n`);

const proc = spawn(cmd[0]!, cmd.slice(1), {
    stdio: "inherit",
});

proc.on("exit", (code: number | null) => {
    process.exit(code ?? 0);
});
