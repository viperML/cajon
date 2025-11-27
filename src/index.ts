import assert from "node:assert";
import fs from "node:fs/promises";
import { basename } from "node:path";
import path from "node:path/posix";
import process, { cwd, exit } from "node:process";

import c from "ansi-colors";
import { cli } from "cleye";
import { z } from "zod";

import * as container from "./container.js";
import { logCmd, logError, logInfo } from "./log.js";
import { loadProfile } from "./profile.js";
import { exec, run } from "./subprocess.js";

const args = cli({
    parameters: ["[image]"],
    flags: {
        cajonFile: {
            type: String,
            description: "Path to the cajonfile",
            default: ".cajon.js",
            alias: "c",
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

const configZ = z.strictObject({
    image: z.string(),
    mountCwd: z.boolean().default(true),
    env: z.object().catchall(z.string()).default({}),
    dockerFlags: z.array(z.string()).default([]),
    cmd: z.array(z.string()).optional(),
    preScript: z.string().optional(),
    cookScript: z.string().optional(),
    volumes: z.array(z.string()).default([]),
    workdir: z.string().optional().default("/mnt"),
    name: z.string().default(`cajon--${basename(process.cwd())}`),
    stateful: z.boolean().default(false),
    withNix: z.boolean().default(true),
    background: z.boolean().default(false),
});

const config: z.infer<typeof configZ> = await (async () => {
    if (args._.image !== undefined) {
        return configZ.parse({
            image: args._.image,
        });
    } else {
        try {
            let f;
            if (cajonFile.startsWith("/")) {
                f = cajonFile;
            } else {
                f = path.join(process.cwd(), cajonFile);
            }
            await fs.stat(f);
            const mod = await import(`file://${f}`);
            return configZ.parse(mod.default);
        } catch (e) {
            logError("Error while loading the cajonFile:");
            (console.log(e), process.exit(1));
        }
    }
})();

if (config.cookScript !== undefined) {
    config.background = true;
}

const prog = await (async () => {
    const prog = await container.getProg();
    if (prog === undefined) {
        logError("Error: neither podman nor docker was found in PATH.");
        process.exit(1);
    } else {
        return prog;
    }
})();

let inspected = await container.inspectContainer(prog, config.name);

if (inspected !== "not-found" && args.flags.replace) {
    const removeArgs = ["rm", "-f", config.name];
    logInfo("Wiping existing container");
    logCmd(prog, removeArgs);
    await run(prog, removeArgs);
    inspected = "not-found";
}

const cmd: string[] = (() => {
    if (config.cmd) return config.cmd;
    else if (config.withNix) {
        const shell = process.env["SHELL"];
        assert(shell !== undefined);
        return [shell, "-l"];
    } else if (config.preScript) {
        return [
            "bash",
            "-lc",
            `${config.preScript.trim()}
exec bash -l`,
        ];
    } else {
        return ["bash", "-l"];
    }
})();

const reattachArgs = ["exec", "--interactive", "--tty", config.name, ...cmd];

async function _reattach(): Promise<never> {
    logInfo("Reattaching to the running container");

    logCmd(prog, reattachArgs);
    return exec(prog, reattachArgs);
}

const COOKED_MARKER = "/cajon-cooked";

async function _checkIfCooked(): Promise<boolean> {
    const checkArgs = ["exec", config.name, "test", "-f", COOKED_MARKER];
    try {
        logCmd(prog, checkArgs);
        const code = await run(prog, checkArgs);
        return code === 0;
    } catch {
        return false;
    }
}

async function _cook(): Promise<void> {
    assert(config.cookScript !== undefined);
    logInfo("Cooking image...");
    const cookArgs = [
        "exec",
        "--interactive",
        "--tty",
        config.name,
        "bash",
        "-exc",
        `${config.cookScript.trim()}
touch ${COOKED_MARKER}`,
    ];
    logCmd(prog, cookArgs);
    try {
        const code = await run(prog, cookArgs);
        if (code !== 0) {
            throw new Error(`Cook script failed with exit code ${code}`);
        }
    } catch (e) {
        logError("Cook script failed");
        process.exit(1);
    }
    logInfo("Cook script completed");
}

if (inspected !== "not-found") {
    if (!inspected.State.Running) {
        const restartArgs = ["start", config.name];
        await run(prog, restartArgs);
    }

    // Check if we need to cook
    if (config.cookScript !== undefined) {
        const isCooked = await _checkIfCooked();
        if (!isCooked) {
            await _cook();
        }
    }

    await _reattach();
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

if (config.background) {
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

if (config.withNix) {
    const profile = await loadProfile();

    progArgs.push(
        "-v",
        "/nix:/nix:ro",
        "-v",
        "/run/current-system:/run/current-system:ro",
        "-e",
        "NIX_PROFILES",

        "-v",
        `${profile}:/etc/profile.d/zz_cajon.sh:ro`,
    );
}

for (const volume of config.volumes) {
    progArgs.push("-v", volume);
}

if (config.background) {
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

if (config.background) {
    await run(prog, progArgs);

    const needsCooking = await _checkIfCooked();
    if (needsCooking) {
        await _cook();
    }

    await _reattach();
} else {
    await exec(prog, progArgs);
}
