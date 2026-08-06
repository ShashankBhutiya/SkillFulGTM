import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const config: NextConfig = {
  // nodemailer and node:sqlite must stay outside the bundler.
  serverExternalPackages: ["nodemailer"],
  // Pin the workspace root; an unrelated lockfile higher up the tree would
  // otherwise be inferred as the project root.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};

export default config;
