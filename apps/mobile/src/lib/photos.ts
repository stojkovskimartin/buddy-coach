/**
 * Photos from the phone: taken with the camera or picked from the library, then shrunk to at most
 * 1600 px and re-encoded as JPEG here, so uploads are small and carry no location or other
 * metadata (the server strips it again). Kept apart from the screens so tests replace it.
 */
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { LocalizedError, currentLocale } from "../i18n";
import { MESSAGES } from "../i18n/messages";

const LONG_EDGE = 1600;

export type PhotoSource = "camera" | "library";

/** A JPEG ready to upload, or null when the athlete cancelled. Throws when access is refused. */
export async function pickPhoto(source: PhotoSource): Promise<Blob | null> {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    const text = MESSAGES[currentLocale()].photos;
    throw new LocalizedError(source === "camera" ? text.cameraOff : text.libraryOff);
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, exif: false };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const context = ImageManipulator.manipulate(asset.uri);
  let saved;
  try {
    if (Math.max(asset.width, asset.height) > LONG_EDGE) {
      context.resize(asset.width >= asset.height ? { width: LONG_EDGE } : { height: LONG_EDGE });
    }
    const image = await context.renderAsync();
    try {
      saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    } finally {
      image.release(); // native memory, freed at once rather than by the garbage collector
    }
  } finally {
    context.release();
  }
  const blob = await (await fetch(saved.uri)).blob();
  return blob.type === "image/jpeg" ? blob : new Blob([blob], { type: "image/jpeg" });
}

/** A data URI to show a downloaded photo in an Image. */
export function dataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The photo could not be shown."));
    reader.readAsDataURL(blob);
  });
}
