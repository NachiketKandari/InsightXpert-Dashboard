import type { NextConfig } from "next";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const configDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: configDir,
    resolveAlias: {
      tailwindcss: join(configDir, "node_modules", "tailwindcss"),
    },
  },
};

export default nextConfig;
