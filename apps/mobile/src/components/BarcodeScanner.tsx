import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
  const done = useRef(false); // the camera reports the same code many times a second

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onShow={() => {
        done.current = false;
      }}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.screen}>
        <Text accessibilityRole="header" style={styles.title}>
          Scan a barcode
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
            accessibilityLabel="Camera. Point it at the barcode on the package."
          />
        ) : (
          <View style={styles.ask}>
            <Text style={styles.body}>
              {permission && !permission.canAskAgain
                ? "Camera access is off for Buddy Coach. Turn it on in the phone's settings, or search the food by name."
                : "Buddy Coach needs the camera to read the barcode. Nothing is recorded."}
            </Text>
            {(!permission || permission.canAskAgain) && (
              <Button label="Allow camera" onPress={() => void requestPermission()} />
            )}
          </View>
        )}
        <Button variant="secondary" label="Cancel" onPress={onClose} />
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
