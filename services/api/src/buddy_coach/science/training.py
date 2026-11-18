"""Training load, fitness/fatigue model, ramp limits and readiness."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum

CTL_DAYS = 42
ATL_DAYS = 7
ACWR_HIGH_RISK = 1.5
ACWR_SWEET_SPOT = (0.8, 1.3)
MAX_WEEKLY_INCREASE = {"beginner": 0.10, "intermediate": 0.10, "advanced": 0.15, "elite": 0.15}


def srpe_load(duration_min: float, rpe: float) -> float:
    """Session-RPE load (Foster): minutes x perceived effort (1-10). Works for any sport."""
    if duration_min < 0:
        msg = "duration cannot be negative"
        raise ValueError(msg)
    if not 1 <= rpe <= 10:
        msg = "rpe must be between 1 and 10"
        raise ValueError(msg)
    return duration_min * rpe


def trimp_banister(
    duration_min: float, avg_hr: float, rest_hr: float, max_hr: float, sex: str
) -> float:
    """Banister TRIMP from average heart rate."""
    if not rest_hr < max_hr:
        msg = "rest_hr must be below max_hr"
        raise ValueError(msg)
    if duration_min < 0:
        msg = "duration cannot be negative"
        raise ValueError(msg)
    reserve = min(max((avg_hr - rest_hr) / (max_hr - rest_hr), 0.0), 1.0)
    a, b = (0.64, 1.92) if sex == "male" else (0.86, 1.67)
    return duration_min * reserve * a * math.exp(b * reserve)


@dataclass(frozen=True, slots=True)
class FitnessState:
    """Fitness (CTL), fatigue (ATL) and form (TSB) for one day."""

    day: date
    load: float
    fitness: float
    fatigue: float
    form: float


def fitness_series(
    daily_loads: dict[date, float],
    start: date,
    end: date,
    *,
    initial_fitness: float = 0.0,
    initial_fatigue: float = 0.0,
) -> list[FitnessState]:
    """Day-by-day fitness/fatigue model. Days without a load count as rest (load 0).

    Form on a day uses the previous day's values, so it reflects freshness going into that day.
    """
    if end < start:
        msg = "end must not be before start"
        raise ValueError(msg)
    fitness, fatigue = initial_fitness, initial_fatigue
    states: list[FitnessState] = []
    day = start
    while day <= end:
        load = daily_loads.get(day, 0.0)
        form = fitness - fatigue
        fitness += (load - fitness) / CTL_DAYS
        fatigue += (load - fatigue) / ATL_DAYS
        states.append(FitnessState(day=day, load=load, fitness=fitness, fatigue=fatigue, form=form))
        day += timedelta(days=1)
    return states


def acute_chronic_ratio(state: FitnessState) -> float | None:
    """Fatigue / fitness. Above 1.5 means load is rising faster than the body adapts."""
    if state.fitness <= 0:
        return None
    return state.fatigue / state.fitness


class RampVerdict(StrEnum):
    """Result of checking a planned week against last week."""

    OK = "ok"
    TOO_STEEP = "too_steep"


@dataclass(frozen=True, slots=True)
class RampCheck:
    """Verdict plus the largest load allowed for the planned week."""

    verdict: RampVerdict
    max_allowed_load: float


def check_weekly_ramp(
    last_week_load: float, planned_week_load: float, experience: str
) -> RampCheck:
    """Cap the week-on-week load increase by experience level."""
    if last_week_load < 0 or planned_week_load < 0:
        msg = "loads cannot be negative"
        raise ValueError(msg)
    increase = MAX_WEEKLY_INCREASE.get(experience, MAX_WEEKLY_INCREASE["beginner"])
    # After a break there is no baseline; allow a modest restart instead of 10% of zero.
    base = max(last_week_load, 300.0)
    max_allowed = base * (1 + increase)
    verdict = RampVerdict.OK if planned_week_load <= max_allowed else RampVerdict.TOO_STEEP
    return RampCheck(verdict=verdict, max_allowed_load=round(max_allowed, 1))


class ReadinessLevel(StrEnum):
    """Traffic light for today's training."""

    GREEN = "green"
    AMBER = "amber"
    RED = "red"


@dataclass(frozen=True, slots=True)
class ReadinessInputs:
    """Morning signals. Device values are optional; self-reports use 1 (bad) to 5 (great)."""

    sleep_quality: int
    soreness: int  # 1 = very sore, 5 = no soreness
    mood: int
    hrv_ms: float | None = None
    hrv_baseline: Sequence[float] = ()
    resting_hr: float | None = None
    resting_hr_baseline: float | None = None
    form: float | None = None  # TSB from the fitness model
    pain_reported: bool = False


@dataclass(frozen=True, slots=True)
class Readiness:
    """Score 0-100, a traffic light, and the factors that pulled it down."""

    score: int
    level: ReadinessLevel
    limiting_factors: tuple[str, ...]


def readiness(inputs: ReadinessInputs) -> Readiness:
    """Combine subjective and device signals into a readiness score.

    Each available signal is scored 0-1 and weighted; missing device data simply drops out.
    Reported pain always caps readiness at red.
    """
    for name in ("sleep_quality", "soreness", "mood"):
        value = getattr(inputs, name)
        if not 1 <= value <= 5:
            msg = f"{name} must be between 1 and 5"
            raise ValueError(msg)

    signals: list[tuple[str, float, float]] = [  # (name, score 0-1, weight)
        ("sleep", (inputs.sleep_quality - 1) / 4, 0.25),
        ("soreness", (inputs.soreness - 1) / 4, 0.2),
        ("mood", (inputs.mood - 1) / 4, 0.15),
    ]
    hrv_score = _hrv_score(inputs.hrv_ms, inputs.hrv_baseline)
    if hrv_score is not None:
        signals.append(("hrv", hrv_score, 0.25))
    if inputs.resting_hr is not None and inputs.resting_hr_baseline:
        elevation = inputs.resting_hr - inputs.resting_hr_baseline
        signals.append(("resting_hr", _clamp(1 - elevation / 10), 0.1))
    if inputs.form is not None:
        signals.append(("training_load", _clamp((inputs.form + 30) / 40), 0.15))

    total_weight = sum(weight for _, _, weight in signals)
    score = round(100 * sum(s * w for _, s, w in signals) / total_weight)
    limiting = tuple(name for name, s, _ in sorted(signals, key=lambda x: x[1]) if s < 0.5)

    if inputs.pain_reported:
        score = min(score, 39)
        limiting = ("pain", *limiting)
    level = (
        ReadinessLevel.GREEN
        if score >= 70
        else ReadinessLevel.AMBER
        if score >= 40
        else ReadinessLevel.RED
    )
    return Readiness(score=score, level=level, limiting_factors=limiting)


def _hrv_score(hrv_ms: float | None, baseline: Sequence[float]) -> float | None:
    """HRV vs the personal baseline as a z-score mapped to 0-1 (needs 7+ baseline days)."""
    if hrv_ms is None or len(baseline) < 7:
        return None
    mean = sum(baseline) / len(baseline)
    sd = math.sqrt(sum((x - mean) ** 2 for x in baseline) / (len(baseline) - 1))
    if sd == 0:
        return 1.0 if hrv_ms >= mean else 0.0
    return _clamp(0.5 + (hrv_ms - mean) / (4 * sd))


def _clamp(value: float) -> float:
    return min(max(value, 0.0), 1.0)
