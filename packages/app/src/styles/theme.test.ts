import { describe, expect, it } from "vitest";
import {
  darkPureBlackTheme,
  darkTheme,
  FONT_SIZE,
  getNextThemePreference,
  lightTheme,
  THEME_OPTIONS,
} from "./theme";

describe("Typography scale", () => {
  it("names 14px as the default interface tier", () => {
    expect(FONT_SIZE).toEqual({
      code: 12,
      content: 14,
      control: 13,
      sm: 12,
      base: 14,
      lg: 16,
      xl: 18,
      "2xl": 20,
      "3xl": 22,
      "4xl": 26,
    });
  });
});

describe("Theme catalog", () => {
  it("owns the picker and shortcut order", () => {
    expect(THEME_OPTIONS.map((option) => option.name)).toEqual([
      "light",
      "dark",
      "auto",
      "zinc",
      "midnight",
      "claude",
      "ghostty",
      "pureBlack",
    ]);
    expect(getNextThemePreference("dark")).toBe("auto");
    expect(getNextThemePreference("pureBlack")).toBe("light");
  });
});

describe("Pure black theme", () => {
  it("uses a pure black application and terminal background", () => {
    expect(darkPureBlackTheme.colors.surface0).toBe("#000000");
    expect(darkPureBlackTheme.colors.background).toBe("#000000");
    expect(darkPureBlackTheme.colors.terminal.background).toBe("#000000");
  });

  it("uses Paseo's muted green accent", () => {
    expect(darkPureBlackTheme.colors.accent).toBe("#20744A");
    expect(darkPureBlackTheme.colors.accentBright).toBe("#7ccba0");
  });

  it("keeps PM's status signal rather than the accent as its success color", () => {
    expect(darkPureBlackTheme.colors.statusSuccess).toBe("#6ee7a0");
    expect(darkPureBlackTheme.colors.success).toBe("#6ee7a0");
  });

  it("steps its sidebar hover and selection off the black sidebar", () => {
    expect(darkPureBlackTheme.colors.surfaceSidebar).toBe("#000000");
    expect(darkPureBlackTheme.colors.surfaceSidebarHover).toBe("#111111");
    expect(darkPureBlackTheme.colors.surfaceSidebarSelected).toBe("#1d1d1d");
  });

  it("keeps ANSI black output readable on its zero-luminance terminal background", () => {
    expect(darkPureBlackTheme.colors.terminal.black).toBe("#595959");
    expect(darkPureBlackTheme.colors.terminal.brightBlack).toBe("#8a8a8a");
  });
});

// Hover and selected are derived from the sidebar color, so the default themes follow PM's
// sidebar surface rather than a hand-picked fill.
describe("Sidebar interaction surfaces", () => {
  it("derives Light hover and selection from the PM sidebar", () => {
    expect(lightTheme.colors.surfaceSidebarHover).toBe("#eaeae9");
    expect(lightTheme.colors.surfaceSidebarSelected).toBe("#d9d9d8");
  });

  it("derives Dark hover and selection from the PM sidebar", () => {
    expect(darkTheme.colors.surfaceSidebarHover).toBe("#1c1c1b");
    expect(darkTheme.colors.surfaceSidebarSelected).toBe("#262625");
  });
});

describe("Built-in light theme", () => {
  it("preserves its authored aliases and terminal contrast through the semantic builder", () => {
    expect(lightTheme.colors).toMatchObject({
      primary: "#232322",
      primaryForeground: "#fafaf9",
      destructiveForeground: "#fafaf9",
      accent: "#4b5bd6",
      ring: "#4b5bd6",
      terminal: {
        black: "#1a1a1e",
        brightBlack: "#3f3f46",
      },
    });
  });
});

describe("PM-aligned palettes", () => {
  it("rebases the default light and dark themes on PM's surfaces", () => {
    expect(lightTheme.colors).toMatchObject({
      surface0: "#ffffff",
      surface1: "#f4f4f2",
      surface2: "#f4f4f2",
      surface3: "#eaeae6",
      surface4: "#dcdcd6",
      surfaceSidebar: "#fafaf9",
      surfaceWorkspace: "#ffffff",
      foreground: "#232322",
      foregroundMuted: "#666660",
      foregroundExtraMuted: "#6f6f68",
      border: "rgba(0, 0, 0, 0.1)",
      borderAccent: "rgba(0, 0, 0, 0.18)",
      accent: "#4b5bd6",
      accentBright: "#6b78e0",
      accentForeground: "#ffffff",
      destructive: "#b42318",
      ring: "#4b5bd6",
    });

    expect(darkTheme.colors).toMatchObject({
      surface0: "#181817",
      surface1: "#222220",
      surface2: "#222220",
      surface3: "#2b2b28",
      surface4: "#363632",
      surfaceSidebar: "#111110",
      surfaceWorkspace: "#181817",
      foreground: "#ecece8",
      foregroundMuted: "#b0b0a8",
      foregroundExtraMuted: "#a0a099",
      border: "rgba(255, 255, 255, 0.1)",
      borderAccent: "rgba(255, 255, 255, 0.18)",
      accent: "#a8b2ff",
      accentBright: "#c4caff",
      accentForeground: "#111110",
      primary: "#ecece8",
      primaryForeground: "#111110",
      destructive: "#f0a0a0",
      destructiveForeground: "#111110",
      ring: "#a8b2ff",
    });
  });

  it("takes its status signals and 8% tints from PM", () => {
    expect(lightTheme.colors).toMatchObject({
      statusSuccess: "#15803d",
      statusDanger: "#b42318",
      statusWarning: "#92400e",
      statusMerged: "#6b21a8",
      statusSuccessTint: "#15803d14",
      statusDangerTint: "#b4231814",
      statusWarningTint: "#92400e14",
      success: "#15803d",
    });

    expect(darkTheme.colors).toMatchObject({
      statusSuccess: "#6ee7a0",
      statusDanger: "#f0a0a0",
      statusWarning: "#e8c77a",
      statusMerged: "#c4a6f0",
      statusSuccessTint: "#6ee7a014",
      statusDangerTint: "#f0a0a014",
      statusWarningTint: "#e8c77a14",
      success: "#6ee7a0",
    });
  });
});
