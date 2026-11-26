import {
  PM_CONTRACT,
  PM_OPERATIONS,
  type PmOperation,
  type PmOperationId,
} from "./generated/operations.gen.js";
import {
  PmHttpError,
  PmTransport,
  type PmDownload,
  type PmQuery,
  type PmSseEvent,
  type PmTransportOptions,
} from "./http.js";

export { PmHttpError, PmTransport } from "./http.js";
export type { PmDownload, PmErrorKind, PmQuery, PmSseEvent, PmTransportOptions } from "./http.js";
export { PM_CONTRACT, PM_OPERATIONS } from "./generated/operations.gen.js";
export type { PmOperation, PmOperationId } from "./generated/operations.gen.js";

const OPERATION_BY_ID: ReadonlyMap<string, PmOperation> = new Map(
  PM_OPERATIONS.map((operation) => [operation.id, operation]),
);

export class PmArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PmArgumentError";
  }
}

/** The write may have committed. Reconcile with the original commandId, never a new one. */
export class PmCommandOutcomeUnknownError extends Error {
  readonly commandId: string;
  readonly cause: PmHttpError;

  constructor(commandId: string, cause: PmHttpError) {
    super(`Command ${commandId} has an unknown outcome: ${cause.message}`, { cause });
    this.name = "PmCommandOutcomeUnknownError";
    this.commandId = commandId;
    this.cause = cause;
  }
}

export interface PmCallOptions {
  path?: Readonly<Record<string, string | number>>;
  query?: PmQuery;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface PmClientOptions extends PmTransportOptions {
  transport?: PmTransport;
}

export interface PmSseItem<T = unknown> {
  id?: string;
  event?: string;
  data: T;
  raw: string;
}

export interface PmHealthCheck {
  ok: boolean;
  status: number;
  body: unknown;
}

export interface PmHealth {
  live: PmHealthCheck;
  ready: PmHealthCheck;
  readyChecks: Record<string, unknown> | undefined;
}

export interface PmCommandReceipt {
  commandId?: string;
  commandType?: string;
  status?: string;
  httpStatus?: number;
  [key: string]: unknown;
}

export interface PmCommandInput {
  commandId: string;
  commandType: string;
  payload: unknown;
  [key: string]: unknown;
}

function fillPath(
  template: string,
  values: Readonly<Record<string, string | number>> | undefined,
): string {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = values?.[name];
    if (value === undefined) throw new PmArgumentError(`Missing PM path parameter: ${name}`);
    return encodeURIComponent(String(value));
  });
}

export class PmClient {
  readonly transport: PmTransport;
  readonly contract = PM_CONTRACT;

  constructor(options: PmClientOptions | PmTransport) {
    this.transport =
      options instanceof PmTransport ? options : (options.transport ?? new PmTransport(options));
  }

  operation(id: PmOperationId): PmOperation {
    const operation = OPERATION_BY_ID.get(id);
    if (!operation) throw new PmArgumentError(`Unknown PM operation: ${id}`);
    return operation;
  }

  url(id: PmOperationId, options: Pick<PmCallOptions, "path" | "query"> = {}): string {
    const operation = this.operation(id);
    return this.transport.url(fillPath(operation.path, options.path), options.query);
  }

  async request<T = unknown>(id: PmOperationId, options: PmCallOptions = {}): Promise<T> {
    const operation = this.operation(id);
    return this.transport.json<T>({
      method: operation.method,
      path: fillPath(operation.path, options.path),
      query: options.query,
      body: options.body,
      headers: options.headers,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  }

  raw(id: PmOperationId, options: PmCallOptions = {}): Promise<Response> {
    const operation = this.operation(id);
    return this.transport.raw({
      method: operation.method,
      path: fillPath(operation.path, options.path),
      query: options.query,
      body: options.body,
      headers: options.headers,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  }

  download(id: PmOperationId, options: PmCallOptions = {}): Promise<PmDownload> {
    const operation = this.operation(id);
    return this.transport.download({
      method: operation.method,
      path: fillPath(operation.path, options.path),
      query: options.query,
      headers: { accept: "*/*", ...options.headers },
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  }

  async *subscribe<T = unknown>(
    id: PmOperationId,
    options: PmCallOptions & {
      lastEventId?: string;
      reconnect?: boolean;
      initialDelayMs?: number;
      maxDelayMs?: number;
    } = {},
  ): AsyncGenerator<PmSseItem<T>> {
    const operation = this.operation(id);
    const events = this.transport.sse(fillPath(operation.path, options.path), {
      query: options.query,
      headers: options.headers,
      lastEventId: options.lastEventId,
      signal: options.signal,
      reconnect: options.reconnect,
      initialDelayMs: options.initialDelayMs,
      maxDelayMs: options.maxDelayMs,
    });
    for await (const event of events) {
      yield { id: event.id, event: event.event, data: decodeEventData<T>(event), raw: event.data };
    }
  }

  async probe(options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<PmHealth> {
    const [live, ready] = await Promise.all([
      this.healthCheck("/health/live", options),
      this.healthCheck("/health/ready", options),
    ]);
    const readyChecks =
      isRecord(ready.body) && isRecord(ready.body.checks) ? ready.body.checks : undefined;
    return { live, ready, readyChecks };
  }

  private async healthCheck(
    path: string,
    options: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<PmHealthCheck> {
    const response = await this.transport.raw({
      method: "GET",
      path,
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? 5_000,
      headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => undefined);
    return { ok: response.ok, status: response.status, body };
  }

  capabilities<T = unknown>(options: PmCallOptions = {}): Promise<T> {
    return this.request<T>("getCapabilities", options);
  }

  openapi<T = unknown>(options: PmCallOptions = {}): Promise<T> {
    return this.request<T>("getOpenApi", options);
  }

  async executeCommand(workspaceId: string, command: PmCommandInput): Promise<PmCommandReceipt> {
    if (typeof command.commandId !== "string" || command.commandId.length === 0) {
      throw new PmArgumentError("A PM command requires a caller-generated commandId");
    }
    try {
      return await this.request<PmCommandReceipt>("executeCommand", {
        path: { workspaceId },
        body: command,
      });
    } catch (error) {
      if (error instanceof PmHttpError && error.outcomeUnknown)
        throw new PmCommandOutcomeUnknownError(command.commandId, error);
      throw error;
    }
  }

  getCommandReceipt(workspaceId: string, commandId: string): Promise<PmCommandReceipt> {
    return this.request<PmCommandReceipt>("getCommandReceipt", {
      path: { workspaceId, commandId },
    });
  }
}

function decodeEventData<T>(event: PmSseEvent): T {
  const data = event.data.trim();
  if (!data) return undefined as T;
  if (data.startsWith("{") || data.startsWith("[")) {
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as T;
    }
  }
  return data as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
