import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ExternalLink, FolderKanban, RotateCw } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { openExternalUrl } from "@/utils/open-external-url";

const DEFAULT_PM_PATH = "/pm/";
const LOAD_TIMEOUT_MS = 20_000;
const frameStyle = { flex: 1, minHeight: 0, border: "none", backgroundColor: "white" } as const;

const ThemedArrowLeft = withUnistyles(ArrowLeft, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedRotateCw = withUnistyles(RotateCw, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedExternalLink = withUnistyles(ExternalLink, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedFolderKanban = withUnistyles(FolderKanban, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

type PmEmbedMessage =
  | { type: "pm:ready" }
  | { type: "pm:route"; path: string }
  | { type: "pm:auth"; actorId: string }
  | { type: "pm:logout" }
  | { type: "pm:unauthorized"; status: number }
  | { type: "pm:workspace-lost" }
  | { type: "pm:error"; message: string };

/** Only PM router paths are accepted; schemes, dot segments and controls are rejected. */
function safePmPath(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  // eslint-disable-next-line no-control-regex -- Paths must reject raw control characters.
  if (!path || /[\\\u0000-\u001f]/.test(path) || /%2e|%2f|%5c/i.test(path)) return DEFAULT_PM_PATH;
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  if (pathname !== "/pm" && !pathname.startsWith("/pm/")) return DEFAULT_PM_PATH;
  if (path.startsWith("//") || pathname.split("/").some((part) => part === ".." || part === "."))
    return DEFAULT_PM_PATH;
  return path;
}

const pmEmbedEnvelope = z.object({
  source: z.literal("dovspace-pm"),
  version: z.literal(1),
  type: z.string(),
  path: z.string().optional(),
  actorId: z.string().optional(),
  status: z.number().optional(),
  message: z.string().optional(),
});

function readMessage(event: MessageEvent, frame: HTMLIFrameElement | null): PmEmbedMessage | null {
  if (!frame || event.source !== frame.contentWindow || event.origin !== window.location.origin)
    return null;
  const parsed = pmEmbedEnvelope.safeParse(event.data);
  if (!parsed.success) return null;
  const data = parsed.data;
  switch (data.type) {
    case "pm:ready":
      return { type: "pm:ready" };
    case "pm:route":
      return data.path !== undefined ? { type: "pm:route", path: data.path } : null;
    case "pm:auth":
      return data.actorId !== undefined ? { type: "pm:auth", actorId: data.actorId } : null;
    case "pm:logout":
      return { type: "pm:logout" };
    case "pm:unauthorized":
      return { type: "pm:unauthorized", status: data.status ?? 401 };
    case "pm:workspace-lost":
      return { type: "pm:workspace-lost" };
    case "pm:error":
      return { type: "pm:error", message: (data.message ?? "").slice(0, 500) };
    default:
      return null;
  }
}

/**
 * Same-origin PM embed for Web and Electron. PM keeps its own session; this frame
 * only hosts it and mirrors route/auth announcements into Paseo state. The
 * sandbox must retain `allow-same-origin` or PM's HttpOnly cookie never reaches it.
 */
export function PmContainer() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ pmPath?: string | string[] }>();
  const [src] = useState(() => safePmPath(params.pmPath));
  const [frameKey, setFrameKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceLost, setWorkspaceLost] = useState(false);
  const ready = useRef(false);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const currentPath = useRef(src);

  const retry = useCallback(() => {
    ready.current = false;
    setError(null);
    setLoading(true);
    setWorkspaceLost(false);
    setFrameKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!ready.current) {
        setLoading(false);
        setError(
          t("pmContainer.loadFailed", {
            defaultValue:
              "Project Management did not finish loading. Reload the frame or open it in a browser.",
          }),
        );
      }
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [frameKey, t]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = readMessage(event, frame.current);
      if (!message) return;
      switch (message.type) {
        case "pm:ready":
          ready.current = true;
          setLoading(false);
          setError(null);
          return;
        case "pm:route": {
          const path = safePmPath(message.path);
          if (path !== message.path) return;
          currentPath.current = path;
          router.setParams({ pmPath: path });
          return;
        }
        case "pm:auth":
          setError(null);
          return;
        case "pm:logout":
        case "pm:unauthorized":
          setWorkspaceLost(false);
          return;
        case "pm:workspace-lost":
          setWorkspaceLost(true);
          return;
        case "pm:error":
          setError(message.message || t("pmContainer.loadFailed"));
          return;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router, t]);

  const openExternal = useCallback(() => {
    try {
      void openExternalUrl(new URL(currentPath.current, window.location.origin).href);
    } catch {
      // The path is validated before it reaches this frame; a URL parse failure
      // leaves the button inert instead of opening an arbitrary target.
    }
  }, []);
  const goBack = useCallback(() => {
    frame.current?.contentWindow?.history.back();
  }, []);
  const onFrameLoad = useCallback(() => {
    ready.current = true;
    setLoading(false);
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <ToolbarButton label={t("pmContainer.back", { defaultValue: "Back" })} onPress={goBack}>
          <ThemedArrowLeft size={18} strokeWidth={2.2} />
        </ToolbarButton>
        <ToolbarButton label={t("pmContainer.reload", { defaultValue: "Reload" })} onPress={retry}>
          <ThemedRotateCw size={18} strokeWidth={2.2} />
        </ToolbarButton>
        <View style={styles.title}>
          <ThemedFolderKanban size={16} strokeWidth={2.2} />
          <Text style={styles.titleText}>
            {t("pmContainer.title", { defaultValue: "Project Management" })}
          </Text>
        </View>
        <ToolbarButton
          label={t("pmContainer.openExternal", { defaultValue: "Open in browser" })}
          onPress={openExternal}
        >
          <ThemedExternalLink size={18} strokeWidth={2.2} />
        </ToolbarButton>
      </View>
      {workspaceLost && (
        <Text style={styles.warning} role="status">
          {t("pmContainer.workspaceLost", {
            defaultValue: "Access to this workspace was removed in Project Management.",
          })}
        </Text>
      )}
      {error && (
        <View style={styles.error}>
          <Text style={styles.errorText} role="alert">
            {error}
          </Text>
          <Button variant="secondary" size="sm" onPress={retry}>
            {t("pmContainer.retry", { defaultValue: "Reload" })}
          </Button>
        </View>
      )}
      <View style={styles.frameHost}>
        {/* eslint-disable eslint-plugin-react/iframe-missing-sandbox -- PM must keep its HttpOnly session and run its own bundle; the frame is same-origin and trusted. */}
        <iframe
          key={frameKey}
          ref={frame}
          title={t("pmContainer.title", { defaultValue: "Project Management" })}
          src={src}
          style={frameStyle}
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
          allow="clipboard-read; clipboard-write"
          onLoad={onFrameLoad}
        />
        {/* eslint-enable eslint-plugin-react/iframe-missing-sandbox */}
        {loading && (
          <View style={styles.loading} pointerEvents="none">
            <Text style={styles.loadingText}>
              {t("pmContainer.loading", { defaultValue: "Loading Project Management…" })}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.surface0 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minHeight: 44,
    paddingHorizontal: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  title: { flex: 1, flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  titleText: { color: theme.colors.foreground, fontSize: theme.fontSize.sm, fontWeight: "600" },
  frameHost: { flex: 1, position: "relative" },
  loading: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface0,
  },
  loadingText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  warning: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface1,
    fontSize: theme.fontSize.sm,
  },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  errorText: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
}));
