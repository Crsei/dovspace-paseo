import { afterEach, describe, expect, it } from "vitest";
import { PmHttpError, PmTransport, parseSse } from "../src/http.js";
import { json, startServer, type TestServer } from "./server.js";

// Real delay: this case exercises the transport's own wall-clock deadline.
function delayedJson(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
  ms: number,
): void {
  setTimeout(() => json(response, status, body), ms);
}

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((instance) => instance.close()));
});

async function testServer(handler: Parameters<typeof startServer>[0]): Promise<TestServer> {
  const started = await startServer(handler);
  servers.push(started);
  return started;
}

describe("PmTransport", () => {
  it("sends bearer auth, origin, query arrays, and JSON bodies", async () => {
    const test = await testServer((request, response) => json(response, 200, { ok: true }));
    const transport = new PmTransport({
      baseUrl: test.baseUrl,
      token: () => "session-token",
      cookie: "pm_v4_session=stale",
      origin: "http://127.0.0.1:3224",
    });
    await transport.json({
      method: "POST",
      path: "/api/v1/workspaces/a b/commands",
      query: { limit: 2, tag: ["one", "two"], skip: null },
      body: { commandId: "id" },
    });
    const request = test.requests[0]!;
    expect(request.url).toBe("/api/v1/workspaces/a%20b/commands?limit=2&tag=one&tag=two");
    expect(request.headers.authorization).toBe("Bearer session-token");
    expect(request.headers.cookie).toBeUndefined();
    expect(request.headers.origin).toBe("http://127.0.0.1:3224");
    expect(request.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(request.body)).toEqual({ commandId: "id" });
  });

  it("uses the cookie when no token is configured", async () => {
    const test = await testServer((_request, response) => json(response, 200, {}));
    const transport = new PmTransport({ baseUrl: test.baseUrl, cookie: () => "pm_v4_session=abc" });
    await transport.json({ method: "GET", path: "/api/v1/auth/me" });
    expect(test.requests[0]!.headers.cookie).toBe("pm_v4_session=abc");
    expect(test.requests[0]!.headers.authorization).toBeUndefined();
  });

  it("maps error envelopes and classifies write outcomes", async () => {
    let status = 401;
    const test = await testServer((_request, response) => {
      if (status === 401)
        json(response, 401, {
          error: { code: "unauthenticated", message: "Sign in" },
          requestId: "req-1",
        });
      else if (status === 409)
        json(response, 409, {
          error: { code: "version_conflict", message: "Stale", details: { revision: "r1" } },
        });
      else json(response, 503, { error: { code: "service_unavailable", message: "Try later" } });
    });
    const transport = new PmTransport({ baseUrl: test.baseUrl });

    const unauthorized = await transport
      .json({ method: "GET", path: "/api/v1/auth/me" })
      .catch((error: unknown) => error);
    expect(unauthorized).toBeInstanceOf(PmHttpError);
    expect(unauthorized).toMatchObject({
      status: 401,
      code: "unauthenticated",
      kind: "unauthenticated",
      requestId: "req-1",
      retryable: false,
      outcomeUnknown: false,
    });

    status = 409;
    const conflict = await transport
      .json({ method: "PUT", path: "/api/v1/workspaces/w/identity" })
      .catch((error: unknown) => error);
    expect(conflict).toMatchObject({
      status: 409,
      code: "version_conflict",
      kind: "conflict",
      details: { revision: "r1" },
    });

    status = 503;
    const unavailable = await transport
      .json({ method: "POST", path: "/api/v1/workspaces/w/commands" })
      .catch((error: unknown) => error);
    expect(unavailable).toMatchObject({
      status: 503,
      kind: "unavailable",
      retryable: true,
      outcomeUnknown: true,
    });

    const readUnavailable = await transport
      .json({ method: "GET", path: "/api/v1/workspaces" })
      .catch((error: unknown) => error);
    expect(readUnavailable).toMatchObject({ status: 503, retryable: true, outcomeUnknown: false });
  });

  it("turns bodyless errors into stable codes", async () => {
    const test = await testServer((_request, response) => {
      response.writeHead(404);
      response.end();
    });
    const transport = new PmTransport({ baseUrl: test.baseUrl });
    const error = await transport
      .json({ method: "GET", path: "/api/v1/missing" })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 404, code: "http_404", kind: "not_found" });
  });

  it("returns undefined for 204 and rejects non-JSON success bodies", async () => {
    let mode: "empty" | "html" = "empty";
    const test = await testServer((_request, response) => {
      if (mode === "empty") {
        response.writeHead(204);
        response.end();
      } else {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<html></html>");
      }
    });
    const transport = new PmTransport({ baseUrl: test.baseUrl });
    await expect(
      transport.json({ method: "DELETE", path: "/api/v1/thing/1" }),
    ).resolves.toBeUndefined();
    mode = "html";
    const error = await transport
      .json({ method: "GET", path: "/api/v1/thing" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PmHttpError);
    expect(error).toMatchObject({ code: "invalid_response", kind: "server" });
  });

  it("times out a write and marks the outcome unknown", async () => {
    const test = await testServer((_request, response) => {
      delayedJson(response, 200, { ok: true }, 200);
    });
    const transport = new PmTransport({ baseUrl: test.baseUrl, timeoutMs: 30 });
    const started = Date.now();
    const error = await transport
      .json({ method: "POST", path: "/api/v1/workspaces/w/commands" })
      .catch((caught: unknown) => caught);
    expect(Date.now() - started).toBeLessThan(180);
    expect(error).toMatchObject({
      kind: "timeout",
      code: "timeout",
      retryable: true,
      outcomeUnknown: true,
    });
  });

  it("parses Content-Disposition for downloads", async () => {
    const test = await testServer((request, response) => {
      const encoded = request.url?.includes("encoded") === true;
      response.writeHead(200, {
        "content-type": "text/markdown",
        "content-length": "4",
        "content-disposition": encoded
          ? "attachment; filename*=UTF-8''%E4%BB%BB%E5%8A%A1.md"
          : 'attachment; filename="report.pdf"',
      });
      response.end("body");
    });
    const transport = new PmTransport({ baseUrl: test.baseUrl });
    await expect(
      transport.download({ method: "GET", path: "/files/plain" }),
    ).resolves.toMatchObject({
      filename: "report.pdf",
      contentType: "text/markdown",
      size: 4,
    });
    await expect(
      transport.download({ method: "GET", path: "/files/encoded" }),
    ).resolves.toMatchObject({ filename: "任务.md" });
  });
});

describe("SSE", () => {
  it("parses comments, multi-line data, ids, and events", async () => {
    const test = await testServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(": keepalive\n");
      response.write('id: 7\nevent: change\ndata: {"a":\ndata: 1}\n\n');
      response.end();
    });
    const transport = new PmTransport({ baseUrl: test.baseUrl });
    const events = [];
    for await (const event of transport.sse("/api/v1/workspaces/w/events", { reconnect: false }))
      events.push(event);
    expect(events).toEqual([{ id: "7", event: "change", data: '{"a":\n1}' }]);
  });

  it("reconnects with Last-Event-ID after a stream closes", async () => {
    const test = await testServer((request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (test.requests.length === 1) {
        response.write('id: 1\ndata: {"n":1}\n\n');
        response.end();
        return;
      }
      expect(request.headers["last-event-id"]).toBe("1");
      response.write('id: 2\ndata: {"n":2}\n\n');
      response.end();
    });
    const transport = new PmTransport({ baseUrl: test.baseUrl });
    const controller = new AbortController();
    const received = [];
    for await (const event of transport.sse("/api/v1/workspaces/w/events", {
      signal: controller.signal,
      initialDelayMs: 5,
      maxDelayMs: 10,
    })) {
      received.push(event.id);
      if (received.length === 2) controller.abort();
    }
    expect(received).toEqual(["1", "2"]);
    expect(test.requests.length).toBeGreaterThanOrEqual(2);
  });
});

describe("parseSse", () => {
  it("dispatches a trailing event without a final blank line", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: last"));
        controller.close();
      },
    });
    const events = [];
    for await (const event of parseSse(stream)) events.push(event);
    expect(events).toEqual([{ data: "last" }]);
  });
});
