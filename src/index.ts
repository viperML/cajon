import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { basename } from "node:path";
import path from "node:path/posix";
import process, { exit } from "node:process";

import c from "ansi-colors";
import { cli } from "cleye";
import { z } from "zod";

import * as container from "./container.js";
import { logError, logInfo } from "./log.js";

const args = cli({
    flags: {
        cajonFile: {
            type: String,
            description: "Path to the cajonfile",
            default: ".cajon.js",
            alias: "c",
        },
        background: {
            type: Boolean,
            description: "Launch the container in the background",
            default: false,
            alias: "b",
        },
        dry: {
            type: Boolean,
            description: "Only print the command to be ran",
            default: false,
            alias: "n",
        },
        reattach: {
            type: Boolean,
            description:
                "If used with --background, also reattach to the background container",
            default: false,
            alias: "r",
        },
    },
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
        logError("Error while loading the cajonFile:");
        (console.log(e), process.exit(1));
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
    workdir: z.string().optional().default("/mnt"),
    name: z.string().default(`cajon--${basename(process.cwd())}`),
});

const config = configZ.parse(mod.default);

const prog = await (async () => {
    const prog = await container.getProg();
    if (prog === undefined) {
        logError("Error: neither podman nor docker was found in PATH.");
        process.exit(1);
    } else {
        return prog;
    }
})();

const running = await container.isRunning(prog, config.name);

const reattachArgs = ["exec", "--interactive", "--tty", config.name, "bash"];

async function _reattach(): Promise<never> {
    logInfo("Reattaching to the running container");
    const reattachProc = spawn(prog, reattachArgs, {
        stdio: "inherit",
    });

    reattachProc.on("exit", (code: number | null) => {
        exit(code ?? 0);
    });

    // Wait for child
    await new Promise<void>((resolve) => {
        reattachProc.on("close", () => {
            resolve();
        });
    });

    throw new Error("Reattach failed");
}

if (running) {
    if (args.flags.reattach) {
        await _reattach();
    } else {
        logInfo(
            `A container with the same name is already running. Attach with the following command, or use cajon --reattach:`,
        );
        process.stderr.write(
            c.bold(`${basename(prog)} ${reattachArgs.join(" ")}`),
        );
    }
    exit(0);
}

const progArgs: string[] = [
    "run",
    "--name",
    config.name,
    "--rm",
    "--network=host",
    "--init",
];

if (args.flags.background) {
    progArgs.push("--detach");
} else {
    progArgs.push("--interactive", "--tty");
}

for (const [k, v] of Object.entries(config.env)) {
    progArgs.push("-e", `${k}=${v}`);
}

if (config.mountCwd) {
    if (config.workdir === undefined) {
        throw new Error(`workdir must be set if mountCwd is true`);
    }
    progArgs.push("-v", `${process.cwd()}:${config.workdir}`);
}

if (config.workdir !== undefined) {
    progArgs.push("--workdir", config.workdir);
}

for (const volume of config.volumes) {
    progArgs.push("-v", volume);
}

progArgs.push(...config.dockerFlags, config.image);

if (args.flags.background) {
    progArgs.push("tail", "--", "-f", "/dev/null");
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
exec $SHELL`,
        );
    }
}

logInfo("Loading cajon");
logInfo(c.dim(`${basename(prog)} ${progArgs.join(" ")}`));

if (!args.flags.dry) {
    const proc = spawn(prog, progArgs, {
        stdio: "inherit",
    });

    // proc.on("exit", (code: number | null) => {
    //     process.exit(code ?? 0);
    // });

    // Wait for child
    await new Promise<void>((resolve) => {
        proc.on("close", () => {
            resolve();
        });
    });
}

if (args.flags.background) {
    if (args.flags.reattach) {
        await _reattach();
    } else {
        logInfo(
            `Container started in background. Attach with the following command:`,
        );
        process.stderr.write(
            c.bold(`${basename(prog)} exec -it ${config.name} bash\n`),
        );
    }
}
