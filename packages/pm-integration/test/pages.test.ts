import { describe, expect, it } from "vitest";
import { PM_CONTRACT, PM_OPERATIONS } from "../src/generated/operations.gen.js";
import { PM_PAGES, pmPagePath, pmPageUrl } from "../src/pages.js";

describe("generated PM contract", () => {
  it("contains every operation exactly once", () => {
    const ids = PM_OPERATIONS.map((operation) => operation.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(PM_CONTRACT.operationCount);
    expect(PM_CONTRACT.operationCount).toBeGreaterThan(150);
  });

  it("uses absolute contract paths and real methods", () => {
    const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"]);
    for (const operation of PM_OPERATIONS) {
      expect(operation.path.startsWith("/")).toBe(true);
      expect(methods.has(operation.method)).toBe(true);
      for (const parameter of operation.path.matchAll(/\{([^}]+)\}/g)) {
        expect(operation.pathParams).toContain(parameter[1]);
      }
    }
  });

  it("marks session-protected operations and public authentication", () => {
    const login = PM_OPERATIONS.find((operation) => operation.id === "login");
    expect(login?.auth).toBe("public");
    const workspaces = PM_OPERATIONS.find((operation) => operation.id === "listWorkspaces");
    expect(workspaces?.auth).toBe("session");
    expect(PM_OPERATIONS.some((operation) => operation.stream)).toBe(true);
  });
});

describe("PM page registry", () => {
  it("keeps page IDs unique", () => {
    const ids = PM_PAGES.map((page) => page.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds encoded deep links", () => {
    expect(pmPagePath("workspace-home", { workspaceSlug: "w 1" })).toBe("/pm/w%201/home");
    expect(
      pmPagePath("project-entity", { workspaceSlug: "w", projectId: "PRJ-1", entityId: "WORK-1" }),
    ).toBe("/pm/w/projects/PRJ-1/entities/WORK-1");
    expect(pmPageUrl("http://127.0.0.1:3224/", "workspace-dashboard", { workspaceSlug: "w" })).toBe(
      "http://127.0.0.1:3224/pm/w/dashboard",
    );
  });

  it("refuses a page link without its required parameters", () => {
    expect(() => pmPagePath("workspace-home", {})).toThrow("requires parameter workspaceSlug");
  });

  it("covers the plan's production routes and excludes lab routes", () => {
    expect(PM_PAGES.length).toBeGreaterThanOrEqual(30);
    expect(PM_PAGES.some((page) => page.path.startsWith("/lab/"))).toBe(false);
    expect(
      PM_PAGES.some((page) => page.id === "project-events" && page.requires.includes("SSE")),
    ).toBe(true);
  });
});
