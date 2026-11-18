import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { SessionProvider, useSession, type CoachApi } from "./src/lib/session";
import { CoachScreen } from "./src/screens/CoachScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { TOUCH_TARGET, colors, font, space } from "./src/theme";

type Tab = "home" | "coach";

/** Root component. `api` and `initialStatus` are for tests; the app uses the real client. */
export default function App({
  api,
  initialStatus,
}: {
  api?: CoachApi;
  initialStatus?: "loggedIn" | "loggedOut";
}) {
  return (
    <SafeAreaProvider>
      <SessionProvider api={api} initialStatus={initialStatus}>
        <StatusBar style="dark" />
        <Root />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { status } = useSession();
  const [tab, setTab] = useState<Tab>("home");

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Loading" color={colors.primary} />
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
  return (
    <SafeAreaView style={styles.fill} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.fill}>
        {tab === "home" ? <HomeScreen onOpenCoach={() => setTab("coach")} /> : <CoachScreen />}
      </View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        <TabButton label="Today" active={tab === "home"} onPress={() => setTab("home")} />
        <TabButton label="Coach" active={tab === "coach"} onPress={() => setTab("coach")} />
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
      <Text style={[styles.tabText, active && styles.tabActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
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
