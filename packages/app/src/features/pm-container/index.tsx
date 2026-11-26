import { useCallback } from "react";
import { FolderKanban, ExternalLink } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { openExternalUrl } from "@/utils/open-external-url";

const ThemedFolderKanban = withUnistyles(FolderKanban, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

function OpenPmIcon({ color, size }: { color: string; size: number }) {
  return <ExternalLink color={color} size={size} strokeWidth={2.2} />;
}

/**
 * Mobile keeps PM in the system browser until the native WebView work lands.
 * `EXPO_PUBLIC_PM_URL` is the deployed PM origin; without it the screen points at
 * the existing PM sidebar entry instead of guessing a host.
 */
export function PmContainer() {
  const { t } = useTranslation();
  const url = process.env.EXPO_PUBLIC_PM_URL?.trim();
  const openPm = useCallback(() => {
    if (url) void openExternalUrl(url);
  }, [url]);

  return (
    <View style={styles.root}>
      <ThemedFolderKanban size={32} strokeWidth={1.8} />
      <Text style={styles.title}>
        {t("pmContainer.title", { defaultValue: "Project Management" })}
      </Text>
      <Text style={styles.body}>
        {url
          ? t("pmContainer.mobileBrowser", {
              defaultValue:
                "Project Management opens in your browser on mobile. You can sign in there without leaving a Paseo session open.",
            })
          : t("pmContainer.mobileUnavailable", {
              defaultValue:
                "Set EXPO_PUBLIC_PM_URL for this build, or open Project Management from the PM sidebar entry.",
            })}
      </Text>
      {url && (
        <Button variant="secondary" onPress={openPm} leftIcon={OpenPmIcon}>
          {t("pmContainer.openExternal", { defaultValue: "Open in browser" })}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[6],
    backgroundColor: theme.colors.surface0,
  },
  title: { color: theme.colors.foreground, fontSize: theme.fontSize.lg, fontWeight: "600" },
  body: {
    maxWidth: 420,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
