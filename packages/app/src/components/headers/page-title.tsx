import { useMemo, type ReactNode } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";

interface PageTitleProps {
  children: ReactNode;
  numberOfLines?: number;
  testID?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * The heading of page content, not app chrome: a settings detail or a projects list.
 * `ScreenTitle` is the 14pt header title; this is the 20/28 page role. Desktop pages that draw a
 * parent crumb above the title use the page-layout `PageTitle` composite, which renders this type.
 */
export function PageTitle({ children, numberOfLines = 1, testID, style }: PageTitleProps) {
  const combinedStyle = useMemo(() => [styles.text, style], [style]);
  return (
    <Text style={combinedStyle} numberOfLines={numberOfLines} testID={testID}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  text: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: theme.fontSize["2xl"],
    lineHeight: theme.lineHeight.page,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
}));
