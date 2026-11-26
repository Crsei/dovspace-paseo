#!/usr/bin/env node
// Live reachability probe for every operation in the PM OpenAPI contract.
//
// Reads are sent with the configured session; writes are sent without
// credentials and with an empty body so PM rejects them before any mutation.
// A 404 counts as reachable only when it carries PM's error envelope; Fastify's
// route-missing 404 is reported as a contract failure.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PM_CONTRACT,
  PM_OPERATIONS,
  type PmOperation,
} from "../../packages/pm-integration/src/generated/operations.gen.js";
import { PmTransport } from "../../packages/pm-integration/src/http.js";

interface ProbeResult {
  id: string;
  method: string;
  path: string;
  auth: string;
  status: number | null;
  reachable: boolean;
  skipped: boolean;
  note?: string;
}

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index]!;
  if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
  args.set(value.slice(2), process.argv[++index] ?? "");
}

const baseUrl =
  args.get("base-url") ?? process.env.PM_INTEGRATION_BASE_URL ?? "http://127.0.0.1:3225";
const token = args.get("token") ?? process.env.PM_INTEGRATION_TOKEN;
const cookie = args.get("cookie") ?? process.env.PM_INTEGRATION_COOKIE;
const workspaceId =
  args.get("workspace") ??
  process.env.PM_INTEGRATION_WORKSPACE ??
  "00000000-0000-4000-8000-000000000000";
const concurrency = Math.max(1, Math.min(16, Number(args.get("concurrency") ?? 6)));
const outputPath = args.get("json");
const TIMEOUT_MS = 10_000;

const authenticated = new PmTransport({
  baseUrl,
  token,
  cookie,
  origin: args.get("origin"),
  timeoutMs: TIMEOUT_MS,
});
const anonymous = new PmTransport({ baseUrl, timeoutMs: TIMEOUT_MS });

function fillPath(operation: PmOperation): string {
  return operation.path.replace(/\{([^}]+)\}/g, (_, name: string) =>
    encodeURIComponent(
      name === "workspaceId" ? workspaceId : "00000000-0000-4000-8000-000000000000",
    ),
  );
}

function isPmEnvelope(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && "error" in value && "requestId" in value;
}

function isFastifyRouteMiss(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.statusCode === 404 &&
    typeof record.message === "string" &&
    /route\s+.*not found/i.test(record.message)
  );
}

async function readCapped(response: Response, limit = 4096): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length >= limit) break;
    }
    text += decoder.decode();
    return text.slice(0, limit);
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function probe(operation: PmOperation): Promise<ProbeResult> {
  const isRead = operation.method === "GET" || operation.method === "HEAD";
  const transport = isRead && !operation.stream ? authenticated : anonymous;
  const body = isRead || operation.stream ? undefined : {};
  try {
    const response = await transport.raw({
      method: operation.method,
      path: fillPath(operation),
      body,
      timeoutMs: operation.stream ? 2_500 : TIMEOUT_MS,
      signal: operation.stream ? AbortSignal.timeout(2_500) : undefined,
    });
    const text = await readCapped(response);
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    if (response.status === 404 && isFastifyRouteMiss(parsed)) {
      return {
        id: operation.id,
        method: operation.method,
        path: operation.path,
        auth: operation.auth,
        status: 404,
        reachable: false,
        skipped: false,
        note: "route not registered",
      };
    }
    if (response.status === 404 && !isPmEnvelope(parsed)) {
      return {
        id: operation.id,
        method: operation.method,
        path: operation.path,
        auth: operation.auth,
        status: 404,
        reachable: false,
        skipped: false,
        note: "404 without PM error envelope",
      };
    }
    return {
      id: operation.id,
      method: operation.method,
      path: operation.path,
      auth: operation.auth,
      status: response.status,
      reachable: true,
      skipped: false,
    };
  } catch (error) {
    // A stream that was accepted then aborted is still a reachable route.
    if (
      operation.stream &&
      error instanceof Error &&
      !error.message.startsWith("PM request failed before a response")
    ) {
      return {
        id: operation.id,
        method: operation.method,
        path: operation.path,
        auth: operation.auth,
        status: null,
        reachable: true,
        skipped: false,
        note: "stream accepted then closed by probe",
      };
    }
    return {
      id: operation.id,
      method: operation.method,
      path: operation.path,
      auth: operation.auth,
      status: null,
      reachable: false,
      skipped: false,
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function pool<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await work(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

const started = Date.now();
const results = await pool(PM_OPERATIONS, concurrency, probe);
const missing = results.filter((result) => !result.reachable);
const report = {
  baseUrl,
  contract: PM_CONTRACT,
  authenticated: Boolean(token || cookie),
  durationMs: Date.now() - started,
  operationCount: results.length,
  reachableCount: results.length - missing.length,
  missingCount: missing.length,
  byStatus: Object.fromEntries(
    [...new Set(results.map((result) => String(result.status)))]
      .sort()
      .map((status) => [
        status,
        results.filter((result) => String(result.status) === status).length,
      ]),
  ),
  missing,
  results,
};

if (outputPath) {
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${path.relative(process.cwd(), path.resolve(outputPath))}`);
}

console.log(
  `${report.reachableCount}/${report.operationCount} operations reachable at ${baseUrl} in ${report.durationMs}ms (authenticated=${report.authenticated}).`,
);
console.log(`statuses: ${JSON.stringify(report.byStatus)}`);
if (missing.length > 0) {
  for (const result of missing)
    console.error(
      `MISSING ${result.method} ${result.path} (${result.id}) status=${result.status} ${result.note ?? ""}`,
    );
  process.exitCode = 1;
}
