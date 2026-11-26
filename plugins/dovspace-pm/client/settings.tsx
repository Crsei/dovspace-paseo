import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useSettings, useTranslation, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  ScrollView,
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import { pmConnection, type PmConnectionValues } from "../shared/contracts.js";
import { messages } from "./messages.js";

type Mapping = PmConnectionValues["mappings"][number];

interface Draft {
  values: PmConnectionValues;
  revision: string;
}

interface SettingsStyles {
  root: object;
  text: object;
  muted: object;
  error: object;
  mapping: object;
}

function sameValues(left: PmConnectionValues, right: PmConnectionValues): boolean {
  if (left.baseUrl !== right.baseUrl || left.openMode !== right.openMode) return false;
  if (left.mappings.length !== right.mappings.length) return false;
  return left.mappings.every((mapping, index) => {
    const other = right.mappings[index];
    return (
      mapping !== undefined &&
      other !== undefined &&
      mapping.paseoWorkspaceId === other.paseoWorkspaceId &&
      mapping.pmWorkspaceId === other.pmWorkspaceId &&
      mapping.pmProjectId === other.pmProjectId
    );
  });
}

function useSettingsStyles(theme: PluginSurfaceProps["theme"], compact: boolean): SettingsStyles {
  return useMemo(
    () => ({
      root: {
        padding: compact ? 16 : 24,
        gap: 16,
      },
      text: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted },
      error: { color: theme.colors.statusDanger },
      mapping: {
        paddingVertical: 12,
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      },
    }),
    [theme, compact],
  );
}

interface ConnectionFieldsProps {
  baseUrl: string;
  openMode: PmConnectionValues["openMode"];
  disabled: boolean;
  onBaseUrl(value: string): void;
  onOpenMode(value: PmConnectionValues["openMode"]): void;
}

function ConnectionFields({
  baseUrl,
  openMode,
  disabled,
  onBaseUrl,
  onOpenMode,
}: ConnectionFieldsProps) {
  const { t } = useTranslation(messages);
  const options = useMemo(
    () => [
      { label: t("openModeExternal"), value: "external" as const },
      { label: t("openModeWorkspace"), value: "workspace-browser" as const },
    ],
    [t],
  );
  return (
    <>
      <SettingsInput
        label={t("settingsBaseUrl")}
        initialValue={baseUrl}
        placeholder="http://127.0.0.1:3225"
        disabled={disabled}
        onChangeText={onBaseUrl}
      />
      <SettingsSelect
        label={t("settingsOpenMode")}
        value={openMode}
        options={options}
        disabled={disabled}
        onValueChange={onOpenMode}
      />
    </>
  );
}

interface MappingRowProps {
  mapping: Mapping;
  index: number;
  disabled: boolean;
  styles: SettingsStyles;
  onUpdate(index: number, patch: Partial<Mapping>): void;
  onRemove(index: number): void;
}

function MappingRow({ mapping, index, disabled, styles, onUpdate, onRemove }: MappingRowProps) {
  const { t } = useTranslation(messages);
  const setPaseo = useCallback(
    (value: string) => onUpdate(index, { paseoWorkspaceId: value }),
    [index, onUpdate],
  );
  const setPm = useCallback(
    (value: string) => onUpdate(index, { pmWorkspaceId: value }),
    [index, onUpdate],
  );
  const setProject = useCallback(
    (value: string) => onUpdate(index, { pmProjectId: value.trim() ? value : null }),
    [index, onUpdate],
  );
  const remove = useCallback(() => onRemove(index), [index, onRemove]);
  return (
    <View style={styles.mapping}>
      <SettingsInput
        label={t("paseoWorkspaceId")}
        initialValue={mapping.paseoWorkspaceId}
        disabled={disabled}
        onChangeText={setPaseo}
      />
      <SettingsInput
        label={t("pmWorkspaceId")}
        initialValue={mapping.pmWorkspaceId}
        disabled={disabled}
        onChangeText={setPm}
      />
      <SettingsInput
        label={t("pmProjectId")}
        initialValue={mapping.pmProjectId ?? ""}
        disabled={disabled}
        onChangeText={setProject}
      />
      <SettingsAction
        label={t("mappingNumber", { number: index + 1 })}
        actionLabel={t("remove")}
        disabled={disabled}
        onPress={remove}
      />
    </View>
  );
}

interface MappingsCardProps {
  mappings: readonly Mapping[];
  rowKeys: readonly string[];
  disabled: boolean;
  styles: SettingsStyles;
  onUpdate(index: number, patch: Partial<Mapping>): void;
  onRemove(index: number): void;
  onAdd(): void;
}

function MappingsCard({
  mappings,
  rowKeys,
  disabled,
  styles,
  onUpdate,
  onRemove,
  onAdd,
}: MappingsCardProps) {
  const { t } = useTranslation(messages);
  return (
    <SettingsCard>
      {mappings.length === 0 ? (
        <View style={styles.mapping}>
          <Text style={styles.muted}>{t("noMappings")}</Text>
        </View>
      ) : (
        mappings.map((mapping, index) => (
          <MappingRow
            key={rowKeys[index] ?? `mapping-${index}`}
            mapping={mapping}
            index={index}
            disabled={disabled}
            styles={styles}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        ))
      )}
      <SettingsAction
        label={t("settingsMappings")}
        actionLabel={t("addMapping")}
        disabled={disabled}
        onPress={onAdd}
      />
    </SettingsCard>
  );
}

export function PmSettings({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(pmConnection);
  const { t } = useTranslation(messages);
  const styles = useSettingsStyles(theme, layout.compact);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rowKeys, setRowKeys] = useState<string[]>([]);
  const [formEpoch, setFormEpoch] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const keyCounter = useRef(0);
  const nextRowKey = useCallback(() => `mapping-${keyCounter.current++}`, []);

  const readyValues = settings.status === "ready" ? settings.values : null;
  const readyRevision = settings.status === "ready" ? settings.revision : null;

  useEffect(() => {
    if (!readyValues || readyRevision === null) return;
    setDraft((current) => {
      if (!current) return { values: readyValues, revision: readyRevision };
      if (current.revision === readyRevision) return current;
      if (sameValues(current.values, readyValues))
        return { values: readyValues, revision: readyRevision };
      return current;
    });
  }, [readyValues, readyRevision]);

  const mappingCount = draft?.values.mappings.length ?? 0;

  useEffect(() => {
    setRowKeys((current) => {
      if (current.length === mappingCount) return current;
      if (current.length > mappingCount) return current.slice(0, mappingCount);
      const added = [];
      for (let index = current.length; index < mappingCount; index += 1) added.push(nextRowKey());
      return [...current, ...added];
    });
  }, [mappingCount, nextRowKey]);

  const setBaseUrl = useCallback((baseUrl: string) => {
    setDraft((current) =>
      current ? { ...current, values: { ...current.values, baseUrl } } : current,
    );
    setLocalError(null);
  }, []);

  const setOpenMode = useCallback((openMode: PmConnectionValues["openMode"]) => {
    setDraft((current) =>
      current ? { ...current, values: { ...current.values, openMode } } : current,
    );
    setLocalError(null);
  }, []);

  const updateMapping = useCallback((index: number, patch: Partial<Mapping>) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        values: {
          ...current.values,
          mappings: current.values.mappings.map((mapping, candidate) =>
            candidate === index ? { ...mapping, ...patch } : mapping,
          ),
        },
      };
    });
    setLocalError(null);
  }, []);

  const addMapping = useCallback(() => {
    setDraft((current) =>
      current
        ? {
            ...current,
            values: {
              ...current.values,
              mappings: [
                ...current.values.mappings,
                { paseoWorkspaceId: "", pmWorkspaceId: "", pmProjectId: null },
              ],
            },
          }
        : current,
    );
    setRowKeys((current) => [...current, nextRowKey()]);
    setLocalError(null);
  }, [nextRowKey]);

  const removeMapping = useCallback((index: number) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            values: {
              ...current.values,
              mappings: current.values.mappings.filter((_, candidate) => candidate !== index),
            },
          }
        : current,
    );
    setRowKeys((current) => current.filter((_, candidate) => candidate !== index));
    setLocalError(null);
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    const invalid = draft.values.mappings.some(
      (mapping) => !mapping.paseoWorkspaceId.trim() || !mapping.pmWorkspaceId.trim(),
    );
    if (invalid) {
      setLocalError(t("mappingRequired"));
      return;
    }
    setLocalError(null);
    if (!(await settings.save(draft.values, draft.revision))) return;
    const parsed = pmConnection.schema.safeParse(draft.values);
    if (!parsed.success) return;
    setDraft((current) =>
      current ? { values: parsed.data, revision: current.revision } : current,
    );
    setFormEpoch((epoch) => epoch + 1);
  }, [draft, settings, t]);

  const reload = useCallback(async () => {
    setLocalError(null);
    await settings.reload();
    setDraft(null);
    setRowKeys([]);
    setFormEpoch((epoch) => epoch + 1);
  }, [settings]);

  const reset = useCallback(async () => {
    setLocalError(null);
    if (!(await settings.reset())) return;
    await settings.reload();
    setDraft(null);
    setRowKeys([]);
    setFormEpoch((epoch) => epoch + 1);
  }, [settings]);

  if (settings.status === "loading") {
    return (
      <View style={styles.root}>
        <Text style={styles.muted}>{t("loading")}</Text>
      </View>
    );
  }

  if (settings.status === "error" || settings.status === "invalid") {
    return (
      <View style={styles.root}>
        <Text style={styles.error}>{t("settingsLoadError", { error: settings.error })}</Text>
        <SettingsAction label={t("reload")} actionLabel={t("reload")} onPress={reload} />
      </View>
    );
  }

  if (!draft) {
    return (
      <View style={styles.root}>
        <Text style={styles.muted}>{t("loading")}</Text>
      </View>
    );
  }

  const invalidMapping = draft.values.mappings.some(
    (mapping) => !mapping.paseoWorkspaceId.trim() || !mapping.pmWorkspaceId.trim(),
  );

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <SettingsSection title={t("connection")}>
        <SettingsCard key={`connection-${formEpoch}`}>
          <ConnectionFields
            baseUrl={draft.values.baseUrl}
            openMode={draft.values.openMode}
            disabled={settings.saving}
            onBaseUrl={setBaseUrl}
            onOpenMode={setOpenMode}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settingsMappings")} info={t("settingsMappingsHint")}>
        <MappingsCard
          key={`mappings-${formEpoch}`}
          mappings={draft.values.mappings}
          rowKeys={rowKeys}
          disabled={settings.saving}
          styles={styles}
          onUpdate={updateMapping}
          onRemove={removeMapping}
          onAdd={addMapping}
        />
      </SettingsSection>

      <SettingsSection title={t("save")}>
        <SettingsCard>
          <SettingsAction
            label={t("save")}
            actionLabel={t("save")}
            disabled={settings.saving || invalidMapping}
            error={localError ?? settings.saveError}
            onPress={save}
          />
          <SettingsAction
            label={t("reload")}
            actionLabel={t("reload")}
            disabled={settings.saving}
            onPress={reload}
          />
          <SettingsAction
            label={t("reset")}
            actionLabel={t("reset")}
            disabled={settings.saving}
            onPress={reset}
          />
        </SettingsCard>
      </SettingsSection>
    </ScrollView>
  );
}
