import type { Photo, PhotoKind } from "@buddy/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { errorMessage, useSession } from "../lib/session";
import { dataUri, pickPhoto, type PhotoSource } from "../lib/photos";
import { colors, font, radius, space } from "../theme";
import { Button, ErrorBanner } from "./ui";

/** A private photo: downloaded with the session and shown from memory, never by URL. */
function PhotoImage({ photo, size, label }: { photo: Photo; size: "full" | "thumb"; label: string }) {
  const { api } = useSession();
  const [uri, setUri] = useState<string | "failed" | null>(null);
  useEffect(() => {
    let active = true;
    api
      .photoImage(photo.id, size)
      .then(dataUri)
      .then(
        (u) => active && setUri(u),
        () => active && setUri("failed"),
      );
    return () => {
      active = false;
    };
  }, [api, photo.id, size]);
  const style = size === "thumb" ? styles.thumb : styles.full;
  if (uri && uri !== "failed")
    return <Image source={{ uri }} style={style} resizeMode={size === "thumb" ? "cover" : "contain"} accessible accessibilityLabel={label} />;
  const state = uri === "failed" ? "could not be loaded" : "loading";
  return (
    <View style={[style, styles.placeholder]} accessible accessibilityLabel={`${label} (${state})`}>
      {size === "full" && <Text style={styles.state}>{uri === "failed" ? "The photo could not be loaded." : "Loading…"}</Text>}
    </View>
  );
}

/** Photos of one kind (meal, progress or avatar) in a period: take one with the camera or pick
 * one, open it, delete it. Shrunk on the phone and again on the server; only their owner sees them. */
export function PhotoStrip({
  kind,
  title,
  one,
  range,
  canAdd = true,
  reloadKey = 0,
}: {
  kind: PhotoKind;
  title: string;
  /** Item name for one photo, e.g. "meal photo". */
  one: string;
  range?: { from: string; to: string };
  canAdd?: boolean;
  /** A new value reloads the list. */
  reloadKey?: number;
}) {
  const { api } = useSession();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [open, setOpen] = useState<Photo | null>(null);
  const [busy, setBusy] = useState<PhotoSource | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const from = range?.from;
  const to = range?.to;

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const list = await api.listPhotos({ kind, ...(from && to ? { from, to } : {}) });
      if (id !== request.current) return;
      setPhotos(list);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    }
  }, [api, kind, from, to]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function change(what: PhotoSource | "delete", action: () => Promise<boolean>) {
    setBusy(what);
    setError(null);
    try {
      if (await action()) {
        setOpen(null);
        await load();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const add = (source: PhotoSource) =>
    void change(source, async () => {
      const image = await pickPhoto(source);
      if (!image) return false; // cancelled
      await api.uploadPhoto(kind, image);
      return true;
    });

  const remove = (photo: Photo) =>
    Alert.alert("Delete this photo?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void change("delete", async () => {
            await api.deletePhoto(photo.id);
            return true;
          }),
      },
    ]);

  const avatar = kind === "avatar";
  return (
    <View style={styles.strip}>
      <ErrorBanner message={error} />
      {photos.length > 0 && (
        <View style={styles.grid}>
          {photos.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${one} from ${p.day}`}
              onPress={() => setOpen(p)}
            >
              <PhotoImage photo={p} size="thumb" label={`${title} from ${p.day}`} />
            </Pressable>
          ))}
        </View>
      )}
      {canAdd && (
        <View style={styles.actions}>
          <Button
            variant="secondary"
            label={avatar ? "Take a profile picture" : "Take a photo"}
            busy={busy === "camera"}
            disabled={busy !== null}
            onPress={() => add("camera")}
          />
          <Button
            variant="secondary"
            label={avatar ? "Choose a profile picture" : "Choose from photos"}
            busy={busy === "library"}
            disabled={busy !== null}
            onPress={() => add("library")}
          />
        </View>
      )}
      <Modal visible={open !== null} animationType="fade" onRequestClose={() => setOpen(null)}>
        <SafeAreaView style={styles.viewer}>
          {open && <PhotoImage photo={open} size="full" label={`${title} from ${open.day}`} />}
          {open && <Text style={styles.day}>{open.day}</Text>}
          <ErrorBanner message={error} />
          <Button label="Close" onPress={() => setOpen(null)} />
          {open && <Button variant="secondary" label="Delete photo" busy={busy === "delete"} onPress={() => remove(open)} />}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { gap: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  thumb: { width: 96, height: 96, borderRadius: radius.sm },
  full: { width: "100%", flex: 1, borderRadius: radius.md },
  placeholder: { backgroundColor: colors.border },
  actions: { gap: space.sm },
  viewer: { flex: 1, padding: space.lg, gap: space.md, backgroundColor: colors.background },
  day: { fontSize: font.body, color: colors.text, textAlign: "center" },
  state: { margin: space.lg, fontSize: font.body, color: colors.text },
});
