import { useSettings, type PluginWorkspaceRowBadgeItemProps } from "@getpaseo/plugin/client";
import { WorkspaceRowBadge } from "@getpaseo/plugin/client/ui";
import { pmConnection } from "../shared/contracts.js";

/** Shows a compact PM marker on Paseo workspace rows that have a configured mapping. */
export function PmWorkspaceBadge({ workspaceId }: PluginWorkspaceRowBadgeItemProps) {
  const settings = useSettings(pmConnection);
  if (settings.status !== "ready") return null;
  const mapped = settings.values.mappings.some(
    (mapping) => mapping.paseoWorkspaceId === workspaceId,
  );
  if (!mapped) return null;
  return <WorkspaceRowBadge icon="FolderKanban" label="PM" tone="info" />;
}
