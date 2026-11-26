#!/usr/bin/env node
// Clones or refreshes the sibling PM repository and records the integration
// baseline. The GitHub token is only passed through an HTTP header for this
// process; it never enters the remote URL, argv, or recorded files.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const repoUrl = "https://github.com/Crsei/project-management-agent-v4.git";
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
  args.set(value.slice(2), process.argv[++index] ?? "");
}

const destination = path.resolve(
  args.get("dest") ?? path.join(root, "..", "project-management-agent-v4"),
);
const tokenFile = path.resolve(
  args.get("token-file") ?? path.join(root, "..", "..", "github_token.txt"),
);
const branch = args.get("branch") ?? "main";
const token = existsSync(tokenFile) ? (await readFile(tokenFile, "utf8")).trim() : undefined;
if (!token) console.warn(`No GitHub token at ${tokenFile}; continuing with anonymous Git access.`);

function redact(value) {
  return token ? value.split(token).join("***") : value;
}

function git(gitArgs, dryRun = false) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  if (token) {
    // GitHub accepts a bearer token in the extra header for HTTPS.
    const encoded = Buffer.from(`x-access-token:${token}`).toString("base64");
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.extraheader";
    env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${encoded}`;
  }
  try {
    return execFileSync("git", gitArgs, {
      cwd: destination,
      env,
      encoding: "utf8",
      stdio: dryRun ? "pipe" : ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr = redact(String(error.stderr ?? error.message ?? error));
    throw new Error(`git ${gitArgs.join(" ")} failed:\n${stderr}`, { cause: error });
  }
}

if (!existsSync(path.join(destination, ".git"))) {
  console.log(`Cloning ${repoUrl} → ${destination}`);
  execFileSync("git", ["clone", "--branch", branch, repoUrl, destination], {
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      ...(token
        ? {
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "http.extraheader",
            GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
          }
        : {}),
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
} else {
  console.log(`Refreshing ${destination}`);
  git(["fetch", "origin", branch]);
}

const head = git(["rev-parse", "HEAD"]);
let originHead;
try {
  originHead = git(["rev-parse", `origin/${branch}`]);
} catch {
  originHead = undefined;
}
const status = git(["status", "--porcelain"]);
const dirtyFiles = status ? status.split("\n").filter(Boolean).length : 0;
const openapiPath = path.join(destination, "docs", "contracts", "openapi.yaml");
if (!existsSync(openapiPath)) throw new Error(`Missing PM OpenAPI contract at ${openapiPath}`);
const openapi = await readFile(openapiPath, "utf8");
const pmPackage = JSON.parse(await readFile(path.join(destination, "package.json"), "utf8"));
const openapiVersion = /^info:\s*$[\s\S]*?^\s{2}version:\s*"?([^"\n]+)"?$/m
  .exec(openapi)?.[1]
  ?.trim();

execFileSync(
  process.execPath,
  [path.join(root, "scripts", "pm", "sync-contract.mjs"), "--pm-repo", destination],
  { stdio: "inherit" },
);
execFileSync(process.execPath, [path.join(root, "scripts", "pm", "sync-plugin-vendor.mjs")], {
  stdio: "inherit",
});

const record = {
  repoUrl,
  path: path.relative(root, destination),
  branch,
  head,
  originHead: originHead ?? null,
  ahead: originHead ? git(["rev-list", "--count", `${originHead}..HEAD`]) : null,
  behind: originHead ? git(["rev-list", "--count", `HEAD..${originHead}`]) : null,
  dirtyFiles,
  paseoCommit: git(root, ["rev-parse", "HEAD"]) ?? null,
  pmVersion: pmPackage.version,
  openapiVersion: openapiVersion ?? null,
  openapiSha256: createHash("sha256").update(openapi).digest("hex"),
  recordedAt: new Date().toISOString(),
};
const recordPath = path.join(root, "docs", "pm-integration-clone.json");
await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(
  `Recorded ${path.relative(root, recordPath)}: ${head.slice(0, 12)} (dirty files: ${dirtyFiles}).`,
);
if (originHead && originHead !== head)
  console.log(`origin/${branch} is at ${originHead.slice(0, 12)}; local checkout was not changed.`);
