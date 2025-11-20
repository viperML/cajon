import assert from "node:assert";
import fs from "node:fs/promises";
import { basename } from "node:path";
import path from "node:path/posix";
import process, { exit } from "node:process";

import c from "ansi-colors";
import { cli } from "cleye";
import { z } from "zod";

import * as container from "./container.js";
import { logCmd, logError, logInfo } from "./log.js";
import { exec, run } from "./subprocess.js";

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
        replace: {
            type: Boolean,
            description:
                "Stop and wipe the container, if it was already created",
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
    stateful: z.boolean().default(false),
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

const inspected = await container.inspectContainer(prog, config.name);

const cmd = config.cmd ?? [
    "bash",
    "-l",
    ...(config.preScript
        ? [
              "-c",
              `${config.preScript.trim()}
exec bash -l`,
          ]
        : []),
];

const reattachArgs = ["exec", "--interactive", "--tty", config.name, ...cmd];

async function _reattach(): Promise<never> {
    logInfo("Reattaching to the running container");

    logCmd(prog, reattachArgs);
    return exec(prog, reattachArgs);
}

if (inspected !== "not-found") {
    if (inspected.State.Running) {
        await _reattach();
    } else {
        const restartArgs = ["start", config.name];

        await run(prog, restartArgs);
        await _reattach();
    }
}

const progArgs: string[] = [
    "run",
    "--name",
    config.name,
    "--network=host",
    "--init",
];

if (!config.stateful) {
    progArgs.push("--rm");
}

if (args.flags.background) {
    progArgs.push("--detach", "--annotation", "cajon.background=TRUE");
} else {
    progArgs.push(
        "--interactive",
        "--tty",
        "--annotation",
        "cajon.background=FALSE",
    );
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

if (args.flags.background) {
    progArgs.push(...config.dockerFlags, config.image);
    progArgs.push("tail", "-f", "/dev/null");
} else {
    const cmdHead = cmd.at(0);
    assert(cmdHead !== undefined);
    const cmdTail = cmd.slice(1);
    progArgs.push("--entrypoint", cmdHead);
    progArgs.push(...config.dockerFlags, config.image);
    progArgs.push(...cmdTail);
}

logInfo("Loading cajon");
logCmd(prog, progArgs);

if (args.flags.background) {
    await run(prog, progArgs);
    await _reattach();
} else {
    await exec(prog, progArgs);
}
