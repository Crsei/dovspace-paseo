import { type ComponentProps } from "react";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from "react-native-svg";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

export const DOVSPACE_LETTER_PATH =
  "M164 120H267C354 120 418 176 418 254C418 333 354 392 267 392H144V140C144 126 150 120 164 120Z";
export const DOVSPACE_WING_PATH =
  "M151 291L302 233C308 231 312 234 310 241L265 381C263 388 259 392 251 392H89C84 392 82 389 85 384L139 302C142 297 146 293 151 291Z";
export const DOVSPACE_WING_EDGE_PATH =
  "M91 389H251C257 389 261 386 263 380L308 240C309 236 307 234 303 236L152 294C147 296 144 299 141 304";

export function dovspaceGlyphMaskDataUri(size: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 512 512'><path fill='black' d='${DOVSPACE_LETTER_PATH}'/><path fill='black' d='${DOVSPACE_WING_PATH}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

interface DovspaceLogoProps {
  size?: number;
  color?: string;
  variant?: "full" | "glyph";
}

interface ThemedDovspaceLogoProps extends DovspaceLogoProps {
  themeForeground: string;
}

function DovspaceLogoView({
  size = 64,
  color,
  variant = "full",
  themeForeground,
}: ThemedDovspaceLogoProps) {
  const glyphColor = color ?? themeForeground;

  if (variant === "glyph") {
    return (
      <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
        <Path d={DOVSPACE_LETTER_PATH} fill={glyphColor} />
        <Path d={DOVSPACE_WING_PATH} fill={glyphColor} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <Defs>
        <SvgLinearGradient
          id="dovspace-tile"
          x1="40"
          y1="24"
          x2="464"
          y2="496"
          gradientUnits="userSpaceOnUse"
        >
          <Stop stopColor="#1B2231" />
          <Stop offset="0.48" stopColor="#111622" />
          <Stop offset="1" stopColor="#0D111B" />
        </SvgLinearGradient>
        <SvgLinearGradient
          id="dovspace-letter"
          x1="148"
          y1="112"
          x2="366"
          y2="396"
          gradientUnits="userSpaceOnUse"
        >
          <Stop stopColor="#5276FF" />
          <Stop offset="0.5" stopColor="#4945F5" />
          <Stop offset="1" stopColor="#7778FF" />
        </SvgLinearGradient>
        <SvgLinearGradient
          id="dovspace-wing"
          x1="156"
          y1="274"
          x2="263"
          y2="396"
          gradientUnits="userSpaceOnUse"
        >
          <Stop stopColor="#EEEFFF" />
          <Stop offset="0.5" stopColor="#D8D8FF" />
          <Stop offset="1" stopColor="#B7B5FA" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={16} y={16} width={480} height={480} rx={116} fill="url(#dovspace-tile)" />
      <Path d={DOVSPACE_LETTER_PATH} fill="url(#dovspace-letter)" />
      <Path d={DOVSPACE_WING_PATH} fill="url(#dovspace-wing)" />
      <Path
        d={DOVSPACE_WING_EDGE_PATH}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={0.2}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const ThemedDovspaceLogo = withUnistyles(DovspaceLogoView, (theme: Theme) => ({
  themeForeground: theme.colors.foreground,
}));

export function DovspaceLogo(props: DovspaceLogoProps) {
  return <ThemedDovspaceLogo {...props} />;
}

export function DovspaceGlyph({ size, color }: ComponentProps<typeof DovspaceLogo>) {
  return <DovspaceLogo size={size} color={color} variant="glyph" />;
}
