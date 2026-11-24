import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef } from "react";
import { Linking, Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useI18n } from "../i18n";
import { colors, font, space } from "../theme";
import { Button } from "./ui";

/** Food packaging barcodes. */
const FOOD_BARCODES = ["ean13", "ean8", "upc_a", "upc_e"] as const;

/** Full-screen camera that returns the first food barcode it sees. Asks for the camera once;
 * nothing is recorded or stored. */
export function BarcodeScanner({
  visible,
  onScanned,
  onClose,
}: {
  visible: boolean;
  onScanned: (code: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const { t } = useI18n();
  const done = useRef(false); // the camera reports the same code many times a second
  useEffect(() => {
    if (visible) done.current = false;
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.screen}>
        <Text accessibilityRole="header" style={styles.title}>
          {t.scanner.title}
        </Text>
        {permission?.granted ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODES] }}
            onBarcodeScanned={({ data }) => {
              if (done.current) return;
              done.current = true;
              onScanned(data);
            }}
            accessibilityLabel={t.scanner.camera}
          />
        ) : (
          <View style={styles.ask}>
            <Text style={styles.body}>
              {permission && !permission.canAskAgain
                ? t.scanner.cameraOff
                : t.scanner.cameraNeeded}
            </Text>
            {!permission || permission.canAskAgain ? (
              <Button label={t.scanner.allow} onPress={() => void requestPermission()} />
            ) : (
              <Button label={t.scanner.settings} onPress={() => void Linking.openSettings()} />
            )}
          </View>
        )}
        <Button variant="secondary" label={t.cancel} onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: space.lg, backgroundColor: colors.background },
  title: { fontSize: font.title, fontWeight: "600", color: colors.text },
  camera: { flex: 1, borderRadius: 12, overflow: "hidden" },
  ask: { flex: 1, justifyContent: "center", gap: space.lg },
  body: { fontSize: font.body, color: colors.text },
});
