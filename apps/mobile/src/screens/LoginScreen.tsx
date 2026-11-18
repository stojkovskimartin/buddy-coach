import { useState } from "react";
import { KeyboardAvoidingView, StyleSheet, Text, View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, ErrorBanner, Field, InfoBanner } from "../components/ui";
import { errorMessage, useSession } from "../lib/session";
import { colors, font, space } from "../theme";

/** Same rule as the API: 10 to 128 characters. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export function LoginScreen() {
  const { login, register, expired } = useSession();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const registering = mode === "register";
  const passwordTooShort = registering && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !passwordTooShort;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      if (registering) await register(email.trim(), password);
      else await login(email.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={insets.top}
      style={styles.screen}
    >
      <View style={styles.form}>
        <Text accessibilityRole="header" style={styles.title}>
          Buddy Coach
        </Text>
        <Text style={styles.subtitle}>
          {registering ? "Create your account" : "Welcome back"}
        </Text>
        <InfoBanner message={expired ? "Your session expired. Please log in again." : null} />
        <Field
          label="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Password"
          secureTextEntry
          maxLength={MAX_PASSWORD_LENGTH}
          accessibilityHint={
            registering ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined
          }
          autoComplete={registering ? "new-password" : "current-password"}
          textContentType={registering ? "newPassword" : "password"}
          value={password}
          onChangeText={setPassword}
        />
        {passwordTooShort && password.length > 0 && (
          <Text style={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters.</Text>
        )}
        <ErrorBanner message={error} />
        <Button
          label={registering ? "Create account" : "Log in"}
          onPress={() => void submit()}
          disabled={!canSubmit}
          busy={busy}
        />
        <Button
          variant="secondary"
          label={registering ? "I already have an account" : "Create an account"}
          onPress={() => {
            setError(null);
            setMode(registering ? "login" : "register");
          }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", backgroundColor: colors.background },
  form: { padding: space.xl, gap: space.md },
  title: { fontSize: font.heading, fontWeight: "700", color: colors.primary },
  subtitle: { fontSize: font.body, color: colors.muted, marginBottom: space.sm },
  hint: { fontSize: font.small, color: colors.muted },
});
