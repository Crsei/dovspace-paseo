import { afterEach, describe, expect, it } from "vitest";
import { PmClient, PmCommandOutcomeUnknownError, PmHttpError } from "../src/client.js";
import { PmTransport } from "../src/http.js";
import { json, startServer, type TestServer } from "./server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((instance) => instance.close()));
});

async function testServer(handler: Parameters<typeof startServer>[0]): Promise<TestServer> {
  const started = await startServer(handler);
  servers.push(started);
  return started;
}

describe("PmClient", () => {
  it("fills operation paths and forwards query values", async () => {
    const test = await testServer((_request, response) => json(response, 200, { id: "w" }));
    const client = new PmClient({ baseUrl: test.baseUrl });
    await client.request("getWorkspaceIdentity", {
      path: { workspaceId: "a b" },
      query: { include: "all" },
    });
    expect(test.requests[0]!.url).toBe("/api/v1/workspaces/a%20b/identity?include=all");
  });

  it("rejects missing path parameters before sending", async () => {
    const test = await testServer((_request, response) => json(response, 200, {}));
    const client = new PmClient({ baseUrl: test.baseUrl });
    await expect(client.request("getWorkspaceIdentity")).rejects.toThrow(
      "Missing PM path parameter: workspaceId",
    );
    expect(test.requests).toHaveLength(0);
  });

  it("exposes health checks even when readiness is 503", async () => {
    const test = await testServer((request, response) => {
      if (request.url === "/health/live") json(response, 200, { status: "alive" });
      else
        json(response, 503, {
          status: "not_ready",
          checks: { database: true, storage: false, worker: true, core: false },
        });
    });
    const client = new PmClient({ baseUrl: test.baseUrl });
    const health = await client.probe();
    expect(health.live).toMatchObject({ ok: true, status: 200 });
    expect(health.ready).toMatchObject({ ok: false, status: 503 });
    expect(health.readyChecks).toEqual({
      database: true,
      storage: false,
      worker: true,
      core: false,
    });
  });

  it("preserves the original commandId and reports an unknown write outcome", async () => {
    const seen: string[] = [];
    const test = await testServer((request, response) => {
      if (request.method === "GET") {
        seen.push(`receipt:${request.url}`);
        json(response, 200, {
          status: "committed",
          commandId: "5f0f7a9e-8b76-4f6e-a0cc-0f5f1f9b2d10",
        });
        return;
      }
      seen.push(`command:${JSON.parse(request.body).commandId}`);
      json(response, 503, { error: { code: "service_unavailable", message: "Unknown" } });
    });
    const client = new PmClient({ baseUrl: test.baseUrl });
    const commandId = "5f0f7a9e-8b76-4f6e-a0cc-0f5f1f9b2d10";
    const error = await client
      .executeCommand("00000000-0000-4000-8000-000000000001", {
        commandId,
        commandType: "CreateWorkItem",
        payload: { title: "x" },
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PmCommandOutcomeUnknownError);
    expect(error).toMatchObject({ commandId });
    expect((error as PmCommandOutcomeUnknownError).cause).toBeInstanceOf(PmHttpError);
    await client.getCommandReceipt("00000000-0000-4000-8000-000000000001", commandId);
    expect(seen).toEqual([
      `command:${commandId}`,
      `receipt:/api/v1/workspaces/00000000-0000-4000-8000-000000000001/commands/${commandId}`,
    ]);
  });

  it("does not wrap rejected commands as unknown outcomes", async () => {
    const test = await testServer((_request, response) =>
      json(response, 409, { error: { code: "version_conflict", message: "Stale" } }),
    );
    const client = new PmClient({ baseUrl: test.baseUrl });
    const error = await client
      .executeCommand("00000000-0000-4000-8000-000000000001", {
        commandId: "5f0f7a9e-8b76-4f6e-a0cc-0f5f1f9b2d10",
        commandType: "CreateWorkItem",
        payload: {},
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PmHttpError);
    expect(error).toMatchObject({ kind: "conflict", code: "version_conflict" });
  });

  it("decodes SSE JSON data and keeps the raw payload", async () => {
    const test = await testServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('id: 12\nevent: change\ndata: {"eventType":"ProjectCreated"}\n\n');
      response.end();
    });
    const client = new PmClient({ baseUrl: test.baseUrl });
    const events = [];
    for await (const event of client.subscribe<{ eventType: string }>("subscribeEvents", {
      path: { workspaceId: "00000000-0000-4000-8000-000000000001" },
      reconnect: false,
    })) {
      events.push(event);
    }
    expect(events).toEqual([
      {
        id: "12",
        event: "change",
        data: { eventType: "ProjectCreated" },
        raw: '{"eventType":"ProjectCreated"}',
      },
    ]);
  });

  it("builds URLs from the transport contract", () => {
    const client = new PmClient(new PmTransport({ baseUrl: "http://127.0.0.1:3224/" }));
    expect(client.url("getWorkspaceIdentity", { path: { workspaceId: "w 1" } })).toBe(
      "http://127.0.0.1:3224/api/v1/workspaces/w%201/identity",
    );
  });
});
