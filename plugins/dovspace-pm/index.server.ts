import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  pmConnection,
  pmPagesRpc,
  pmProjectsRpc,
  pmSessionRpc,
  pmStatusRpc,
  pmTargetRpc,
  pmWorkspacesRpc,
} from "./shared/contracts.js";
import {
  pageLinks,
  readConnection,
  readProjects,
  readSession,
  readStatus,
  readWorkspaces,
  resolveTarget,
} from "./server/pm.js";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(pmConnection);

  server.handle(pmStatusRpc, async () => readStatus(await readConnection(settings)));

  server.handle(pmSessionRpc, async () => readSession(await readConnection(settings)));

  server.handle(pmWorkspacesRpc, async () => readWorkspaces(await readConnection(settings)));

  server.handle(pmProjectsRpc, async (input) =>
    readProjects(await readConnection(settings), input.workspaceId),
  );

  server.handle(pmPagesRpc, async (input) => {
    const connection = await readConnection(settings);
    return {
      baseUrl: connection.baseUrl,
      pages: pageLinks(connection.baseUrl, {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        entityId: input.entityId,
        settingsPage: input.settingsPage,
      }),
    };
  });

  server.handle(pmTargetRpc, async (input) => resolveTarget(await readConnection(settings), input));

  return () => {};
}
