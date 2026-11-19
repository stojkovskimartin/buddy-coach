from __future__ import annotations

from datetime import date, timedelta

import pytest

from buddy_coach.core.errors import ValidationFailedError
from buddy_coach.meals.domain import MAX_RANGE_DAYS, check_plausible, validate_range

TODAY = date(2026, 11, 19)


def test_a_real_label_passes_with_rounding() -> None:
    check_plausible(grams=100, kcal=930, protein_g=0, carbs_g=0, fat_g=100)  # oil, rounded up
    check_plausible(grams=30, kcal=120, protein_g=3.1, carbs_g=20.4, fat_g=2.6)


def test_kilojoules_sent_as_kilocalories_are_refused() -> None:
    with pytest.raises(ValidationFailedError, match="kJ"):
        check_plausible(grams=100, kcal=1600, protein_g=10, carbs_g=60, fat_g=10)


def test_more_macronutrients_than_weight_are_refused() -> None:
    with pytest.raises(ValidationFailedError, match="more than the portion weighs"):
        check_plausible(grams=50, kcal=200, protein_g=30, carbs_g=30, fat_g=0)


def test_history_range_is_bounded() -> None:
    validate_range(TODAY - timedelta(days=MAX_RANGE_DAYS - 1), TODAY)
    with pytest.raises(ValidationFailedError):
        validate_range(TODAY, TODAY - timedelta(days=1))
    with pytest.raises(ValidationFailedError):
        validate_range(TODAY - timedelta(days=MAX_RANGE_DAYS), TODAY)
