import c from "ansi-colors";
import { basename } from "node:path";

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
    logInfo(c.dim(`${basename(command)} ${args.join(" ")}`));
}
