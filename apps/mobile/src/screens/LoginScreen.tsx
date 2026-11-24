import { useState } from "react";
import { KeyboardAvoidingView, StyleSheet, Text, View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, ErrorBanner, Field, InfoBanner } from "../components/ui";
import { useI18n } from "../i18n";
import { LanguageSwitch } from "../i18n/LanguageSwitch";
import { errorMessage, useSession } from "../lib/session";
import { colors, font, space } from "../theme";

/** Same rule as the API: 10 to 128 characters. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export function LoginScreen() {
  const { login, register, expired } = useSession();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
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
          {registering ? t.login.create : t.login.welcome}
        </Text>
        <InfoBanner message={expired ? t.login.expired : null} />
        <Field
          label={t.login.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label={t.login.password}
          secureTextEntry
          maxLength={MAX_PASSWORD_LENGTH}
          accessibilityHint={
            registering ? t.login.passwordHint(MIN_PASSWORD_LENGTH) : undefined
          }
          autoComplete={registering ? "new-password" : "current-password"}
          textContentType={registering ? "newPassword" : "password"}
          value={password}
          onChangeText={setPassword}
        />
        {passwordTooShort && password.length > 0 && (
          <Text style={styles.hint}>{t.login.passwordHint(MIN_PASSWORD_LENGTH)}</Text>
        )}
        <ErrorBanner message={error} />
        <Button
          label={registering ? t.login.createButton : t.login.logIn}
          onPress={() => void submit()}
          disabled={!canSubmit}
          busy={busy}
        />
        <Button
          variant="secondary"
          label={registering ? t.login.haveAccount : t.login.newAccount}
          onPress={() => {
            setError(null);
            setMode(registering ? "login" : "register");
          }}
        />
        <LanguageSwitch />
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
