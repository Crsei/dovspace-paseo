#!/usr/bin/env node
// End-to-end check: connect to a running Paseo daemon, call the built-in PM
// plugin RPCs, and verify the daemon reaches the live PM service.
import { DaemonClient } from "../../packages/client/src/daemon-client.js";

const url = process.env.PASEO_RPC_URL ?? "ws://127.0.0.1:6791/ws";
const client = new DaemonClient({
  url,
  clientId: "pm-plugin-rpc-check",
  reconnect: { enabled: false },
});
try {
  await client.connect();
  const status = (await client.invokePluginRpc("dovspace-pm", "pm.status", { probe: true })) as {
    live?: { ok?: boolean };
    ready?: { ok?: boolean };
    contract?: { operationCount?: number; commit?: string };
    baseUrl?: string;
  };
  const session = (await client.invokePluginRpc("dovspace-pm", "pm.session", {})) as {
    configured?: boolean;
    actor?: { email?: string } | null;
    error?: unknown;
  };
  const workspaces = (await client.invokePluginRpc("dovspace-pm", "pm.workspaces", {})) as {
    items?: { id?: string; name?: string }[];
  };
  const target = (await client.invokePluginRpc("dovspace-pm", "pm.target", {
    paseoWorkspaceId: "unmapped",
    pageId: "workspace-home",
  })) as { mapped?: boolean; error?: string };

  console.log(
    JSON.stringify(
      {
        baseUrl: status.baseUrl,
        live: status.live?.ok,
        ready: status.ready?.ok,
        contract: status.contract,
        session,
        workspaceCount: workspaces.items?.length ?? 0,
        firstWorkspace: workspaces.items?.[0]?.name ?? null,
        unmappedTarget: target,
      },
      null,
      2,
    ),
  );
  if (!status.live?.ok) throw new Error("PM live probe failed");
  if (status.contract?.operationCount !== 187)
    throw new Error("Unexpected PM contract operation count");
  if (session.actor?.email === undefined) throw new Error("PM session was not accepted");
  if ((workspaces.items?.length ?? 0) < 1) throw new Error("PM workspaces were not returned");
  if (target.mapped !== false) throw new Error("Unmapped target did not report mapped=false");
} finally {
  await client.close();
}
