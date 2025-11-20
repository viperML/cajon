import { basename } from "node:path";

import c from "ansi-colors";

const logo = c.blue("#");

export function logInfo(...what: string[]) {
    process.stderr.write(`${logo} `);
    for (const w of what) {
        process.stderr.write(w);
    }
    process.stderr.write("\n");
}

export function logError(...what: string[]) {
    logInfo(...what.map(c.red));
}

export function logCmd(command: string, args: string[]) {
    const _args = args.map((a) => (a.includes(" ") ? `"${a}"` : a));
    console.log(JSON.stringify(_args));
    logInfo(c.dim(`${basename(command)} ${_args.join(" ")}`));
}
