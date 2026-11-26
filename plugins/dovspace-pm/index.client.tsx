import { useCallback } from "react";
import { openExternalUrl, useSettings } from "@getpaseo/plugin/client";
import type {
  PluginClientContext,
  PluginScreenProps,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { pmConnection } from "./shared/contracts.js";
import { messages } from "./client/messages.js";
import { PmOverview } from "./client/overview.js";
import { PmSettings } from "./client/settings.js";
import { PmWorkspaceBadge } from "./client/workspace-badge.js";

function OpenPmItem({ openScreen }: PluginSidebarItemProps) {
  const settings = useSettings(pmConnection);
  const baseUrl = settings.status === "ready" ? settings.values.baseUrl : "http://127.0.0.1:3225";
  const openPm = useCallback(() => {
    const url = `${baseUrl.replace(/\/$/, "")}/pm`;
    void openExternalUrl(url).catch(() => {
      openScreen({ screenId: "connection" });
    });
  }, [baseUrl, openScreen]);
  return <SidebarRow icon="FolderKanban" onPress={openPm} />;
}

export default function contribute(client: PluginClientContext) {
  const OverviewScreen = (props: PluginScreenProps) => <PmOverview {...props} client={client} />;

  const cleanups = [
    client.addScreen({
      id: "overview",
      title: messages.message("title"),
      Component: OverviewScreen,
    }),
    client.addSettingsScreen({
      id: "connection",
      title: messages.message("title"),
      icon: "Settings",
      Component: PmSettings,
    }),
    client.addSidebarFooterItem({
      id: "open-pm",
      title: messages.message("title"),
      Component: OpenPmItem,
    }),
    client.addSidebarHeaderItem({
      id: "open-pm-header",
      title: messages.message("title"),
      Component: OpenPmItem,
    }),
    client.addWorkspaceRowBadgeItem({
      id: "pm-badge",
      title: messages.message("title"),
      icon: "FolderKanban",
      Component: PmWorkspaceBadge,
    }),
    client.addCommandCenterItem({
      id: "pm-status",
      title: messages.message("statusCommand"),
      icon: "FolderKanban",
      context: "global",
      onSelect({ openScreen }) {
        openScreen({ screenId: "overview" });
      },
    }),
    client.addCommandCenterItem({
      id: "pm-settings",
      title: messages.message("settingsCommand"),
      icon: "Settings",
      context: "global",
      onSelect({ openSettings }) {
        openSettings("connection");
      },
    }),
  ];

  return () => {
    for (let index = cleanups.length - 1; index >= 0; index -= 1) cleanups[index]!();
  };
}
