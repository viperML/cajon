// @ts-check
"use strict";

/** @type {import("prettier").Config} */
const config = {
    trailingComma: "all",
    tabWidth: 4,
    plugins: ["@trivago/prettier-plugin-sort-imports"],
    importOrder: ["^node:", "<THIRD_PARTY_MODULES>", "^[./]"],
    importOrderSeparation: true,
    importOrderSortSpecifiers: true,
    overrides: [
        {
            files: "package-lock.json",
            options: {
                requirePragma: true,
            },
        },
    ],
};

export default config;
