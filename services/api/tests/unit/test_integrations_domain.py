"""Reading Withings measurements."""

from __future__ import annotations

from datetime import UTC, datetime

from buddy_coach.integrations.domain import parse_withings_measures

NOW = datetime(2026, 11, 19, 7, 0, tzinfo=UTC)


def _group(
    grpid: int, at: int, measures: list[dict[str, int]], attrib: int = 0
) -> dict[str, object]:
    return {"grpid": grpid, "date": at, "attrib": attrib, "measures": measures}


def test_weights_are_converted_to_kg_and_other_measures_ignored() -> None:
    at = int(NOW.timestamp()) - 3600
    body = {
        "updatetime": 1_800_000_000,
        "more": 1,
        "offset": 300,
        "measuregrps": [
            _group(
                1,
                at,
                [{"type": 1, "value": 72400, "unit": -3}, {"type": 6, "value": 1820, "unit": -2}],
            ),
            _group(2, at, [{"type": 1, "value": 7815, "unit": -2}]),
            _group(3, at, [{"type": 4, "value": 182, "unit": -2}]),  # height only
        ],
    }

    page = parse_withings_measures(body, NOW)

    assert [(r.external_id, r.weight_kg) for r in page.readings] == [("1", 72.4), ("2", 78.15)]
    assert page.readings[0].measured_at == datetime(2026, 11, 19, 6, 0, tzinfo=UTC)
    assert (page.update_time, page.more, page.offset) == (1_800_000_000, True, 300)


def test_guests_and_readings_from_the_future_are_left_out() -> None:
    weight = [{"type": 1, "value": 70000, "unit": -3}]
    now = int(NOW.timestamp())
    body = {
        "measuregrps": [
            _group(1, now - 60, weight, attrib=1),  # the scale could not tell who it was
            _group(2, now + 7200, weight),  # a wrong scale clock
            _group(3, now + 600, weight),  # within the clock tolerance
        ]
    }

    page = parse_withings_measures(body, NOW)

    assert [r.external_id for r in page.readings] == ["3"]
    assert (page.update_time, page.more, page.offset) == (None, False, 0)
