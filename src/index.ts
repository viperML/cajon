import process, { exit } from "node:process";
import fs from "node:fs/promises";
import path from "node:path/posix";
import { spawn } from "node:child_process";
import styles from "ansi-styles";
import which from "which";
import * as container from "./container.js";
import { basename } from "node:path";

import { z } from "zod";
import { cli } from "cleye";
import { getTini } from "./tini.js";

const args = cli({
    flags: {
        cajonFile: {
            type: String,
            description: "Path to the cajonfile",
            default: ".cajon.js",
            alias: "c"
        },
        background: {
            type: Boolean,
            description: "Launch the container in the background",
            default: false,
            alias: "b"
        },
        dry: {
            type: Boolean,
            description: "Only print the command to be ran",
            default: false,
            alias: "n"
        }
    }
});

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
        console.log("Error while loading the cajonfile:");
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
    name: z.string().default(`cajon--${basename(process.cwd())}`)
});

const config = configZ.parse(mod.default);

const prog = await (async () => {
    const prog = await container.getProg();
    if (prog === undefined) {
        console.error("Error: neither podman nor docker was found in PATH.");
        process.exit(1);
    } else {
        return prog;
    }
})();

const running = await container.isRunning(prog, config.name);

if (running) {
    console.info(
        `A container with the same name is already running. Attach with the following command:`
    );
    process.stdout.write(
        `${styles.bold.open}${basename(prog)} exec -it ${config.name} bash\n`
    );
    exit(0);
}

const tini = args.flags.background ? await getTini() : undefined;

const progArgs: string[] = [
    "run",
    "--name",
    config.name,
    "--rm",
    "--network=host"
];

if (tini !== undefined) {
    progArgs.push("-d", "-v", `${tini}:/tini:ro`);
} else {
    progArgs.push("--interactive", "--tty");
}

for (const [k, v] of Object.entries(config.env)) {
    progArgs.push("-e", `${k}=${v}`);
}

if (config.mountCwd) {
    progArgs.push("-v", `${process.cwd()}:/mnt`, "--workdir", config.workdir);
}

for (const volume of config.volumes) {
    progArgs.push("-v", volume);
}

progArgs.push(...config.dockerFlags, config.image);

if (tini !== undefined) {
    progArgs.push("/tini", "tail", "--", "-f", "/dev/null");
} else {
    if (args._.length > 0) {
        progArgs.push(...args._.map(String));
    } else if (config.cmd) {
        progArgs.push(...config.cmd);
    } else if (config.preScript) {
        progArgs.push(
            "bash",
            "-lc",
            `${config.preScript}
exec $SHELL`
        );
    }
}

process.stderr.write(
    `${styles.dim.open}$ ${basename(prog)} ${progArgs.join(" ")}${styles.reset.open}\n`
);

if (!args.flags.dry) {
    const proc = spawn(prog, progArgs, {
        stdio: "inherit"
    });

    proc.on("exit", (code: number | null) => {
        process.exit(code ?? 0);
    });
}

if (args.flags.background) {
    process.stderr.write(
        `Container started in background. Attach with the following command:`
    );
    process.stdout.write(
        `${styles.bold.open}${basename(prog)} exec -it ${config.name} bash${styles.bold.close}\n`
    );
}
