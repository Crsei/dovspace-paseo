import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  openExternalUrl,
  useRpc,
  useSettings,
  useTranslation,
  type PluginClientContext,
  type PluginScreenProps,
} from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import {
  pmConnection,
  pmPagesRpc,
  pmProjectsRpc,
  pmSessionRpc,
  pmStatusRpc,
  pmWorkspacesRpc,
  type PmPageLink,
  type PmProject,
  type PmSession,
  type PmStatus,
  type PmWorkspace,
} from "../shared/contracts.js";
import { messages } from "./messages.js";

interface PmOverviewProps extends PluginScreenProps {
  client: PluginClientContext;
}

interface OverviewStyles {
  screen: object;
  content: object;
  header: object;
  title: object;
  card: object;
  sectionTitle: object;
  label: object;
  text: object;
  muted: object;
  mono: object;
  error: object;
  warning: object;
  success: object;
  row: object;
  stack: object;
  button: object;
  buttonDisabled: object;
  buttonText: object;
  secondaryButton: object;
  secondaryText: object;
  listRow: object;
  listRowSelected: object;
  pageRow: object;
  pageRowDisabled: object;
  pageGroup: object;
  spacer: object;
}

const PAGE_GROUPS: readonly PmPageLink["group"][] = [
  "entry",
  "workspace",
  "project",
  "agent",
  "account",
  "system",
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function useOverviewStyles(theme: PluginScreenProps["theme"], compact: boolean): OverviewStyles {
  return useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: {
        padding: compact ? 16 : 24,
        gap: 16,
        paddingBottom: 32,
      },
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        flexWrap: "wrap" as const,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: compact ? 20 : 24,
        fontWeight: "600" as const,
      },
      card: {
        padding: 14,
        gap: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      sectionTitle: {
        color: theme.colors.foreground,
        fontSize: 15,
        fontWeight: "600" as const,
      },
      label: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        letterSpacing: 0.5,
        textTransform: "uppercase" as const,
      },
      text: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted },
      mono: { color: theme.colors.foregroundMuted, fontFamily: "monospace" as const },
      error: { color: theme.colors.statusDanger },
      warning: { color: theme.colors.statusWarning },
      success: { color: theme.colors.statusSuccess },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        flexWrap: "wrap" as const,
      },
      stack: { gap: 6 },
      button: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 9,
        backgroundColor: theme.colors.accent,
        alignSelf: "flex-start" as const,
      },
      buttonDisabled: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 9,
        backgroundColor: theme.colors.accent,
        alignSelf: "flex-start" as const,
        opacity: 0.45,
      },
      buttonText: {
        color: theme.colors.accentForeground,
        fontWeight: "600" as const,
      },
      secondaryButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
        alignSelf: "flex-start" as const,
      },
      secondaryText: { color: theme.colors.foreground },
      listRow: {
        padding: 10,
        gap: 3,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
      },
      listRowSelected: {
        padding: 10,
        gap: 3,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.surface2,
      },
      pageRow: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        gap: 2,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
      },
      pageRowDisabled: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        gap: 2,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
        opacity: 0.45,
      },
      pageGroup: { gap: 6, paddingTop: 4 },
      spacer: { flex: 1 },
    }),
    [theme, compact],
  );
}

interface OverviewData {
  status: PmStatus | null;
  statusLoading: boolean;
  statusError: string | null;
  session: PmSession | null;
  sessionError: string | null;
  workspaces: PmWorkspace[] | null;
  workspacesLoading: boolean;
  workspacesError: string | null;
  projects: PmProject[] | null;
  projectsTruncated: boolean;
  projectsLoading: boolean;
  projectsError: string | null;
  pages: PmPageLink[] | null;
  pagesLoading: boolean;
  pagesError: string | null;
  selectedWorkspaceId: string | null;
  selectedProjectId: string | null;
  refresh(): void;
  selectWorkspace(workspaceId: string): void;
  toggleProject(projectId: string): void;
}

function useOverviewData(settingsReady: boolean, configuredBaseUrl: string | null): OverviewData {
  const statusRpc = useRpc(pmStatusRpc);
  const sessionRpc = useRpc(pmSessionRpc);
  const workspacesRpc = useRpc(pmWorkspacesRpc);
  const projectsRpc = useRpc(pmProjectsRpc);
  const pagesRpc = useRpc(pmPagesRpc);

  const [status, setStatus] = useState<PmStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [session, setSession] = useState<PmSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [workspaces, setWorkspaces] = useState<PmWorkspace[] | null>(null);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [projects, setProjects] = useState<PmProject[] | null>(null);
  const [projectsTruncated, setProjectsTruncated] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [pages, setPages] = useState<PmPageLink[] | null>(null);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setRefreshNonce((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    let cancelled = false;
    setStatusLoading(true);
    setStatusError(null);
    setSession(null);
    setSessionError(null);
    void (async () => {
      try {
        const next = await statusRpc({ probe: true });
        if (!cancelled) setStatus(next);
      } catch (error) {
        if (!cancelled) setStatusError(errorMessage(error));
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    void (async () => {
      try {
        const next = await sessionRpc({});
        if (!cancelled) setSession(next);
      } catch (error) {
        if (!cancelled) setSessionError(errorMessage(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsReady, configuredBaseUrl, refreshNonce, statusRpc, sessionRpc]);

  const authenticated = session?.actor !== null && session?.actor !== undefined;

  useEffect(() => {
    if (!authenticated || !settingsReady) {
      setWorkspaces(null);
      setWorkspacesError(null);
      setWorkspacesLoading(false);
      setSelectedWorkspaceId(null);
      setSelectedProjectId(null);
      return;
    }
    let cancelled = false;
    setWorkspacesLoading(true);
    setWorkspacesError(null);
    void (async () => {
      try {
        const page = await workspacesRpc({});
        if (cancelled) return;
        setWorkspaces(page.items);
        setSelectedWorkspaceId((current) => keepExistingWorkspace(current, page.items));
      } catch (error) {
        if (!cancelled) {
          setWorkspaces(null);
          setWorkspacesError(errorMessage(error));
        }
      } finally {
        if (!cancelled) setWorkspacesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, settingsReady, workspacesRpc, refreshNonce]);

  useEffect(() => {
    if (!authenticated || !selectedWorkspaceId) {
      setProjects(null);
      setProjectsTruncated(false);
      setProjectsError(null);
      setProjectsLoading(false);
      return;
    }
    let cancelled = false;
    setProjects(null);
    setProjectsTruncated(false);
    setProjectsError(null);
    setProjectsLoading(true);
    void (async () => {
      try {
        const page = await projectsRpc({ workspaceId: selectedWorkspaceId });
        if (cancelled) return;
        setProjects(page.items);
        setProjectsTruncated(page.truncated);
      } catch (error) {
        if (!cancelled) setProjectsError(errorMessage(error));
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, selectedWorkspaceId, projectsRpc, refreshNonce]);

  useEffect(() => {
    if (!settingsReady) {
      setPages(null);
      setPagesError(null);
      setPagesLoading(false);
      return;
    }
    let cancelled = false;
    setPages(null);
    setPagesError(null);
    setPagesLoading(true);
    void (async () => {
      try {
        const output = await pagesRpc({
          workspaceId: selectedWorkspaceId,
          projectId: selectedProjectId,
        });
        if (!cancelled) setPages(output.pages);
      } catch (error) {
        if (!cancelled) setPagesError(errorMessage(error));
      } finally {
        if (!cancelled) setPagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsReady, selectedWorkspaceId, selectedProjectId, pagesRpc, refreshNonce]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setSelectedProjectId(null);
  }, []);

  const toggleProject = useCallback((projectId: string) => {
    setSelectedProjectId((current) => (current === projectId ? null : projectId));
  }, []);

  return {
    status,
    statusLoading,
    statusError,
    session,
    sessionError,
    workspaces,
    workspacesLoading,
    workspacesError,
    projects,
    projectsTruncated,
    projectsLoading,
    projectsError,
    pages,
    pagesLoading,
    pagesError,
    selectedWorkspaceId,
    selectedProjectId,
    refresh,
    selectWorkspace,
    toggleProject,
  };
}

function keepExistingWorkspace(
  current: string | null,
  items: readonly PmWorkspace[],
): string | null {
  if (!current) return null;
  for (const item of items) if (item.id === current) return current;
  return null;
}

interface StatusBadgeProps {
  status: PmStatus | null;
  loading: boolean;
  statusError: string | null;
  styles: OverviewStyles;
}

function StatusBadge({ status, loading, statusError, styles }: StatusBadgeProps) {
  const { t } = useTranslation(messages);
  let labelKey: "loading" | "live" | "ready" | "unavailable" = "unavailable";
  if (status?.live.ok) labelKey = "live";
  else if (status?.ready.ok) labelKey = "ready";
  else if (!status && !statusError) labelKey = "loading";
  let color = styles.error;
  if (labelKey === "loading") color = styles.muted;
  else if (labelKey === "live") color = styles.success;
  else if (labelKey === "ready") color = styles.warning;
  const label = loading && labelKey === "loading" ? t("loading") : t(labelKey);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{t("status")}</Text>
      <Text style={color}>{label}</Text>
    </View>
  );
}

interface StatusMessagesProps {
  status: PmStatus | null;
  statusError: string | null;
  settingsError: string | null;
  openError: string | null;
  styles: OverviewStyles;
}

function StatusMessages({
  status,
  statusError,
  settingsError,
  openError,
  styles,
}: StatusMessagesProps) {
  const { t } = useTranslation(messages);
  const contractText = status
    ? `${t("contract")} ${status.contract.version} · ${t("commit")} ${status.contract.commit.slice(0, 8) || "—"}`
    : null;
  const liveText = status
    ? `live ${status.live.status ?? status.live.error ?? "?"} · ready ${status.ready.status ?? status.ready.error ?? "?"}`
    : null;
  const liveError = status && !status.live.ok ? status.live.error : null;
  const readyError = status && status.live.ok && !status.ready.ok ? status.ready.error : null;
  return (
    <>
      {liveText ? <Text style={styles.muted}>{liveText}</Text> : null}
      {liveError ? <Text style={styles.error}>{liveError}</Text> : null}
      {readyError ? <Text style={styles.warning}>{readyError}</Text> : null}
      {statusError ? <Text style={styles.error}>{statusError}</Text> : null}
      {contractText ? <Text style={styles.muted}>{contractText}</Text> : null}
      {settingsError ? (
        <Text style={styles.error}>{t("settingsLoadError", { error: settingsError })}</Text>
      ) : null}
      {openError ? <Text style={styles.error}>{openError}</Text> : null}
    </>
  );
}

interface StatusCardProps {
  status: PmStatus | null;
  loading: boolean;
  statusError: string | null;
  settingsError: string | null;
  openError: string | null;
  baseUrl: string | null;
  styles: OverviewStyles;
  onOpen(): void;
  onRefresh(): void;
}

function StatusCard({
  status,
  loading,
  statusError,
  settingsError,
  openError,
  baseUrl,
  styles,
  onOpen,
  onRefresh,
}: StatusCardProps) {
  const { t } = useTranslation(messages);
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t("connection")}</Text>
      <View style={styles.stack}>
        <Text style={styles.label}>{t("baseUrl")}</Text>
        <Text style={styles.mono}>{baseUrl ?? "—"}</Text>
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          disabled={!baseUrl}
          onPress={onOpen}
          style={baseUrl ? styles.button : styles.buttonDisabled}
        >
          <Text style={styles.buttonText}>{t("openPm")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>{loading ? t("loading") : t("refresh")}</Text>
        </Pressable>
      </View>
      <StatusBadge status={status} loading={loading} statusError={statusError} styles={styles} />
      <StatusMessages
        status={status}
        statusError={statusError}
        settingsError={settingsError}
        openError={openError}
        styles={styles}
      />
    </View>
  );
}

interface MappingCardProps {
  paseoWorkspaceId: string;
  settingsStatus: "loading" | "ready" | "invalid" | "error";
  settingsError: string | null;
  mapping: { pmWorkspaceId: string; pmProjectId: string | null } | null;
  mappedHome: { loading: boolean; url: string | null; error: string | null };
  styles: OverviewStyles;
  onOpen(url: string): void;
  onOpenSettings(): void;
}

function MappingCard({
  paseoWorkspaceId,
  settingsStatus,
  settingsError,
  mapping,
  mappedHome,
  styles,
  onOpen,
  onOpenSettings,
}: MappingCardProps) {
  const { t } = useTranslation(messages);
  const openHome = useCallback(() => {
    if (mappedHome.url) onOpen(mappedHome.url);
  }, [mappedHome.url, onOpen]);
  let content;
  if (settingsStatus === "loading") content = <Text style={styles.muted}>{t("loading")}</Text>;
  else if (settingsError)
    content = <Text style={styles.error}>{t("settingsLoadError", { error: settingsError })}</Text>;
  else if (!mapping) {
    content = (
      <View style={styles.stack}>
        <Text style={styles.warning}>{t("unmapped")}</Text>
        <Text style={styles.muted}>{t("addMappingHint")}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenSettings}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryText}>{t("settings")}</Text>
        </Pressable>
      </View>
    );
  } else if (mappedHome.loading) content = <Text style={styles.muted}>{t("loading")}</Text>;
  else if (mappedHome.error) {
    content = (
      <View style={styles.stack}>
        <Text style={styles.error}>{t("mappingHomeError")}</Text>
        <Text style={styles.muted}>{mappedHome.error}</Text>
      </View>
    );
  } else if (mappedHome.url) {
    content = (
      <Pressable accessibilityRole="button" onPress={openHome} style={styles.button}>
        <Text style={styles.buttonText}>{t("openMappedHome")}</Text>
      </Pressable>
    );
  } else content = <Text style={styles.warning}>{t("mappingUnavailable")}</Text>;
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t("mapping")}</Text>
      <Text style={styles.mono}>{paseoWorkspaceId}</Text>
      {mapping ? (
        <View style={styles.stack}>
          <Text style={styles.text}>{t("mappedTo", { workspaceId: mapping.pmWorkspaceId })}</Text>
          {mapping.pmProjectId ? (
            <Text style={styles.muted}>
              {t("mappedProject", { projectId: mapping.pmProjectId })}
            </Text>
          ) : null}
        </View>
      ) : null}
      {content}
    </View>
  );
}

interface SessionCardProps {
  session: PmSession | null;
  sessionError: string | null;
  styles: OverviewStyles;
}

function SessionCard({ session, sessionError, styles }: SessionCardProps) {
  const { t } = useTranslation(messages);
  let content;
  if (session === null && !sessionError) content = <Text style={styles.muted}>{t("loading")}</Text>;
  else if (sessionError) content = <Text style={styles.error}>{sessionError}</Text>;
  else if (session?.configured === false) {
    content = (
      <View style={styles.stack}>
        <Text style={styles.warning}>{t("setupTitle")}</Text>
        <Text style={styles.muted}>{t("setupHint")}</Text>
      </View>
    );
  } else if (session?.actor) {
    content = (
      <Text style={styles.text}>
        {t("signedInAs", { name: session.actor.name, email: session.actor.email })}
      </Text>
    );
  } else if (session?.error) {
    content = (
      <View style={styles.stack}>
        <Text style={styles.error}>{t("actorError")}</Text>
        <Text style={styles.mono}>
          {session.error.kind} · {session.error.code}
        </Text>
        <Text style={styles.error}>{session.error.message}</Text>
      </View>
    );
  } else content = <Text style={styles.error}>{t("actorError")}</Text>;
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t("authentication")}</Text>
      {content}
    </View>
  );
}

interface WorkspaceRowProps {
  workspace: PmWorkspace;
  selected: boolean;
  styles: OverviewStyles;
  onSelect(workspaceId: string): void;
}

function WorkspaceRow({ workspace, selected, styles, onSelect }: WorkspaceRowProps) {
  const { t } = useTranslation(messages);
  const press = useCallback(() => onSelect(workspace.id), [onSelect, workspace.id]);
  const projectCount = workspace.projectIds?.length ?? null;
  let projectLabel = "—";
  if (projectCount !== null) projectLabel = t("projectCount", { count: projectCount });
  return (
    <Pressable
      accessibilityRole="button"
      onPress={press}
      style={selected ? styles.listRowSelected : styles.listRow}
    >
      <Text style={styles.text}>{workspace.name}</Text>
      <Text style={styles.mono}>
        {t("idLabel")}: {workspace.id}
      </Text>
      <Text style={styles.muted}>{projectLabel}</Text>
    </Pressable>
  );
}

interface WorkspaceListProps {
  workspaces: PmWorkspace[] | null;
  loading: boolean;
  error: string | null;
  selectedWorkspaceId: string | null;
  styles: OverviewStyles;
  onSelect(workspaceId: string): void;
}

function WorkspaceList({
  workspaces,
  loading,
  error,
  selectedWorkspaceId,
  styles,
  onSelect,
}: WorkspaceListProps) {
  const { t } = useTranslation(messages);
  let content;
  if (error) content = <Text style={styles.error}>{error}</Text>;
  else if (loading || !workspaces) content = <Text style={styles.muted}>{t("loading")}</Text>;
  else if (workspaces.length === 0)
    content = <Text style={styles.muted}>{t("workspacesEmpty")}</Text>;
  else {
    content = workspaces.map((workspace) => (
      <WorkspaceRow
        key={workspace.id}
        workspace={workspace}
        selected={workspace.id === selectedWorkspaceId}
        styles={styles}
        onSelect={onSelect}
      />
    ));
  }
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t("workspaces")}</Text>
      {content}
    </View>
  );
}

interface ProjectRowProps {
  project: PmProject;
  selected: boolean;
  styles: OverviewStyles;
  onToggle(projectId: string): void;
}

function ProjectRow({ project, selected, styles, onToggle }: ProjectRowProps) {
  const { t } = useTranslation(messages);
  const press = useCallback(() => onToggle(project.id), [onToggle, project.id]);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={press}
      style={selected ? styles.listRowSelected : styles.listRow}
    >
      <Text style={styles.text}>{project.title}</Text>
      <Text style={styles.mono}>
        {t("idLabel")}: {project.id}
      </Text>
      <View style={styles.row}>
        {project.status ? <Text style={styles.muted}>{project.status}</Text> : null}
        {project.archived ? <Text style={styles.warning}>{t("archived")}</Text> : null}
      </View>
    </Pressable>
  );
}

interface ProjectListProps {
  projects: PmProject[] | null;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  selectedProjectId: string | null;
  styles: OverviewStyles;
  onToggle(projectId: string): void;
}

function ProjectList({
  projects,
  loading,
  error,
  truncated,
  selectedProjectId,
  styles,
  onToggle,
}: ProjectListProps) {
  const { t } = useTranslation(messages);
  let content;
  if (error) content = <Text style={styles.error}>{error}</Text>;
  else if (loading || !projects) content = <Text style={styles.muted}>{t("loading")}</Text>;
  else if (projects.length === 0) content = <Text style={styles.muted}>{t("projectsEmpty")}</Text>;
  else {
    content = projects.map((project) => (
      <ProjectRow
        key={project.id}
        project={project}
        selected={project.id === selectedProjectId}
        styles={styles}
        onToggle={onToggle}
      />
    ));
  }
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t("projects")}</Text>
      {content}
      {truncated ? <Text style={styles.muted}>{t("projectsTruncated")}</Text> : null}
    </View>
  );
}

interface PageRowProps {
  page: PmPageLink;
  locale: string;
  styles: OverviewStyles;
  onOpen(url: string): void;
}

function PageRow({ page, locale, styles, onOpen }: PageRowProps) {
  const { t } = useTranslation(messages);
  const disabled = page.missingParams.length > 0 || !page.url;
  const press = useCallback(() => {
    if (page.url) onOpen(page.url);
  }, [onOpen, page.url]);
  const title = locale.startsWith("zh") ? page.title.zh : page.title.en;
  let subtitle = null;
  if (page.missingParams.length > 0) {
    subtitle = (
      <Text style={styles.muted}>
        {t("missingParams", { params: page.missingParams.join(", ") })}
      </Text>
    );
  } else if (page.url) subtitle = <Text style={styles.mono}>{page.url}</Text>;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={press}
      style={disabled ? styles.pageRowDisabled : styles.pageRow}
    >
      <Text style={styles.text}>{title}</Text>
      {subtitle}
    </Pressable>
  );
}

interface PagesCardProps {
  pages: PmPageLink[] | null;
  loading: boolean;
  error: string | null;
  selectedWorkspaceId: string | null;
  styles: OverviewStyles;
  onOpen(url: string): void;
}

function PagesCard({ pages, loading, error, selectedWorkspaceId, styles, onOpen }: PagesCardProps) {
  const { t, locale } = useTranslation(messages);
  let content;
  if (error) content = <Text style={styles.error}>{error}</Text>;
  else if (loading || !pages) content = <Text style={styles.muted}>{t("loading")}</Text>;
  else if (pages.length === 0) content = <Text style={styles.muted}>{t("pagesEmpty")}</Text>;
  else {
    const labels: Record<PmPageLink["group"], string> = {
      entry: t("groupEntry"),
      account: t("groupAccount"),
      workspace: t("groupWorkspace"),
      project: t("groupProject"),
      agent: t("groupAgent"),
      system: t("groupSystem"),
    };
    content = PAGE_GROUPS.map((group) => {
      const groupPages = pages.filter((page) => page.group === group);
      if (groupPages.length === 0) return null;
      return (
        <View key={group} style={styles.pageGroup}>
          <Text style={styles.label}>{labels[group]}</Text>
          {groupPages.map((page) => (
            <PageRow key={page.id} page={page} locale={locale} styles={styles} onOpen={onOpen} />
          ))}
        </View>
      );
    });
  }
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t("pages")}</Text>
      {selectedWorkspaceId ? null : <Text style={styles.muted}>{t("selectWorkspace")}</Text>}
      {content}
    </View>
  );
}

export function PmOverview({ client, theme, layout, params, navigation }: PmOverviewProps) {
  const settings = useSettings(pmConnection);
  const styles = useOverviewStyles(theme, layout.compact);
  const settingsReady = settings.status === "ready";
  const configuredBaseUrl = settings.status === "ready" ? settings.values.baseUrl : null;
  const settingsError =
    settings.status === "error" || settings.status === "invalid" ? settings.error : null;
  const mappings = settings.status === "ready" ? settings.values.mappings : null;
  const openMode = settings.status === "ready" ? settings.values.openMode : "external";
  const paseoWorkspaceId = params.paseoWorkspaceId ?? null;
  const data = useOverviewData(settingsReady, configuredBaseUrl);
  const [openError, setOpenError] = useState<string | null>(null);
  const [mappedHome, setMappedHome] = useState<{
    loading: boolean;
    url: string | null;
    error: string | null;
  }>({
    loading: false,
    url: null,
    error: null,
  });
  const pagesRpc = useRpc(pmPagesRpc);
  const { t } = useTranslation(messages);

  const mapping = useMemo(() => {
    if (!mappings || !paseoWorkspaceId) return null;
    return mappings.find((candidate) => candidate.paseoWorkspaceId === paseoWorkspaceId) ?? null;
  }, [mappings, paseoWorkspaceId]);

  useEffect(() => {
    const workspaceId = mapping?.pmWorkspaceId ?? null;
    if (!workspaceId) {
      setMappedHome({ loading: false, url: null, error: null });
      return;
    }
    let cancelled = false;
    setMappedHome({ loading: true, url: null, error: null });
    void (async () => {
      try {
        const output = await pagesRpc({ workspaceId });
        if (cancelled) return;
        const home = output.pages.find((page) => page.id === "workspace-home");
        setMappedHome({ loading: false, url: home?.url ?? null, error: null });
      } catch (error) {
        if (!cancelled) setMappedHome({ loading: false, url: null, error: errorMessage(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapping?.pmWorkspaceId, pagesRpc, data.refresh]);

  const openBrowser = navigation?.openBrowser;
  const openUrl = useCallback(
    (url: string) => {
      setOpenError(null);
      if (openBrowser && openMode === "workspace-browser" && paseoWorkspaceId) {
        try {
          openBrowser({ url, workspaceId: paseoWorkspaceId });
          return;
        } catch (error) {
          setOpenError(errorMessage(error));
        }
      }
      void openExternalUrl(url).catch((error: unknown) => setOpenError(errorMessage(error)));
    },
    [openBrowser, openMode, paseoWorkspaceId],
  );

  const openSettings = useCallback(() => {
    client.openScreen({ screenId: "connection" });
  }, [client]);

  const pmBaseUrl = data.status?.baseUrl ?? configuredBaseUrl ?? null;
  const openPm = useCallback(() => {
    if (pmBaseUrl) openUrl(pmBaseUrl);
  }, [openUrl, pmBaseUrl]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("title")}</Text>
        <View style={styles.spacer} />
        <Pressable accessibilityRole="button" onPress={openSettings} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>{t("settings")}</Text>
        </Pressable>
      </View>
      <StatusCard
        status={data.status}
        loading={data.statusLoading}
        statusError={data.statusError}
        settingsError={settingsError}
        openError={openError}
        baseUrl={pmBaseUrl}
        styles={styles}
        onOpen={openPm}
        onRefresh={data.refresh}
      />
      {paseoWorkspaceId ? (
        <MappingCard
          paseoWorkspaceId={paseoWorkspaceId}
          settingsStatus={settings.status}
          settingsError={settingsError}
          mapping={mapping}
          mappedHome={mappedHome}
          styles={styles}
          onOpen={openUrl}
          onOpenSettings={openSettings}
        />
      ) : null}
      <SessionCard session={data.session} sessionError={data.sessionError} styles={styles} />
      {data.session?.actor ? (
        <WorkspaceList
          workspaces={data.workspaces}
          loading={data.workspacesLoading}
          error={data.workspacesError}
          selectedWorkspaceId={data.selectedWorkspaceId}
          styles={styles}
          onSelect={data.selectWorkspace}
        />
      ) : null}
      {data.session?.actor && data.selectedWorkspaceId ? (
        <ProjectList
          projects={data.projects}
          loading={data.projectsLoading}
          error={data.projectsError}
          truncated={data.projectsTruncated}
          selectedProjectId={data.selectedProjectId}
          styles={styles}
          onToggle={data.toggleProject}
        />
      ) : null}
      <PagesCard
        pages={data.pages}
        loading={data.pagesLoading}
        error={data.pagesError}
        selectedWorkspaceId={data.selectedWorkspaceId}
        styles={styles}
        onOpen={openUrl}
      />
    </ScrollView>
  );
}
