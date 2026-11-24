import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import type { TokenStore } from "@buddy/api-client";

import { I18nProvider, useI18n } from "./src/i18n";
import { SessionProvider, useSession, type CreateApi } from "./src/lib/session";
import { CoachScreen } from "./src/screens/CoachScreen";
import { ConnectionsScreen } from "./src/screens/ConnectionsScreen";
import { FoodScreen } from "./src/screens/FoodScreen";
import { ProgressScreen } from "./src/screens/ProgressScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { TOUCH_TARGET, colors, font, space } from "./src/theme";

const TABS = ["home", "food", "progress", "coach", "connections"] as const;
type Tab = (typeof TABS)[number];

/** Root component. The props are for tests; the app uses the real client and secure storage. */
export default function App({
  createApi,
  tokens,
  restore,
}: {
  createApi?: CreateApi;
  tokens?: TokenStore;
  restore?: () => Promise<boolean>;
}) {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider createApi={createApi} tokens={tokens} restore={restore}>
          <StatusBar style="dark" />
          <Root />
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { status } = useSession();
  const { t } = useI18n();
  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel={t.loading} color={colors.primary} />
      </View>
    );
  }
  if (status === "loggedOut") {
    return (
      <SafeAreaView style={styles.fill}>
        <LoginScreen />
      </SafeAreaView>
    );
  }
  return <LoggedIn />;
}

/** Tabs stay mounted, so the chat survives switching tabs; logging out resets them. Screens load
 * when first shown. */
function LoggedIn() {
  const [tab, setTab] = useState<Tab>("home");
  const { t } = useI18n();
  return (
    <SafeAreaView style={styles.fill} edges={["top", "left", "right", "bottom"]}>
      <View style={[styles.fill, tab !== "home" && styles.hidden]}>
        <HomeScreen active={tab === "home"} onOpenCoach={() => setTab("coach")} />
      </View>
      <View style={[styles.fill, tab !== "food" && styles.hidden]}>
        <FoodScreen active={tab === "food"} />
      </View>
      <View style={[styles.fill, tab !== "progress" && styles.hidden]}>
        <ProgressScreen active={tab === "progress"} />
      </View>
      <View style={[styles.fill, tab !== "coach" && styles.hidden]}>
        <CoachScreen />
      </View>
      <View style={[styles.fill, tab !== "connections" && styles.hidden]}>
        <ConnectionsScreen active={tab === "connections"} />
      </View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {TABS.map((key) => (
          <TabButton key={key} label={t.tabs[key]} active={tab === key} onPress={() => setTab(key)} />
        ))}
      </View>
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.tab}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tabText, active && styles.tabActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  hidden: { display: "none" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, minHeight: TOUCH_TARGET + space.sm, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: font.body, color: colors.muted },
  tabActive: { color: colors.primary, fontWeight: "700" },
});
