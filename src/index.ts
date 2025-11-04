import { parseArgs } from "@std/cli/parse-args";
import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path/posix";
import { spawn } from "node:child_process";

import { z } from "zod";
import assert from "node:assert";
import { exec } from "node:child_process";

// const args = process.argv.slice(2);
// console.log(args);

// const a = parseArgs(
//     args,
//     {
//         boolean: ["help"]
//     }
// );



const f = path.join(process.cwd(), ".cajon.js")
await fs.stat(f);
const mod = await import(`file://${f}`);

const Module = z.object({
    image: z.string(),
    mountCwd: z.boolean().default(true),
    env: z.object().catchall(z.string()).default({}),
    dockerFlags: z.array(z.string()).default([]),
    command: z.array(z.string()).optional(),
    script: z.string().optional(),
})

const config = Module.parse(mod.default);
console.log(config);

const envFlags = Object.entries(config.env).map(([k, v]) => {
    return ["-e", `${k}=${v}`]
}).flat();

let commandFlags: string[];

if (config.command !== undefined) {
    commandFlags = config.command;
} else if (config.script !== undefined) {
    commandFlags = ["bash", "-lc",
        `${config.script}

exec bash
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
    "docker",
    "run",
    "--interactive",
    "--tty",
    "--rm",
    ...envFlags,
    ...mountCwdFlags,
    ...config.dockerFlags,
    config.image,
    ...commandFlags,
]

console.log(cmd.join(" "));

const proc = spawn(cmd[0]!, cmd.slice(1), {
    stdio: "inherit",
});

proc.on("exit", (code: number | null) => {
    process.exit(code ?? 0);
});
