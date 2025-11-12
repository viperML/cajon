import assert from "node:assert";

import which from "which";
import { z } from "zod";

import { runCapture } from "./subprocess.js";

export async function getProg(): Promise<string | undefined> {
    const podman = await which("podman", { nothrow: true });
    if (podman !== null) return podman;
    const docker = await which("docker", { nothrow: true });
    if (docker !== null) return docker;
    return undefined;
}

const inspectedContainer = z.object({
    State: z.object({
        Running: z.boolean(),
    }),
    Config: z.object({
        Annotations: z.object({
            "cajon.background": z
                .enum(["TRUE", "FALSE"])
                .transform((val) => val === "TRUE"),
        }),
    }),
});

export type InspectedContainer = z.infer<typeof inspectedContainer>;

export async function inspectContainer(
    prog: string,
    name: string,
): Promise<"not-found" | InspectedContainer> {
    const { stdout, exit } = await runCapture(prog, [
        "container",
        "inspect",
        name,
        "--format",
        "json",
    ]);

    if (exit !== 0) {
        return "not-found";
    } else {
        const j = JSON.parse(stdout);
        const parsed = z.array(inspectedContainer).parse(j).at(0);
        assert(parsed !== undefined);
        return parsed;
    }
}
