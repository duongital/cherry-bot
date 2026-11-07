#!/usr/bin/env node
/**
 * Build and deploy the React client to Cloudflare Pages using the Wrangler CLI.
 *
 * The API URL is read from `apps/server/wrangler.toml` (the single source of
 * truth for the Worker host) so the web app can never be built against a
 * different host than the Worker it talks to.
 *
 * Usage: pnpm deploy:client [--branch <name>]
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = join(root, "apps/client");
const PAGES_PROJECT = "cherry-client";

const toml = readFileSync(join(root, "apps/server/wrangler.toml"), "utf8");
const match = toml.match(/^\s*BETTER_AUTH_URL\s*=\s*"([^"]+)"/m);
if (!match) {
  console.error("Could not read BETTER_AUTH_URL from apps/server/wrangler.toml");
  process.exit(1);
}

const flagIndex = process.argv.indexOf("--branch");
const branch =
  flagIndex !== -1 ? process.argv[flagIndex + 1] : "main";

const env = { ...process.env, VITE_BETTER_AUTH_URL: match[1] };
const run = (command, args) => {
  execFileSync(command, args, { cwd: clientDir, env, stdio: "inherit" });
};

console.log(`Building client with API URL: ${env.VITE_BETTER_AUTH_URL}`);
run("pnpm", ["build"]);
run("pnpm", [
  "exec",
  "wrangler",
  "pages",
  "deploy",
  "dist",
  "--project-name",
  PAGES_PROJECT,
  "--branch",
  branch,
]);
