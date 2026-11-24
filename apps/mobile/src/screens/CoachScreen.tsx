import type { ChatReply } from "@buddy/api-client";
import { useRef, useState } from "react";
import {
  AccessibilityInfo,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../components/ui";
import { useI18n } from "../i18n";
import { errorMessage, useSession } from "../lib/session";
import { TOUCH_TARGET, colors, font, radius, space } from "../theme";

interface Turn {
  id: number;
  from: "you" | "coach";
  text: string;
  agent?: ChatReply["agent"];
  escalated?: boolean;
  failed?: boolean;
  degraded?: boolean;
}

/** Same limit as the API. */
const MAX_MESSAGE_LENGTH = 2000;

export function CoachScreen() {
  const { api } = useSession();
  const { t } = useI18n();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // A ref, not state: two quick taps must not send twice before the re-render.
  const sending = useRef(false);
  const nextId = useRef(0);
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<Turn>>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending.current) return;
    sending.current = true;
    setTurns((t) => [...t, { id: nextId.current++, from: "you", text: trimmed }]);
    setMessage("");
    setBusy(true);
    try {
      const reply = await api.chat(trimmed);
      setTurns((t) => [
        ...t,
        {
          id: nextId.current++,
          from: "coach",
          text: reply.reply,
          agent: reply.agent,
          escalated: reply.escalated,
          degraded: reply.degraded,
        },
      ]);
      announce(reply.reply);
    } catch (e) {
      announce(errorMessage(e));
      setTurns((t) => [
        ...t,
        { id: nextId.current++, from: "coach", text: errorMessage(e), failed: true },
      ]);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={insets.top}
      style={styles.screen}
    >
      <FlatList
        ref={list}
        data={turns}
        keyExtractor={(turn) => String(turn.id)}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.suggestions}>
            <Text style={styles.muted}>{t.coach.intro}</Text>
            {t.coach.suggestions.map((s) => (
              <Pressable
                key={s}
                accessibilityRole="button"
                onPress={() => void send(s)}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        }
        renderItem={({ item }) => <Bubble turn={item} />}
        ListFooterComponent={
          busy ? (
            <Text accessibilityLiveRegion="polite" style={styles.muted}>
              {t.coach.thinking}
            </Text>
          ) : undefined
        }
      />
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel={t.coach.message}
          placeholder={t.coach.placeholder}
          placeholderTextColor={colors.muted}
          maxLength={MAX_MESSAGE_LENGTH}
          multiline
          value={message}
          onChangeText={setMessage}
          style={styles.input}
        />
        <Button label={t.coach.send} onPress={() => void send(message)} disabled={busy || !message.trim()} />
      </View>
      <Text style={[styles.muted, styles.disclaimer]}>
        {t.coach.disclaimer}
      </Text>
    </KeyboardAvoidingView>
  );
}

/** Android reads new bubbles through their live region; iOS needs an explicit announcement. */
function announce(text: string) {
  if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(text);
}

function Bubble({ turn }: { turn: Turn }) {
  const { t } = useI18n();
  const alert = turn.escalated || turn.failed;
  return (
    <View
      testID={`turn-${turn.from}`}
      accessible={alert}
      accessibilityRole={alert ? "alert" : undefined}
      accessibilityLiveRegion={alert ? "assertive" : turn.from === "coach" ? "polite" : "none"}
      style={[
        styles.bubble,
        turn.from === "you" ? styles.you : styles.coach,
        alert && styles.alertBubble,
      ]}
    >
      {turn.escalated && <Text style={styles.flag}>{t.coach.important}</Text>}
      {turn.failed && <Text style={styles.flag}>{t.coach.unreachable}</Text>}
      {turn.agent && !turn.escalated && (
        <Text style={styles.agent}>{t.coach.agents[turn.agent]}</Text>
      )}
      <Text style={turn.from === "you" ? styles.youText : styles.coachText}>{turn.text}</Text>
      {turn.degraded && (
        <Text style={styles.note}>{t.coach.degraded}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  messages: { padding: space.lg, gap: space.sm, flexGrow: 1 },
  suggestions: { gap: space.sm },
  chip: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.primary, fontSize: font.small },
  bubble: { maxWidth: "85%", borderRadius: radius.md, padding: space.md, gap: space.xs },
  you: { alignSelf: "flex-end", backgroundColor: colors.youBubble },
  coach: { alignSelf: "flex-start", backgroundColor: colors.coachBubble },
  alertBubble: { backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.danger },
  youText: { color: colors.primaryText, fontSize: font.body },
  coachText: { color: colors.text, fontSize: font.body },
  agent: { color: colors.primary, fontSize: font.small, fontWeight: "600" },
  flag: { color: colors.danger, fontSize: font.small, fontWeight: "700" },
  composer: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: font.body,
    color: colors.text,
  },
  muted: { color: colors.muted, fontSize: font.small },
  note: { color: colors.muted, fontSize: font.small, fontStyle: "italic" },
  disclaimer: { textAlign: "center", paddingBottom: space.sm, backgroundColor: colors.surface },
});
