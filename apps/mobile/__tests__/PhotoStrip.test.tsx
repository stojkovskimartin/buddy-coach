import type { Photo } from "@buddy/api-client";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import { PhotoStrip } from "../src/components/PhotoStrip";
import { SessionProvider } from "../src/lib/session";
import { fakeApi } from "../test/fakeApi";

const { pickPhoto } = jest.requireMock("../src/lib/photos");

const PHOTO = { id: "p1", kind: "meal", day: "2026-11-19", width: 1280, height: 960, created_at: "2026-11-19T12:00:00Z" } as Photo;

async function show(api: ReturnType<typeof fakeApi>, props: Partial<Parameters<typeof PhotoStrip>[0]> = {}) {
  await render(
    <SessionProvider createApi={() => api} restore={async () => true}>
      <PhotoStrip kind="meal" title="Meal photos" one="meal photo" range={{ from: "2026-11-19", to: "2026-11-19" }} {...props} />
    </SessionProvider>,
  );
}

afterEach(() => jest.restoreAllMocks());

describe("PhotoStrip", () => {
  it("lists the photos of a kind and day, and uploads one taken with the camera", async () => {
    const api = fakeApi();
    await show(api);
    expect(api.listPhotos).toHaveBeenCalledWith({ kind: "meal", from: "2026-11-19", to: "2026-11-19" });

    await fireEvent.press(await screen.findByRole("button", { name: "Take a photo" }));

    expect(pickPhoto).toHaveBeenCalledWith("camera");
    expect(api.uploadPhoto).toHaveBeenCalledWith("meal", expect.any(Blob));
    expect(api.listPhotos).toHaveBeenCalledTimes(2);
  });

  it("uploads nothing when the picker is cancelled, and shows a refused permission", async () => {
    const api = fakeApi();
    await show(api);
    pickPhoto.mockResolvedValueOnce(null);
    await fireEvent.press(await screen.findByRole("button", { name: "Choose from photos" }));
    expect(api.uploadPhoto).not.toHaveBeenCalled();

    pickPhoto.mockRejectedValueOnce(new Error("Photo access is off for Buddy Coach."));
    await fireEvent.press(screen.getByRole("button", { name: "Choose from photos" }));
    expect(await screen.findByText("Photo access is off for Buddy Coach.")).toBeTruthy();
  });

  it("opens a photo and deletes it after confirming", async () => {
    const api = fakeApi({ listPhotos: jest.fn().mockResolvedValue([PHOTO]) });
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    await show(api);

    await fireEvent.press(await screen.findByRole("button", { name: "Open meal photo from 2026-11-19" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Delete photo" }));

    expect(api.photoImage).toHaveBeenCalledWith("p1", "full");
    expect(api.deletePhoto).toHaveBeenCalledWith("p1");
  });

  it("says when a photo cannot be loaded, and offers no adding on past days", async () => {
    const api = fakeApi({
      listPhotos: jest.fn().mockResolvedValue([PHOTO]),
      photoImage: jest.fn().mockRejectedValue(new Error("gone")),
    });
    await show(api, { canAdd: false });
    expect(await screen.findByLabelText("Meal photos from 2026-11-19 (could not be loaded)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Take a photo" })).toBeNull();
  });
});
