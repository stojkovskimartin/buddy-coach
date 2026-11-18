import type { ChatReply } from "@buddy/api-client";
import { useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "../components/ui";
import { errorMessage, useSession } from "../lib/session";
import { TOUCH_TARGET, colors, font, radius, space } from "../theme";

interface Turn {
  id: number;
  from: "you" | "coach";
  text: string;
  agent?: ChatReply["agent"];
  escalated?: boolean;
  failed?: boolean;
}

export const AGENT_LABELS: Record<ChatReply["agent"], string> = {
  head_coach: "Head Coach",
  nutrition: "Nutrition",
  training: "Training",
  recovery: "Recovery",
  progress: "Progress",
  motivation: "Motivation",
};

export const SUGGESTIONS = [
  "How many calories should I eat today?",
  "What should I eat after a hard interval session?",
  "Should I take creatine?",
  "I slept badly – should I still train today?",
];

/** Same limit as the API. */
const MAX_MESSAGE_LENGTH = 2000;

export function CoachScreen() {
  const { api } = useSession();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);
  const list = useRef<FlatList<Turn>>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
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
        },
      ]);
    } catch (e) {
      setTurns((t) => [
        ...t,
        { id: nextId.current++, from: "coach", text: errorMessage(e), failed: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <FlatList
        ref={list}
        data={turns}
        keyExtractor={(turn) => String(turn.id)}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.suggestions}>
            <Text style={styles.muted}>Ask your coach anything, for example:</Text>
            {SUGGESTIONS.map((s) => (
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
        ListFooterComponent={busy ? <Text style={styles.muted}>Coach is thinking…</Text> : undefined}
      />
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Your message"
          placeholder="Ask about food, training or recovery…"
          placeholderTextColor={colors.muted}
          maxLength={MAX_MESSAGE_LENGTH}
          multiline
          value={message}
          onChangeText={setMessage}
          style={styles.input}
        />
        <Button label="Send" onPress={() => void send(message)} disabled={busy || !message.trim()} />
      </View>
      <Text style={[styles.muted, styles.disclaimer]}>
        Buddy Coach is not a doctor. For medical questions, see a professional.
      </Text>
    </KeyboardAvoidingView>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const alert = turn.escalated || turn.failed;
  return (
    <View
      testID={`turn-${turn.from}`}
      accessible={alert}
      accessibilityRole={alert ? "alert" : undefined}
      style={[
        styles.bubble,
        turn.from === "you" ? styles.you : styles.coach,
        alert && styles.alertBubble,
      ]}
    >
      {turn.escalated && <Text style={styles.flag}>Important</Text>}
      {turn.failed && <Text style={styles.flag}>Could not reach your coach</Text>}
      {turn.agent && !turn.escalated && (
        <Text style={styles.agent}>{AGENT_LABELS[turn.agent]}</Text>
      )}
      <Text style={turn.from === "you" ? styles.youText : styles.coachText}>{turn.text}</Text>
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
  disclaimer: { textAlign: "center", paddingBottom: space.sm, backgroundColor: colors.surface },
});
