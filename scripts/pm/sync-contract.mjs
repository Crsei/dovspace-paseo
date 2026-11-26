#!/usr/bin/env node
// Generates the PM operation manifest from the PM repository's public OpenAPI
// contract. The adapter never reads PM source at runtime; this script is the
// single bridge between the two repositories.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatedPath = path.join(
  root,
  "packages",
  "pm-integration",
  "src",
  "generated",
  "operations.gen.ts",
);
const baselinePath = path.join(root, "docs", "pm-integration-baseline.json");
const METHODS = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
const SESSION_SCHEMES = new Set(["sessionCookie", "bearerAuth"]);

function parseArgs(argv) {
  const args = { check: false, pmRepo: process.env.PM_REPO };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--check") args.check = true;
    else if (value === "--pm-repo") args.pmRepo = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  args.pmRepo = path.resolve(args.pmRepo ?? path.join(root, "..", "project-management-agent-v4"));
  return args;
}

function git(repo, args) {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function schemaRef(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  if (typeof schema.$ref === "string") {
    const match = /\/schemas\/([^/]+)$/.exec(schema.$ref);
    return match?.[1];
  }
  for (const key of ["oneOf", "anyOf", "allOf"]) {
    const members = schema[key];
    if (!Array.isArray(members)) continue;
    for (const member of members) {
      const ref = schemaRef(member);
      if (ref) return ref;
    }
  }
  return undefined;
}

function contentInfo(content) {
  if (!content || typeof content !== "object") return { type: undefined, schema: undefined };
  const type = Object.keys(content)[0];
  const media = type ? content[type] : undefined;
  return {
    type,
    schema: typeof media?.schema === "string" ? undefined : schemaRef(media?.schema),
  };
}

function authKind(schemes) {
  if (schemes.length === 0) return "public";
  if (schemes.includes("automationExecutionBearer")) return "automation";
  if (schemes.includes("automationSignalSignature")) return "service";
  if (schemes.every((scheme) => SESSION_SCHEMES.has(scheme))) return "session";
  return "mixed";
}

function successStatus(responses) {
  const statuses = Object.keys(responses ?? {}).filter((status) => /^2\d\d$/.test(status));
  statuses.sort((left, right) => Number(left) - Number(right));
  const preferred = statuses.find(
    (status) => status === "200" || status === "201" || status === "204",
  );
  return preferred ?? statuses[0];
}

function parameterNames(operation, location) {
  const names = [];
  for (const parameter of operation.parameters ?? []) {
    if (parameter?.in === location && typeof parameter.name === "string")
      names.push(parameter.name);
  }
  return names;
}

function operationsFrom(document) {
  const operations = [];
  const seen = new Set();
  for (const [route, item] of Object.entries(document.paths ?? {})) {
    if (!item || typeof item !== "object") continue;
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation || typeof operation !== "object") continue;
      const id = operation.operationId;
      if (typeof id !== "string" || id.length === 0)
        throw new Error(`Missing operationId for ${method.toUpperCase()} ${route}`);
      if (seen.has(id)) throw new Error(`Duplicate operationId: ${id}`);
      seen.add(id);
      const security = operation.security ?? document.security ?? [];
      const schemes = [
        ...new Set(security.flatMap((requirement) => Object.keys(requirement ?? {}))),
      ].sort();
      const request = contentInfo(operation.requestBody?.content);
      const status = successStatus(operation.responses);
      const success = contentInfo(operation.responses?.[status]?.content);
      const pathParameters = [
        ...new Set([
          ...parameterNames(operation, "path"),
          ...[...route.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]),
        ]),
      ];
      operations.push({
        id,
        method: method.toUpperCase(),
        path: route,
        auth: authKind(schemes),
        security: schemes,
        pathParams: pathParameters,
        queryParams: parameterNames(operation, "query"),
        request: request.schema ?? null,
        requestType: request.type ?? null,
        success: success.schema ?? null,
        successType: success.type ?? null,
        stream: success.type === "text/event-stream",
      });
    }
  }
  operations.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      METHODS.indexOf(left.method.toLowerCase()) - METHODS.indexOf(right.method.toLowerCase()),
  );
  return operations;
}

function renderModule(document, operations, baseline) {
  const header = [
    "// Generated by scripts/pm/sync-contract.mjs. Do not edit by hand.",
    `// Contract: ${document.info?.title ?? "Project Management API"} ${document.info?.version ?? ""}`.trim(),
    `// PM commit: ${baseline.pmCommit}  OpenAPI sha256: ${baseline.openapiSha256}`,
    "",
  ].join("\n");
  const contract = {
    openapi: document.openapi,
    title: document.info?.title ?? null,
    version: document.info?.version ?? null,
    pmRepo: baseline.pmRepo,
    pmCommit: baseline.pmCommit,
    pmVersion: baseline.pmVersion,
    openapiPath: baseline.openapiPath,
    openapiSha256: baseline.openapiSha256,
    pathCount: baseline.pathCount,
    operationCount: baseline.operationCount,
  };
  const lines = [
    header,
    `export const PM_CONTRACT = ${JSON.stringify(contract, null, 2)} as const;`,
    "",
    'export type PmAuth = "public" | "session" | "automation" | "service" | "mixed";',
    "",
    "export interface PmOperation {",
    "  readonly id: string;",
    "  readonly method: string;",
    "  readonly path: string;",
    "  readonly auth: PmAuth;",
    "  readonly security: readonly string[];",
    "  readonly pathParams: readonly string[];",
    "  readonly queryParams: readonly string[];",
    "  readonly request: string | null;",
    "  readonly requestType: string | null;",
    "  readonly success: string | null;",
    "  readonly successType: string | null;",
    "  readonly stream: boolean;",
    "}",
    "",
    "export const PM_OPERATIONS = [",
    ...operations.map((operation) => `  ${JSON.stringify(operation)},`),
    "] as const satisfies readonly PmOperation[];",
    "",
    'export type PmOperationId = (typeof PM_OPERATIONS)[number]["id"];',
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const openapiPath = path.join(args.pmRepo, "docs", "contracts", "openapi.yaml");
  if (!existsSync(openapiPath)) throw new Error(`PM OpenAPI contract not found at ${openapiPath}`);
  const source = await readFile(openapiPath, "utf8");
  const document = parse(source);
  const operations = operationsFrom(document);
  const pmPackage = JSON.parse(await readFile(path.join(args.pmRepo, "package.json"), "utf8"));
  const baseline = {
    pmRepo: path.basename(args.pmRepo),
    pmCommit: git(args.pmRepo, ["rev-parse", "HEAD"]) ?? "unknown",
    pmVersion: pmPackage.version ?? "unknown",
    openapiPath: "docs/contracts/openapi.yaml",
    openapiVersion: document.info?.version ?? "unknown",
    openapiSha256: createHash("sha256").update(source).digest("hex"),
    pathCount: Object.keys(document.paths ?? {}).length,
    operationCount: operations.length,
  };
  const moduleSource = renderModule(document, operations, baseline);
  const baselineSource = `${JSON.stringify(baseline, null, 2)}\n`;
  const outputs = [
    [generatedPath, moduleSource],
    [baselinePath, baselineSource],
  ];
  if (args.check) {
    const drift = [];
    for (const [file, expected] of outputs) {
      const current = await readFile(file, "utf8").catch(() => undefined);
      if (current !== expected) drift.push(path.relative(root, file));
    }
    if (drift.length > 0) {
      console.error(
        `PM contract drift: ${drift.join(", ")}. Run: node scripts/pm/sync-contract.mjs`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `PM contract is current: ${baseline.operationCount} operations, ${baseline.pathCount} paths, ${baseline.openapiSha256.slice(0, 12)}.`,
    );
    return;
  }
  for (const [file, content] of outputs) {
    await writeFile(file, content);
    console.log(`wrote ${path.relative(root, file)}`);
  }
  console.log(
    `${baseline.operationCount} operations across ${baseline.pathCount} paths from ${baseline.pmCommit}.`,
  );
}

await main();
