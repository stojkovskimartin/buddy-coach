import type { Photo, PhotoKind } from "@buddy/api-client";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { errorMessage, useSession } from "../lib/session";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 10 * 1024 * 1024;

/** A private photo: fetched with the session as a blob and shown through a short-lived URL. */
function PhotoImage({ photo, size, alt }: { photo: Photo; size: "full" | "thumb"; alt: string }) {
  const { api } = useSession();
  const [url, setUrl] = useState<string | "failed" | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    api.photoImage(photo.id, size).then(
      (blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      },
      () => active && setUrl("failed"),
    );
    return () => {
      active = false;
      setUrl(null);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, photo.id, size]);
  if (url && url !== "failed") return <img src={url} alt={alt} />;
  const state = url === "failed" ? "could not be loaded" : "loading";
  return <span className="photo-placeholder" role="img" aria-label={`${alt} (${state})`} />;
}

/**
 * Photos of one kind (meal, progress or avatar) in a period, with upload and delete. Photos are
 * shrunk and stripped of location data by the server; only their owner can see them.
 */
export function PhotoStrip({
  kind,
  title,
  range,
  canAdd = true,
}: {
  kind: PhotoKind;
  title: string;
  range?: { from: string; to: string };
  canAdd?: boolean;
}) {
  const { api } = useSession();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [open, setOpen] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const from = range?.from;
  const to = range?.to;

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const list = await api.listPhotos({ kind, ...(from && to ? { from, to } : {}) });
      if (id === request.current) setPhotos(list);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    }
  }, [api, kind, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOpen(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // the same file can be picked again
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return setError("Choose a JPEG, PNG or WebP photo.");
    if (file.size > MAX_BYTES) return setError("A photo can be at most 10 MB.");
    void change(() => api.uploadPhoto(kind, file));
  }

  return (
    <div className="photos" role="group" aria-label={title}>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="photo"
                aria-label={`Open ${title.toLowerCase()} from ${p.day}`}
                onClick={() => setOpen(p)}
              >
                <PhotoImage photo={p} size="thumb" alt={`${title} from ${p.day}`} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <figure className="photo-open">
          <PhotoImage photo={open} size="full" alt={`${title} from ${open.day}`} />
          <figcaption>
            {open.day}
            <button type="button" className="link" onClick={() => setOpen(null)}>
              Close
            </button>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => void change(() => api.deletePhoto(open.id))}
            >
              Delete photo
            </button>
          </figcaption>
        </figure>
      )}
      {canAdd && (
        <label className="upload">
          {busy ? "Uploading…" : kind === "avatar" ? "Choose a profile picture" : "Add a photo"}
          <input type="file" accept={ACCEPT} disabled={busy} onChange={pick} />
        </label>
      )}
    </div>
  );
}
