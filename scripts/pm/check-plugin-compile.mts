#!/usr/bin/env node
// Compiles the built-in PM plugin with the daemon's real plugin compiler. This
// catches host-module boundary violations that a plain tsc pass cannot see.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileDirectoryPlugin } from "../../packages/server/src/server/plugins/compiler-build.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const directory = path.join(root, "plugins", "dovspace-pm");
const result = await compileDirectoryPlugin(directory, "0.17.4", "dovspace-pm");
if (!result.clientBundle) throw new Error("dovspace-pm compiled without a client bundle");
if (!result.serverBundle) throw new Error("dovspace-pm compiled without a server bundle");
console.log(
  `dovspace-pm compiled: client ${(result.clientBundle.length / 1024).toFixed(1)} KiB, server ${(result.serverBundle.length / 1024).toFixed(1)} KiB.`,
);
