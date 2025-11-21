import fs from "node:fs/promises";

const profileText = `
# shellcheck shell=sh

if [ -n "\${NIX_PROFILES-}" ]; then
    for profile in $NIX_PROFILES; do
        for_path="$profile/bin"
        if [ -d "$for_path" ]; then
            PATH="$PATH:$for_path"
        fi

        for_data="$profile/share"
        if [ -d "$for_data" ]; then
            if [ -n "\${XDG_DATA_DIRS-}" ]; then
                XDG_DATA_DIRS="$XDG_DATA_DIRS:$for_data"
            else
                XDG_DATA_DIRS="$for_data"
            fi
        fi
    done
fi

`;

export async function loadProfile(): Promise<string> {
    const dest = "/dev/shm/cajon-profile.sh";

    try {
        await fs.stat(dest);
    } catch {
        await fs.writeFile(dest, profileText);
        await fs.chmod(dest, 0o644);
    }

    return dest;
}
