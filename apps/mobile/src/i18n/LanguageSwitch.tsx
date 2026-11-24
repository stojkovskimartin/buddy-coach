import { LOCALES, LOCALE_NAMES, type Locale } from "@buddy/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { TOUCH_TARGET, colors, font, radius, space } from "../theme";
import { useI18n } from ".";

/** In each language's own script. */
const SHORT: Record<Locale, string> = { en: "EN", mk: "МК" };

/** English or Macedonian, each read out in its own name; the choice is remembered. */
export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t.language} style={styles.row}>
      {LOCALES.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="radio"
          accessibilityLabel={LOCALE_NAMES[option]}
          accessibilityLanguage={option}
          accessibilityState={{ checked: locale === option }}
          onPress={() => setLocale(option)}
          style={[styles.option, locale === option && styles.on]}
        >
          <Text style={[styles.text, locale === option && styles.textOn]}>{SHORT[option]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm, alignSelf: "center" },
  option: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET + space.lg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  on: { backgroundColor: colors.primary },
  text: { color: colors.primary, fontSize: font.body },
  textOn: { color: colors.primaryText, fontWeight: "600" },
});
