import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@wallet\/contracts$/,
        replacement: fileURLToPath(
          new URL("./packages/contracts/src/common.ts", import.meta.url),
        ),
      },
      {
        find: /^@wallet\/contracts\/(.+)$/,
        replacement: fileURLToPath(
          new URL("./packages/contracts/src/$1.ts", import.meta.url),
        ),
      },
    ],
  },
  test: {
    include: [
      "api/src/**/*.test.ts",
      "packages/contracts/src/**/*.test.ts",
      "web/src/**/*.test.tsx",
    ],
    environment: "node",
  },
});
