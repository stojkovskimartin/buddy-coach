"""Photos with a frozen clock (19 Nov in Zurich) and files in a temporary folder."""

from __future__ import annotations

import io
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from PIL import Image

from buddy_coach.core.deps import get_clock
from buddy_coach.media.deps import get_photo_storage
from buddy_coach.media.domain import MAX_UPLOAD_BYTES
from buddy_coach.media.storage import LocalPhotoStorage
from tests.support import VALID_PROFILE, register_and_login

pytestmark = pytest.mark.integration

URL = "/api/v1/photos"


@pytest.fixture(autouse=True)
def setup(app: FastAPI, tmp_path: Path) -> Iterator[Path]:
    now = {"at": datetime(2026, 11, 18, 23, 30, tzinfo=UTC)}
    app.state.now = now
    app.dependency_overrides[get_clock] = lambda: lambda: now["at"]
    app.dependency_overrides[get_photo_storage] = lambda: LocalPhotoStorage(str(tmp_path))
    yield tmp_path
    app.dependency_overrides.pop(get_clock, None)
    app.dependency_overrides.pop(get_photo_storage, None)


def _files(root: Path) -> list[str]:
    return sorted(p.name for p in root.rglob("*.jpg"))


def _jpeg(size: tuple[int, int] = (2000, 1500)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, "green").save(out, format="JPEG")
    return out.getvalue()


async def _athlete(client: httpx.AsyncClient, email: str = "athlete@example.com") -> dict[str, str]:
    headers = await register_and_login(client, email)
    await client.put("/api/v1/profile", json=VALID_PROFILE, headers=headers)
    return headers


async def _upload(
    client: httpx.AsyncClient, headers: dict[str, str], kind: str, data: bytes
) -> httpx.Response:
    return await client.post(
        URL, params={"kind": kind}, content=data, headers={**headers, "Content-Type": "image/jpeg"}
    )


async def test_upload_list_download_and_delete(client: httpx.AsyncClient, setup: Path) -> None:
    headers = await _athlete(client)
    created = await _upload(client, headers, "progress", _jpeg())
    assert created.status_code == 201
    photo = created.json()
    assert (photo["kind"], photo["day"], photo["width"], photo["height"]) == (
        "progress",
        "2026-11-19",
        1280,
        960,
    )

    listed = (await client.get(URL, params={"kind": "progress"}, headers=headers)).json()
    assert [p["id"] for p in listed] == [photo["id"]]

    image = await client.get(
        f"{URL}/{photo['id']}/image", params={"size": "thumb"}, headers=headers
    )
    assert image.headers["content-type"] == "image/jpeg"
    assert image.headers["cache-control"] == "private, no-store"
    with Image.open(io.BytesIO(image.content)) as thumb:
        assert max(thumb.size) == 320

    assert len(_files(setup)) == 2
    assert (await client.delete(f"{URL}/{photo['id']}", headers=headers)).status_code == 204
    assert _files(setup) == []
    assert (await client.get(f"{URL}/{photo['id']}/image", headers=headers)).status_code == 404


async def test_a_new_avatar_replaces_the_old_one(
    app: FastAPI, client: httpx.AsyncClient, setup: Path
) -> None:
    headers = await _athlete(client)
    first = (await _upload(client, headers, "avatar", _jpeg((300, 300)))).json()
    second = (await _upload(client, headers, "avatar", _jpeg((300, 300)))).json()
    listed = (await client.get(URL, params={"kind": "avatar"}, headers=headers)).json()
    assert [p["id"] for p in listed] == [second["id"]]
    app.state.now["at"] = datetime(2028, 1, 1, tzinfo=UTC)  # the avatar is not tied to a period
    later = (await client.get(URL, params={"kind": "avatar"}, headers=headers)).json()
    assert [p["id"] for p in later] == [second["id"]]
    assert not any(first["id"] in name for name in _files(setup))


async def test_meal_photos_expire_but_progress_photos_stay(
    app: FastAPI, client: httpx.AsyncClient, setup: Path
) -> None:
    headers = await _athlete(client)
    old_meal = (await _upload(client, headers, "meal", _jpeg((300, 300)))).json()
    progress = (await _upload(client, headers, "progress", _jpeg((300, 300)))).json()
    app.state.now["at"] = datetime(2027, 3, 1, 12, 0, tzinfo=UTC)  # more than 90 days later
    await _upload(client, headers, "meal", _jpeg((300, 300)))
    everything = (
        await client.get(URL, params={"from": "2026-11-01", "to": "2027-03-01"}, headers=headers)
    ).json()
    ids = {p["id"] for p in everything}
    assert old_meal["id"] not in ids
    assert progress["id"] in ids
    assert not any(old_meal["id"] in name for name in _files(setup))  # its files are gone too


async def test_photos_are_private_and_validated(client: httpx.AsyncClient) -> None:
    owner = await _athlete(client)
    other = await _athlete(client, "other@example.com")
    photo = (await _upload(client, owner, "meal", _jpeg((300, 300)))).json()
    assert (await client.get(f"{URL}/{photo['id']}/image", headers=other)).status_code == 404
    assert (await client.delete(f"{URL}/{photo['id']}", headers=other)).status_code == 404
    assert (await client.get(URL, headers=other)).json() == []

    assert (await _upload(client, owner, "meal", b"<svg></svg>")).status_code == 422
    assert (await _upload(client, owner, "selfie", _jpeg((300, 300)))).status_code == 422
    too_big = await _upload(client, owner, "meal", b"\0" * (MAX_UPLOAD_BYTES + 1))
    assert too_big.status_code == 413
    assert too_big.json()["code"] == "payload_too_large"

    async def chunks():  # no Content-Length: the cap applies while streaming
        for _ in range(11):
            yield b"\0" * (1024 * 1024)

    streamed = await client.post(URL, params={"kind": "meal"}, content=chunks(), headers=owner)
    assert streamed.status_code == 413


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", URL),
        ("POST", f"{URL}?kind=meal"),
        ("GET", f"{URL}/00000000-0000-0000-0000-000000000000/image"),
    ],
)
async def test_photos_need_authentication(
    client: httpx.AsyncClient, method: str, path: str
) -> None:
    assert (await client.request(method, path)).status_code == 401
