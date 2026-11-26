import type { PluginSettings } from "@getpaseo/plugin/server";
import { z } from "zod";
import {
  pmConnection,
  type PmConnectionValues,
  type PmPageLink,
  type PmProject,
  type PmSession,
  type PmStatus,
  type PmTarget,
  type PmWorkspace,
} from "../shared/contracts.js";
import { PM_CONTRACT_METADATA } from "./vendor/pm-contract.gen.js";
import { PmHttpError, PmTransport } from "./vendor/pm-http.gen.js";
import { PM_PAGES } from "./vendor/pm-pages.gen.js";

export type PmSettingsHandle = PluginSettings<typeof pmConnection.schema>;

export interface PmServerConnection {
  values: PmConnectionValues;
  baseUrl: string;
  token: string | undefined;
  cookie: string | undefined;
  credentialError: string | null;
  transport: PmTransport;
}

const localStorageValues = pmConnection.schema.parse({});

export async function readConnection(settings: PmSettingsHandle): Promise<PmServerConnection> {
  const state = await settings.read();
  const values = state.status === "ready" ? state.values : localStorageValues;
  const environmentBaseUrl = process.env.PM_INTEGRATION_BASE_URL?.trim();
  const token =
    process.env.PM_INTEGRATION_TOKEN?.trim() || process.env.PM_TOKEN?.trim() || undefined;
  const cookie = process.env.PM_INTEGRATION_COOKIE?.trim() || undefined;
  const hasCredentials = Boolean(token || cookie);
  // A host-scoped setting is writable by any authorized Paseo client. Never let
  // it redirect a daemon-held PM credential: the credential target is the
  // environment's concrete origin, and credentials without it stay unusable.
  const credentialError =
    hasCredentials && !environmentBaseUrl
      ? "PM_INTEGRATION_BASE_URL is required when PM_INTEGRATION_TOKEN or PM_INTEGRATION_COOKIE is set; settings cannot choose the credential target."
      : null;
  const configuredBaseUrl = environmentBaseUrl ?? values.baseUrl;
  return {
    values,
    baseUrl: normalizeBaseUrl(configuredBaseUrl),
    token: credentialError ? undefined : token,
    cookie: credentialError ? undefined : cookie,
    credentialError,
    transport: new PmTransport({
      baseUrl: configuredBaseUrl,
      token: credentialError ? undefined : token,
      cookie: credentialError ? undefined : cookie,
      timeoutMs: 10_000,
    }),
  };
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("PM base URL must use http or https");
  if (url.username || url.password || url.search || url.hash)
    throw new Error("PM base URL must not contain credentials, query, or fragment");
  return url.href.replace(/\/$/, "");
}

function requireSession(connection: PmServerConnection): void {
  if (connection.credentialError) throw new Error(connection.credentialError);
  if (!connection.token && !connection.cookie) {
    throw new Error(
      "PM session is not configured. Set PM_INTEGRATION_TOKEN or PM_INTEGRATION_COOKIE for the Paseo daemon.",
    );
  }
}

function describeError(error: unknown): { kind: string; code: string; message: string } {
  if (error instanceof PmHttpError)
    return { kind: error.kind, code: error.code, message: error.message };
  return {
    kind: "unknown",
    code: "pm_error",
    message: error instanceof Error ? error.message : String(error),
  };
}

async function health(
  connection: PmServerConnection,
  path: string,
): Promise<{ ok: boolean; status: number | null; error: string | null; body: unknown }> {
  try {
    const response = await connection.transport.raw({ method: "GET", path, timeoutMs: 5_000 });
    const body = await response.json().catch(() => undefined);
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : `HTTP ${response.status}`,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : String(error),
      body: undefined,
    };
  }
}

function readinessChecks(body: unknown): PmStatus["ready"]["checks"] {
  if (!body || typeof body !== "object" || !("checks" in body)) return null;
  const checks = body.checks;
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) return null;
  const result: Record<string, boolean | number | string | null> = {};
  for (const [key, value] of Object.entries(checks)) {
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string"
    )
      result[key] = value;
  }
  return result;
}

export async function readStatus(connection: PmServerConnection): Promise<PmStatus> {
  const [live, ready] = await Promise.all([
    health(connection, "/health/live"),
    health(connection, "/health/ready"),
  ]);
  return {
    baseUrl: connection.baseUrl,
    authenticated: Boolean(connection.token || connection.cookie),
    live: { ok: live.ok, status: live.status, error: live.error },
    ready: {
      ok: ready.ok,
      status: ready.status,
      error: ready.error,
      checks: readinessChecks(ready.body),
    },
    contract: {
      version: PM_CONTRACT_METADATA.version,
      commit: PM_CONTRACT_METADATA.pmCommit,
      operationCount: PM_CONTRACT_METADATA.operationCount,
    },
  };
}

const actorSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });

export async function readSession(connection: PmServerConnection): Promise<PmSession> {
  if (connection.credentialError) {
    return {
      configured: true,
      actor: null,
      error: {
        kind: "configuration",
        code: "missing_base_url",
        message: connection.credentialError,
      },
    };
  }
  if (!connection.token && !connection.cookie)
    return { configured: false, actor: null, error: null };
  try {
    const body = await connection.transport.json<{ actor?: unknown }>({
      method: "GET",
      path: "/api/v1/auth/me",
    });
    const actor = actorSchema.parse(body.actor);
    return { configured: true, actor, error: null };
  } catch (error) {
    return { configured: true, actor: null, error: describeError(error) };
  }
}

const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  capabilities: z.array(z.string()).default([]),
  projectIds: z.array(z.string()).nullable().optional(),
  cursor: z.string().default(""),
});

const workspacePageSchema = z.object({
  items: z.array(workspaceSchema).default([]),
  pendingInitializations: z
    .array(
      z.object({
        workspaceId: z.string(),
        name: z.string(),
        key: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

export interface PmWorkspacePage {
  items: PmWorkspace[];
  pendingInitializations: { workspaceId: string; name: string; key: string | null }[];
}

export async function readWorkspaces(connection: PmServerConnection): Promise<PmWorkspacePage> {
  requireSession(connection);
  const body = await connection.transport.json<unknown>({
    method: "GET",
    path: "/api/v1/workspaces",
  });
  const page = workspacePageSchema.parse(body);
  return {
    items: page.items.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      icon: workspace.icon ?? null,
      color: workspace.color ?? null,
      capabilities: workspace.capabilities,
      projectIds: workspace.projectIds ?? null,
      cursor: workspace.cursor,
    })),
    pendingInitializations: page.pendingInitializations.map((pending) => ({
      workspaceId: pending.workspaceId,
      name: pending.name,
      key: pending.key ?? null,
    })),
  };
}

const projectEntitySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string().nullable().optional(),
  archived: z.boolean().optional(),
  archivedAt: z.string().nullable().optional(),
});

const entityPageSchema = z.object({
  items: z.array(projectEntitySchema).default([]),
  nextCursor: z.string().nullable().optional(),
});

export async function readProjects(
  connection: PmServerConnection,
  workspaceId: string,
): Promise<{ items: PmProject[]; truncated: boolean }> {
  requireSession(connection);
  const body = await connection.transport.json<unknown>({
    method: "GET",
    path: `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/entities`,
    query: { kind: "project", limit: 100 },
  });
  const page = entityPageSchema.parse(body);
  return {
    items: page.items.map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status ?? null,
      archived:
        project.archived === true ||
        (project.archivedAt !== null && project.archivedAt !== undefined),
    })),
    truncated: page.nextCursor !== null && page.nextCursor !== undefined,
  };
}

export interface PmPageParams {
  workspaceId?: string | null;
  projectId?: string | null;
  entityId?: string | null;
  settingsPage?: string | null;
}

function pageParam(name: string, values: PmPageParams): string | null | undefined {
  switch (name) {
    case "workspaceSlug":
      return values.workspaceId;
    case "projectId":
      return values.projectId;
    case "entityId":
      return values.entityId;
    case "settingsPage":
      return values.settingsPage;
    default:
      return undefined;
  }
}

function fillPagePath(
  template: string,
  values: PmPageParams,
): { path: string | null; missing: string[] } {
  const missing: string[] = [];
  const path = template.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, name: string) => {
    const value = pageParam(name, values);
    if (value === undefined || value === null || value === "") {
      missing.push(name);
      return "";
    }
    return encodeURIComponent(String(value));
  });
  return { path: missing.length === 0 ? path : null, missing };
}

export function pageLinks(baseUrl: string, params: PmPageParams): PmPageLink[] {
  return PM_PAGES.map((page) => {
    const filled = fillPagePath(page.path, params);
    return {
      id: page.id,
      title: page.title,
      url: filled.path ? `${baseUrl}${filled.path}` : null,
      group: page.group,
      auth: page.auth,
      missingParams: filled.missing,
    };
  });
}

export async function resolveTarget(
  connection: PmServerConnection,
  input: {
    paseoWorkspaceId: string;
    pageId: string;
    projectId?: string | null;
    entityId?: string | null;
    settingsPage?: string | null;
  },
): Promise<PmTarget> {
  const page = PM_PAGES.find((candidate) => candidate.id === input.pageId);
  if (!page)
    return {
      url: null,
      mapped: false,
      pmWorkspaceId: null,
      error: `Unknown PM page: ${input.pageId}`,
    };
  const mapping = connection.values.mappings.find(
    (candidate) => candidate.paseoWorkspaceId === input.paseoWorkspaceId,
  );
  if (!mapping) {
    return {
      url: null,
      mapped: false,
      pmWorkspaceId: null,
      error:
        "This Paseo workspace is not mapped to a PM workspace. Add a mapping in the Project Management settings.",
    };
  }
  const filled = fillPagePath(page.path, {
    workspaceId: mapping.pmWorkspaceId,
    projectId: input.projectId ?? mapping.pmProjectId,
    entityId: input.entityId,
    settingsPage: input.settingsPage,
  });
  if (!filled.path) {
    return {
      url: null,
      mapped: true,
      pmWorkspaceId: mapping.pmWorkspaceId,
      error: `This page needs: ${filled.missing.join(", ")}`,
    };
  }
  return {
    url: `${connection.baseUrl}${filled.path}`,
    mapped: true,
    pmWorkspaceId: mapping.pmWorkspaceId,
    error: null,
  };
}
