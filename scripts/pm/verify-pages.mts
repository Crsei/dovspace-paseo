#!/usr/bin/env node
// Route matrix for every production PM page. Creates a dedicated PM test
// account on first run (isolated dev database only), then drives Chromium with
// the PM session cookie. Fails on route 404s, bootstrap failures, the login
// wall, and the PM not-found page.
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { PM_PAGES, type PmPageDefinition } from "../../packages/pm-integration/src/pages.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index]!;
  if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(value.slice(2), next);
    index += 1;
  } else args.set(value.slice(2), "true");
}

const baseUrl = (
  args.get("base-url") ??
  process.env.PM_INTEGRATION_BASE_URL ??
  "http://127.0.0.1:3225"
).replace(/\/$/, "");
const pmRepo = path.resolve(
  args.get("pm-repo") ?? path.join(root, "..", "project-management-agent-v4"),
);
const sessionPath = path.join(root, "artifacts", "pm-test-session.json");
const reportPath = path.join(root, "artifacts", "pm-pages-report.json");
const screenshotDir = path.join(root, "artifacts", "pm-pages");
const email = args.get("email") ?? process.env.PM_TEST_EMAIL;
const password = args.get("password") ?? process.env.PM_TEST_PASSWORD;
const only = args.get("only");

interface TestSession {
  email: string;
  password: string;
  cookie: string;
  actorId: string;
  workspaceId: string;
  projectId: string | null;
  entityId: string | null;
}

interface PageResult {
  id: string;
  route: string;
  url: string;
  status: "passed" | "failed" | "skipped";
  httpStatus: number | null;
  durationMs: number;
  reason?: string;
  pageErrors: string[];
  screenshot?: string;
}

async function request(
  pathname: string,
  init: { method?: string; body?: unknown; cookie?: string; idempotencyKey?: string } = {},
): Promise<Response> {
  return fetch(`${baseUrl}${pathname}`, {
    method: init.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...(init.idempotencyKey ? { "idempotency-key": init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function json<T>(
  pathname: string,
  init: { method?: string; body?: unknown; cookie?: string; idempotencyKey?: string } = {},
): Promise<{ status: number; body: T }> {
  const response = await request(pathname, init);
  const body = (await response.json().catch(() => undefined)) as T;
  return { status: response.status, body };
}

function sessionCookie(response: Response): string | undefined {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  return cookies
    .map((cookie) => cookie.split(";", 1)[0] ?? "")
    .find((cookie) => cookie.startsWith("pm_v4_session="));
}

async function login(
  address: string,
  secret: string,
): Promise<{ cookie: string; actorId: string }> {
  const response = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email: address, password: secret },
  });
  if (!response.ok)
    throw new Error(`PM login failed: HTTP ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { actor?: { id?: string } };
  const cookie = sessionCookie(response);
  if (!cookie || typeof body.actor?.id !== "string")
    throw new Error("PM login did not return a session cookie and actor");
  return { cookie, actorId: body.actor.id };
}

async function createAccount(): Promise<{ email: string; password: string }> {
  const address = `pm-integration-verify-${Date.now()}@example.test`;
  const output = execFileSync(
    process.execPath,
    [
      "--env-file=.env",
      "scripts/create-account.ts",
      "--email",
      address,
      "--name",
      "PM Integration Verify",
    ],
    {
      cwd: pmRepo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const line = output.trim().split("\n").at(-1);
  if (!line) throw new Error("create-account.ts returned no JSON");
  const result = JSON.parse(line) as { credentialsFile?: string };
  if (!result.credentialsFile)
    throw new Error("create-account.ts did not return a credentials file");
  const credentials = JSON.parse(
    await readFile(path.resolve(pmRepo, result.credentialsFile), "utf8"),
  ) as { email: string; password: string };
  return { email: credentials.email, password: credentials.password };
}

async function verifySession(cookie: string): Promise<boolean> {
  const response = await request("/api/v1/auth/me", { cookie });
  return response.ok;
}

async function createWorkspace(
  cookie: string,
  actorId: string,
): Promise<{ workspaceId: string; projectId: string | null }> {
  const created = await json<{
    status?: string;
    workspaceId?: string;
    sampleProjectId?: string | null;
  }>("/api/v1/workspaces", {
    method: "POST",
    cookie,
    idempotencyKey: randomUUID(),
    body: {
      name: `PM integration ${new Date().toISOString().slice(0, 10)}`,
      expectedActorId: actorId,
      includeSample: true,
    },
  });
  if (
    (created.status !== 200 && created.status !== 201) ||
    typeof created.body.workspaceId !== "string"
  ) {
    throw new Error(
      `PM workspace creation failed: HTTP ${created.status} ${JSON.stringify(created.body)}`,
    );
  }
  return { workspaceId: created.body.workspaceId, projectId: created.body.sampleProjectId ?? null };
}

function isIdRecord(value: unknown): value is { id: string } {
  return (
    value !== null && typeof value === "object" && "id" in value && typeof value.id === "string"
  );
}

async function firstEntity(
  cookie: string,
  workspaceId: string,
  kind: string,
): Promise<string | null> {
  const result = await json<{ items?: unknown[] }>(
    `/api/v1/workspaces/${workspaceId}/entities?kind=${kind}&limit=5`,
    { cookie },
  );
  if (result.status !== 200 || !Array.isArray(result.body.items)) return null;
  for (const item of result.body.items) {
    if (isIdRecord(item)) return item.id;
  }
  return null;
}

async function resolveSession(): Promise<TestSession> {
  if (email && password) {
    const { cookie, actorId } = await login(email, password);
    const workspaces = await json<{ items?: unknown[] }>("/api/v1/workspaces", { cookie });
    const existing = Array.isArray(workspaces.body.items)
      ? workspaces.body.items.find(isIdRecord)
      : undefined;
    const workspaceId = existing
      ? existing.id
      : (await createWorkspace(cookie, actorId)).workspaceId;
    return {
      email,
      password,
      cookie,
      actorId,
      workspaceId,
      projectId: await firstEntity(cookie, workspaceId, "project"),
      entityId: await firstEntity(cookie, workspaceId, "work_item"),
    };
  }

  const saved = await readFile(sessionPath, "utf8")
    .then((text) => JSON.parse(text) as TestSession)
    .catch(() => undefined);
  if (saved?.cookie && (await verifySession(saved.cookie))) return saved;
  if (saved?.email && saved.password) {
    const { cookie, actorId } = await login(saved.email, saved.password);
    return { ...saved, cookie, actorId };
  }

  const account = await createAccount();
  const { cookie, actorId } = await login(account.email, account.password);
  const workspace = await createWorkspace(cookie, actorId);
  const session: TestSession = {
    ...account,
    cookie,
    actorId,
    workspaceId: workspace.workspaceId,
    projectId: workspace.projectId ?? (await firstEntity(cookie, workspace.workspaceId, "project")),
    entityId: await firstEntity(cookie, workspace.workspaceId, "work_item"),
  };
  await mkdir(path.dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  await chmod(sessionPath, 0o600);
  return session;
}

function pagePath(
  page: PmPageDefinition,
  session: TestSession,
): { path: string | null; missing: string[] } {
  let missing: string[] = [];
  const filled = page.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, name: string) => {
    if (name === "workspaceSlug") return encodeURIComponent(session.workspaceId);
    if (name === "projectId") {
      if (!session.projectId) {
        missing.push(name);
        return "";
      }
      return encodeURIComponent(session.projectId);
    }
    if (name === "entityId") {
      if (!session.entityId) {
        missing.push(name);
        return "";
      }
      return encodeURIComponent(session.entityId);
    }
    if (name === "settingsPage") return "general";
    missing.push(name);
    return "";
  });
  return { path: missing.length === 0 ? filled : null, missing: [...new Set(missing)] };
}

const forbiddenText = [
  "No route matches",
  "没有匹配的路由",
  "Application unavailable",
  "应用暂时不可用",
  "Settings page not found",
  "设置页面不存在",
];

async function checkPage(
  browserPage: Page,
  page: PmPageDefinition,
  session: TestSession,
): Promise<PageResult> {
  const { path: routePath, missing } = pagePath(page, session);
  const started = Date.now();
  if (!routePath) {
    return {
      id: page.id,
      route: page.path,
      url: "",
      status: "skipped",
      httpStatus: null,
      durationMs: 0,
      reason: `Missing fixture: ${missing.join(", ")}`,
      pageErrors: [],
    };
  }
  const url = `${baseUrl}${routePath}`;
  const pageErrors: string[] = [];
  const onPageError = (error: Error) => pageErrors.push(error.message);
  browserPage.on("pageerror", onPageError);
  try {
    const response = await browserPage.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await browserPage.waitForFunction(
      () => {
        const boot = document.getElementById("dovspace-boot");
        if (!boot) return true;
        const text = document.body?.innerText ?? "";
        return text.includes("应用未能启动") || text.includes("Application unavailable");
      },
      { timeout: 20_000 },
    );
    const body = await browserPage.locator("body").innerText();
    const httpStatus = response?.status() ?? null;
    if (httpStatus !== null && httpStatus >= 400) {
      return {
        id: page.id,
        route: page.path,
        url,
        status: "failed",
        httpStatus,
        durationMs: Date.now() - started,
        reason: `HTTP ${httpStatus}`,
        pageErrors,
      };
    }
    const forbidden = forbiddenText.find((text) => body.includes(text));
    if (forbidden) {
      return {
        id: page.id,
        route: page.path,
        url,
        status: "failed",
        httpStatus,
        durationMs: Date.now() - started,
        reason: `Rendered forbidden text: ${forbidden}`,
        pageErrors,
      };
    }
    const needsSession = page.auth === "workspace" || page.auth === "project";
    if (needsSession) {
      const passwordInputs = await browserPage.locator('input[type="password"]').count();
      if (passwordInputs > 0) {
        return {
          id: page.id,
          route: page.path,
          url,
          status: "failed",
          httpStatus,
          durationMs: Date.now() - started,
          reason: "Rendered the login wall",
          pageErrors,
        };
      }
    }
    return {
      id: page.id,
      route: page.path,
      url,
      status: "passed",
      httpStatus,
      durationMs: Date.now() - started,
      pageErrors,
    };
  } catch (error) {
    await mkdir(screenshotDir, { recursive: true });
    const screenshot = path.join(screenshotDir, `${page.id}.png`);
    await browserPage.screenshot({ path: screenshot, fullPage: true }).catch(() => undefined);
    return {
      id: page.id,
      route: page.path,
      url,
      status: "failed",
      httpStatus: null,
      durationMs: Date.now() - started,
      reason: error instanceof Error ? error.message : String(error),
      pageErrors,
      screenshot: path.relative(root, screenshot),
    };
  } finally {
    browserPage.off("pageerror", onPageError);
  }
}

const session = await resolveSession();
if (!session.projectId) console.warn("No PM project is available; project pages will be skipped.");
if (!session.entityId) console.warn("No PM work item is available; entity pages will be skipped.");

const pages = only
  ? PM_PAGES.filter((page) => page.id === only || page.path.includes(only))
  : PM_PAGES;
// The repository's Playwright pin may not have its headless shell downloaded;
// the system Chrome is an acceptable Chromium for route rendering.
const browser = await chromium
  .launch({ headless: true, channel: "chrome" })
  .catch(() => chromium.launch({ headless: true }));
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([
  {
    name: "pm_v4_session",
    value: session.cookie.slice("pm_v4_session=".length),
    domain: new URL(baseUrl).hostname,
    path: "/",
    httpOnly: true,
    secure: baseUrl.startsWith("https:"),
    sameSite: "Lax",
  },
]);

const results: PageResult[] = [];
for (const page of pages) {
  const browserPage = await context.newPage();
  try {
    results.push(await checkPage(browserPage, page, session));
  } finally {
    await browserPage.close();
  }
}
await context.close();
await browser.close();

const report = {
  baseUrl,
  workspaceId: session.workspaceId,
  projectId: session.projectId,
  entityId: session.entityId,
  pageCount: pages.length,
  passed: results.filter((result) => result.status === "passed").length,
  failed: results.filter((result) => result.status === "failed").length,
  skipped: results.filter((result) => result.status === "skipped").length,
  results,
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

for (const result of results) {
  const suffix = result.reason ? ` — ${result.reason}` : "";
  console.log(
    `${result.status.toUpperCase().padEnd(7)} ${result.id.padEnd(28)} ${result.url || result.route}${suffix}`,
  );
}
console.log(
  `\n${report.passed}/${report.pageCount} passed, ${report.failed} failed, ${report.skipped} skipped. Report: ${path.relative(process.cwd(), reportPath)}`,
);
if (report.failed > 0) process.exitCode = 1;
