/**
 * The PM page surface Paseo links into. PM owns the pages and their behavior;
 * this registry owns the stable IDs, deep links, and the authorization context
 * each page needs. Keep it in step with PM's `apps/web/src/routes.tsx`.
 */
export type PmPageAuth = "public" | "session" | "workspace" | "project" | "admin";

export interface PmPageDefinition {
  readonly id: string;
  readonly path: string;
  readonly title: { readonly en: string; readonly zh: string };
  readonly group: "entry" | "account" | "workspace" | "project" | "agent" | "system";
  readonly auth: PmPageAuth;
  readonly params: readonly string[];
  /** PM contracts and features the page reads. */
  readonly requires: readonly string[];
}

export const PM_PAGES = [
  {
    id: "home",
    path: "/pm",
    title: { en: "Home", zh: "首页" },
    group: "entry",
    auth: "public",
    params: [],
    requires: ["/api/v1/capabilities", "/api/v1/auth/me", "/api/v1/workspaces"],
  },
  {
    id: "register",
    path: "/pm/register",
    title: { en: "Register", zh: "注册" },
    group: "account",
    auth: "public",
    params: [],
    requires: ["/api/v1/auth/register"],
  },
  {
    id: "invitation-accept",
    path: "/pm/invitations/accept",
    title: { en: "Accept invitation", zh: "接受邀请" },
    group: "account",
    auth: "public",
    params: [],
    requires: ["/api/v1/invitations/*"],
  },
  {
    id: "account-security",
    path: "/pm/account/security",
    title: { en: "Account security", zh: "账号安全" },
    group: "account",
    auth: "session",
    params: [],
    requires: ["/api/v1/auth/security/*"],
  },
  {
    id: "account-recovery",
    path: "/pm/account/recovery",
    title: { en: "Password recovery", zh: "密码恢复" },
    group: "account",
    auth: "public",
    params: [],
    requires: ["/api/v1/auth/password-recovery/*"],
  },
  {
    id: "account-verify-recovery-email",
    path: "/pm/account/verify-recovery-email",
    title: { en: "Verify recovery email", zh: "验证恢复邮箱" },
    group: "account",
    auth: "public",
    params: [],
    requires: ["/api/v1/auth/security/recovery-email/*"],
  },
  {
    id: "workspace-home",
    path: "/pm/:workspaceSlug/home",
    title: { en: "Workspace home", zh: "工作区首页" },
    group: "workspace",
    auth: "workspace",
    params: ["workspaceSlug"],
    requires: ["dashboard", "stream", "core"],
  },
  {
    id: "workspace-onboarding",
    path: "/pm/:workspaceSlug/onboarding",
    title: { en: "Onboarding", zh: "引导" },
    group: "workspace",
    auth: "session",
    params: ["workspaceSlug"],
    requires: ["/api/v1/auth/onboarding"],
  },
  {
    id: "workspace-dashboard",
    path: "/pm/:workspaceSlug/dashboard",
    title: { en: "Dashboard", zh: "仪表盘" },
    group: "workspace",
    auth: "workspace",
    params: ["workspaceSlug"],
    requires: ["/api/v1/workspaces/{workspaceId}/dashboard/*"],
  },
  {
    id: "projects",
    path: "/pm/:workspaceSlug/projects",
    title: { en: "Projects", zh: "项目列表" },
    group: "workspace",
    auth: "workspace",
    params: ["workspaceSlug"],
    requires: ["/api/v1/workspaces/{workspaceId}/projects/directory"],
  },
  {
    id: "project",
    path: "/pm/:workspaceSlug/projects/:projectId",
    title: { en: "Project", zh: "项目入口" },
    group: "project",
    auth: "project",
    params: ["workspaceSlug", "projectId"],
    requires: ["core", "project extensions"],
  },
  {
    id: "project-overview",
    path: "/pm/:workspaceSlug/projects/:projectId/overview",
    title: { en: "Project overview", zh: "项目概览" },
    group: "project",
    auth: "project",
    params: ["workspaceSlug", "projectId"],
    requires: ["core", "audit"],
  },
  {
    id: "project-issues",
    path: "/pm/:workspaceSlug/projects/:projectId/issues",
    title: { en: "Tasks", zh: "任务集合" },
    group: "project",
    auth: "project",
    params: ["workspaceSlug", "projectId"],
    requires: ["/entities", "queries"],
  },
  {
    id: "project-issue-new",
    path: "/pm/:workspaceSlug/projects/:projectId/issues/new",
    title: { en: "New task", zh: "新建任务" },
    group: "project",
    auth: "project",
    params: ["workspaceSlug", "projectId"],
    requires: ["planning.edit", "core create", "idempotency key"],
  },
  {
    id: "project-entity",
    path: "/pm/:workspaceSlug/projects/:projectId/entities/:entityId",
    title: { en: "Task detail", zh: "任务详情" },
    group: "project",
    auth: "project",
    params: ["workspaceSlug", "projectId", "entityId"],
    requires: ["core file", "revision"],
  },
  {
    id: "project-documents",
    path: "/pm/:workspaceSlug/projects/:projectId/documents",
    title: { en: "Project documents", zh: "项目文档" },
    group: "project",
    auth: "project",
    params: ["workspaceSlug", "projectId"],
    requires: ["document-sources", "change-history"],
  },
  {
    id: "project-roadmap",
    path: "/pm/:workspaceSlug/projects/:projectId/roadmap",
    title: { en: "Product roadmap", zh: "产品路线图" },
    group: "project",
    auth: "project",
    params: ["workspaceSlug", "projectId"],
    requires: ["product-roadmap"],
  },
  {
    id: "project-roadmap-canvas",
    path: "/pm/:workspaceSlug/projects/:projectId/roadmap/canvas",
    title: { en: "Roadmap canvas", zh: "路线图画布" },
    group: "project",
    auth: "project",
    params: ["workspaceSlug", "projectId"],
    requires: ["product-roadmap"],
  },
  {
    id: "project-files",
    path: "/pm/:workspaceSlug/projects/:projectId/files",
    title: { en: "Project files", zh: "项目文件" },
    group: "project",
    auth: "project",
    params: ["workspaceSlug", "projectId"],
    requires: ["attachments", "blobs"],
  },
  {
    id: "project-activity",
    path: "/pm/:workspaceSlug/projects/:projectId/activity",
    title: { en: "Project activity", zh: "项目活动" },
    group: "project",
    auth: "project",
    params: ["workspaceSlug", "projectId"],
    requires: ["audit", "changes"],
  },
  {
    id: "project-events",
    path: "/pm/:workspaceSlug/projects/:projectId/events",
    title: { en: "Project events", zh: "项目事件" },
    group: "project",
    auth: "project",
    params: ["workspaceSlug", "projectId"],
    requires: ["SSE"],
  },
  {
    id: "workspace-issues",
    path: "/pm/:workspaceSlug/issues",
    title: { en: "Workspace tasks", zh: "工作区任务" },
    group: "workspace",
    auth: "workspace",
    params: ["workspaceSlug"],
    requires: ["/entities"],
  },
  {
    id: "workspace-issue-new",
    path: "/pm/:workspaceSlug/issues/new",
    title: { en: "New workspace task", zh: "工作区新建任务" },
    group: "workspace",
    auth: "workspace",
    params: ["workspaceSlug"],
    requires: ["planning.edit", "core create"],
  },
  {
    id: "workspace-entity",
    path: "/pm/:workspaceSlug/entities/:entityId",
    title: { en: "Workspace entity", zh: "工作区实体详情" },
    group: "workspace",
    auth: "workspace",
    params: ["workspaceSlug", "entityId"],
    requires: ["core"],
  },
  {
    id: "workspace-documents",
    path: "/pm/:workspaceSlug/documents",
    title: { en: "Documents", zh: "文档工作台" },
    group: "workspace",
    auth: "workspace",
    params: ["workspaceSlug"],
    requires: ["document-sources", "change-history"],
  },
  {
    id: "workspace-views",
    path: "/pm/:workspaceSlug/views",
    title: { en: "Saved views", zh: "保存视图" },
    group: "workspace",
    auth: "workspace",
    params: ["workspaceSlug"],
    requires: ["core query", "core graph"],
  },
  {
    id: "workspace-members",
    path: "/pm/:workspaceSlug/members",
    title: { en: "Members", zh: "成员与人员" },
    group: "workspace",
    auth: "workspace",
    params: ["workspaceSlug"],
    requires: ["people", "members"],
  },
  {
    id: "workspace-notifications",
    path: "/pm/:workspaceSlug/notifications",
    title: { en: "Notifications", zh: "通知" },
    group: "workspace",
    auth: "workspace",
    params: ["workspaceSlug"],
    requires: ["notification-inbox"],
  },
  {
    id: "workspace-whiteboard",
    path: "/pm/:workspaceSlug/whiteboard",
    title: { en: "Whiteboard", zh: "白板" },
    group: "workspace",
    auth: "workspace",
    params: ["workspaceSlug"],
    requires: ["local personal data"],
  },
  {
    id: "workspace-settings",
    path: "/pm/:workspaceSlug/settings",
    title: { en: "Workspace settings", zh: "工作区设置" },
    group: "workspace",
    auth: "admin",
    params: ["workspaceSlug"],
    requires: ["config", "identity", "organization"],
  },
  {
    id: "workspace-settings-page",
    path: "/pm/:workspaceSlug/settings/:settingsPage",
    title: { en: "Workspace setting", zh: "设置子页" },
    group: "workspace",
    auth: "admin",
    params: ["workspaceSlug", "settingsPage"],
    requires: ["local-projects", "migrations", "diagnostics", "IM"],
  },
  {
    id: "workspace-agent",
    path: "/pm/:workspaceSlug/agent",
    title: { en: "PM Agent chat", zh: "PM Agent 对话" },
    group: "agent",
    auth: "workspace",
    params: ["workspaceSlug"],
    requires: ["/agent/api/*", "/mcp"],
  },
  {
    id: "agent",
    path: "/agent",
    title: { en: "Agent", zh: "Agent" },
    group: "agent",
    auth: "session",
    params: [],
    requires: ["Agent API"],
  },
  {
    id: "connect-agent",
    path: "/connect-agent",
    title: { en: "Connect agent", zh: "连接 Agent" },
    group: "agent",
    auth: "public",
    params: [],
    requires: ["Agent API", "local connection token"],
  },
] as const satisfies readonly PmPageDefinition[];

export type PmPageId = (typeof PM_PAGES)[number]["id"];

const PAGE_BY_ID: ReadonlyMap<string, PmPageDefinition> = new Map(
  PM_PAGES.map((page) => [page.id, page]),
);

export function pmPage(id: PmPageId): PmPageDefinition {
  const page = PAGE_BY_ID.get(id);
  if (!page) throw new Error(`Unknown PM page: ${id}`);
  return page;
}

export function pmPagePath(
  id: PmPageId,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const page = pmPage(id);
  return page.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined || value === "")
      throw new Error(`PM page ${id} requires parameter ${name}`);
    return encodeURIComponent(String(value));
  });
}

export function pmPageUrl(
  baseUrl: string,
  id: PmPageId,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}${pmPagePath(id, params)}`;
}
