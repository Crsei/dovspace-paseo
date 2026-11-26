import { describe, expect, it } from "vitest";
import { pmConnection } from "../shared/contracts.js";
import {
  pageLinks,
  readConnection,
  resolveTarget,
  type PmServerConnection,
  type PmSettingsHandle,
} from "../server/pm.js";
import { PmTransport } from "../server/vendor/pm-http.gen.js";

function settingsHandle(values = pmConnection.schema.parse({})): PmSettingsHandle {
  return {
    read: async () => ({ status: "ready", revision: "revision-1", values }),
    subscribe: () => () => {},
  };
}

function connection(
  mappings: { paseoWorkspaceId: string; pmWorkspaceId: string; pmProjectId: string | null }[] = [],
): PmServerConnection {
  return {
    values: pmConnection.schema.parse({ mappings }),
    baseUrl: "http://pm.test",
    token: undefined,
    cookie: undefined,
    credentialError: null,
    transport: new PmTransport({ baseUrl: "http://pm.test" }),
  };
}

describe("PM page links", () => {
  it("builds every page link that has its parameters", () => {
    const pages = pageLinks("http://pm.test", {
      workspaceId: "w-1",
      projectId: "PRJ-1",
      entityId: "TASK-1",
      settingsPage: "general",
    });
    const byId = new Map(pages.map((page) => [page.id, page]));
    expect(byId.get("workspace-home")?.url).toBe("http://pm.test/pm/w-1/home");
    expect(byId.get("project-entity")?.url).toBe(
      "http://pm.test/pm/w-1/projects/PRJ-1/entities/TASK-1",
    );
    expect(byId.get("workspace-settings-page")?.url).toBe("http://pm.test/pm/w-1/settings/general");
    expect(byId.get("agent")?.url).toBe("http://pm.test/agent");
    expect(byId.get("home")?.url).toBe("http://pm.test/pm");
  });

  it("marks links whose parameters are missing instead of inventing URLs", () => {
    const pages = pageLinks("http://pm.test", { workspaceId: "w-1" });
    const project = pages.find((page) => page.id === "project-issue-new");
    expect(project?.url).toBeNull();
    expect(project?.missingParams).toEqual(["projectId"]);
    const settings = pages.find((page) => page.id === "workspace-settings-page");
    expect(settings?.url).toBeNull();
    expect(settings?.missingParams).toEqual(["settingsPage"]);
  });

  it("keeps public entry and account pages available without a workspace", () => {
    const pages = pageLinks("http://pm.test", {});
    const byId = new Map(pages.map((page) => [page.id, page]));
    expect(byId.get("home")?.url).toBe("http://pm.test/pm");
    expect(byId.get("register")?.url).toBe("http://pm.test/pm/register");
    expect(byId.get("account-recovery")?.url).toBe("http://pm.test/pm/account/recovery");
    expect(byId.get("workspace-home")?.url).toBeNull();
  });

  it("excludes lab routes", () => {
    expect(pageLinks("http://pm.test", {}).some((page) => page.id.startsWith("lab-"))).toBe(false);
  });
});

describe("PM deep-link target", () => {
  it("resolves a mapped Paseo workspace through its PM workspace", async () => {
    const target = await resolveTarget(
      connection([{ paseoWorkspaceId: "paseo-1", pmWorkspaceId: "pm-1", pmProjectId: "PRJ-1" }]),
      {
        paseoWorkspaceId: "paseo-1",
        pageId: "project-issues",
      },
    );
    expect(target).toEqual({
      url: "http://pm.test/pm/pm-1/projects/PRJ-1/issues",
      mapped: true,
      pmWorkspaceId: "pm-1",
      error: null,
    });
  });

  it("reports an unmapped workspace instead of guessing", async () => {
    const target = await resolveTarget(connection(), {
      paseoWorkspaceId: "paseo-1",
      pageId: "workspace-home",
    });
    expect(target).toMatchObject({ url: null, mapped: false, pmWorkspaceId: null });
    expect(target.error).toContain("not mapped");
  });

  it("names missing page parameters", async () => {
    const target = await resolveTarget(
      connection([{ paseoWorkspaceId: "paseo-1", pmWorkspaceId: "pm-1", pmProjectId: null }]),
      {
        paseoWorkspaceId: "paseo-1",
        pageId: "project-entity",
        entityId: "TASK-1",
      },
    );
    expect(target).toMatchObject({ url: null, mapped: true });
    expect(target.error).toContain("projectId");
  });

  it("rejects an unknown page id", async () => {
    const target = await resolveTarget(
      connection([{ paseoWorkspaceId: "paseo-1", pmWorkspaceId: "pm-1", pmProjectId: null }]),
      {
        paseoWorkspaceId: "paseo-1",
        pageId: "lab-mobile",
      },
    );
    expect(target.error).toContain("Unknown PM page");
  });
});

describe("PM credential target", () => {
  const saved = {
    baseUrl: process.env.PM_INTEGRATION_BASE_URL,
    token: process.env.PM_INTEGRATION_TOKEN,
    cookie: process.env.PM_INTEGRATION_COOKIE,
  };
  const restore = () => {
    if (saved.baseUrl === undefined) delete process.env.PM_INTEGRATION_BASE_URL;
    else process.env.PM_INTEGRATION_BASE_URL = saved.baseUrl;
    if (saved.token === undefined) delete process.env.PM_INTEGRATION_TOKEN;
    else process.env.PM_INTEGRATION_TOKEN = saved.token;
    if (saved.cookie === undefined) delete process.env.PM_INTEGRATION_COOKIE;
    else process.env.PM_INTEGRATION_COOKIE = saved.cookie;
  };

  it("refuses to use a daemon credential without an environment origin", async () => {
    delete process.env.PM_INTEGRATION_BASE_URL;
    delete process.env.PM_INTEGRATION_COOKIE;
    process.env.PM_INTEGRATION_TOKEN = "secret";
    try {
      const conn = await readConnection(settingsHandle());
      expect(conn.credentialError).toContain("PM_INTEGRATION_BASE_URL");
      expect(conn.token).toBeUndefined();
    } finally {
      restore();
    }
  });

  it("pins credentials to the environment origin even when settings differ", async () => {
    process.env.PM_INTEGRATION_BASE_URL = "http://127.0.0.1:3224";
    process.env.PM_INTEGRATION_TOKEN = "secret";
    delete process.env.PM_INTEGRATION_COOKIE;
    try {
      const values = pmConnection.schema.parse({ baseUrl: "http://attacker.test" });
      const conn = await readConnection(settingsHandle(values));
      expect(conn.baseUrl).toBe("http://127.0.0.1:3224");
      expect(conn.token).toBe("secret");
      expect(conn.credentialError).toBeNull();
    } finally {
      restore();
    }
  });
});
