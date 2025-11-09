import { mkdir, stat } from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";


const DOWNLOAD_URL = new URL("https://github.com/krallin/tini/releases/download/v0.19.0/tini-static-amd64");

export async function getTini(): Promise<string> {
    const xdgData = process.env["XDG_DATA_HOME"] || path.resolve(process.env["HOME"]!, ".local", "share");
    const cajonDir = path.resolve(xdgData, "cajon");

    try {
        await mkdir(cajonDir);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
    }

    const tiniPath = path.resolve(cajonDir, "tini-static");

    try {
        await stat(tiniPath);
    } catch (e) {
        console.log("Downloading tini...");
        const res = await fetch(DOWNLOAD_URL);
        if (!res.ok) {
            throw new Error(`Failed to download tini: ${res.status} ${res.statusText}`);
        }

        const fileStream = createWriteStream(tiniPath, { mode: 0o755 });
        const buffer = await res.arrayBuffer();
        fileStream.write(Buffer.from(buffer));
        fileStream.end();

        await new Promise<void>((resolve, reject) => {
            fileStream.on('finish', () => resolve());
            fileStream.on('error', reject);
        });
    }

    return tiniPath;
}
