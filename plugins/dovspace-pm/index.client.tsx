import { useCallback } from "react";
import type {
  PluginClientContext,
  PluginScreenProps,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { messages } from "./client/messages.js";
import { PmOverview } from "./client/overview.js";
import { PmSettings } from "./client/settings.js";
import { PmWorkspaceBadge } from "./client/workspace-badge.js";

function OpenPmItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const openOverview = useCallback(() => {
    openScreen({ screenId: "overview" });
  }, [openScreen]);
  return (
    <SidebarRow
      icon="FolderKanban"
      active={currentScreen?.screenId === "overview"}
      onPress={openOverview}
    />
  );
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
      id: "open-pm",
      title: messages.message("openCommand"),
      icon: "FolderKanban",
      context: "global",
      onSelect({ openScreen }) {
        openScreen({ screenId: "overview" });
      },
    }),
  ];

  return () => {
    for (let index = cleanups.length - 1; index >= 0; index -= 1) cleanups[index]!();
  };
}
