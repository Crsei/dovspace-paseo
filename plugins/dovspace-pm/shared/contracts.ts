import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const pmConnection = defineSettings({
  id: "connection",
  scope: "host",
  version: 1,
  schema: z.object({
    baseUrl: z.url({ protocol: /^https?$/ }).default("http://127.0.0.1:3225"),
    openMode: z.enum(["external", "workspace-browser"]).default("external"),
    mappings: z
      .array(
        z.object({
          paseoWorkspaceId: z.string().trim().min(1),
          pmWorkspaceId: z.string().trim().min(1),
          pmProjectId: z.string().trim().min(1).nullable().default(null),
        }),
      )
      .default([]),
  }),
});

export type PmConnectionValues = z.output<typeof pmConnection.schema>;

const probe = z.object({
  ok: z.boolean(),
  status: z.number().nullable(),
  error: z.string().nullable(),
});

const pageGroup = z.enum(["entry", "account", "workspace", "project", "agent", "system"]);
const pageAuth = z.enum(["public", "session", "workspace", "project", "admin"]);

export const pmStatusRpc = defineRpc({
  name: "pm.status",
  input: z.object({ probe: z.boolean().optional().default(true) }),
  output: z.object({
    baseUrl: z.string(),
    authenticated: z.boolean(),
    live: probe,
    ready: probe.extend({
      checks: z
        .record(z.string(), z.union([z.boolean(), z.number(), z.string(), z.null()]))
        .nullable(),
    }),
    contract: z.object({
      version: z.string(),
      commit: z.string(),
      operationCount: z.number(),
    }),
  }),
});

export const pmSessionRpc = defineRpc({
  name: "pm.session",
  input: z.object({}),
  output: z.object({
    configured: z.boolean(),
    actor: z
      .object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
      })
      .nullable(),
    error: z
      .object({
        kind: z.string(),
        code: z.string(),
        message: z.string(),
      })
      .nullable(),
  }),
});

export const pmWorkspacesRpc = defineRpc({
  name: "pm.workspaces",
  input: z.object({}),
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        icon: z.string().nullable(),
        color: z.string().nullable(),
        capabilities: z.array(z.string()),
        projectIds: z.array(z.string()).nullable(),
        cursor: z.string(),
      }),
    ),
    pendingInitializations: z.array(
      z.object({
        workspaceId: z.string(),
        name: z.string(),
        key: z.string().nullable(),
      }),
    ),
  }),
});

export const pmProjectsRpc = defineRpc({
  name: "pm.projects",
  input: z.object({ workspaceId: z.string().trim().min(1) }),
  output: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string().nullable(),
        archived: z.boolean(),
      }),
    ),
    truncated: z.boolean(),
  }),
});

export const pmPagesOutput = z.object({
  baseUrl: z.string(),
  pages: z.array(
    z.object({
      id: z.string(),
      title: z.object({ en: z.string(), zh: z.string() }),
      url: z.string().nullable(),
      group: pageGroup,
      auth: pageAuth,
      missingParams: z.array(z.string()),
    }),
  ),
});

export const pmPagesRpc = defineRpc({
  name: "pm.pages",
  input: z.object({
    workspaceId: z.string().trim().min(1).nullable().optional(),
    projectId: z.string().trim().min(1).nullable().optional(),
    entityId: z.string().trim().min(1).nullable().optional(),
    settingsPage: z.string().trim().min(1).nullable().optional(),
  }),
  output: pmPagesOutput,
});

export const pmTargetRpc = defineRpc({
  name: "pm.target",
  input: z.object({
    paseoWorkspaceId: z.string().trim().min(1),
    pageId: z.string().trim().min(1),
    projectId: z.string().trim().min(1).nullable().optional(),
    entityId: z.string().trim().min(1).nullable().optional(),
    settingsPage: z.string().trim().min(1).nullable().optional(),
  }),
  output: z.object({
    url: z.string().nullable(),
    mapped: z.boolean(),
    pmWorkspaceId: z.string().nullable(),
    error: z.string().nullable(),
  }),
});

export type PmStatus = z.output<typeof pmStatusRpc.output>;
export type PmSession = z.output<typeof pmSessionRpc.output>;
export type PmWorkspace = z.output<typeof pmWorkspacesRpc.output>["items"][number];
export type PmProject = z.output<typeof pmProjectsRpc.output>["items"][number];
export type PmPageLink = z.output<typeof pmPagesRpc.output>["pages"][number];
export type PmTarget = z.output<typeof pmTargetRpc.output>;
