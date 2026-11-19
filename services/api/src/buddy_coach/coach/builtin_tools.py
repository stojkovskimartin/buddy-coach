"""The tools agents use. Each wraps a deterministic engine or a domain service."""

from __future__ import annotations

from datetime import date, timedelta

from pydantic import BaseModel, ConfigDict, Field

from buddy_coach.checkin.schemas import CheckinIn, ReadinessOut
from buddy_coach.coach.tools import Tool, ToolContext, ToolRegistry
from buddy_coach.core.errors import NotFoundError
from buddy_coach.meals.domain import MealSlot
from buddy_coach.meals.schemas import DailyTotalsOut, NutrientTotals
from buddy_coach.nutrition.schemas import TargetsOut
from buddy_coach.profile.domain import GoalPriority, GoalStatus, age_on
from buddy_coach.science.micronutrients import (
    FOOD_SOURCES,
    SUPPLEMENT_ONLY_LIMITS,
    UNITS,
    UPPER_LIMIT,
    Nutrient,
    reference_for,
)
from buddy_coach.science.nutrition import (
    BodyData,
    Sex,
    session_carbs_g_per_hour,
)
from buddy_coach.science.recovery import (
    SessionIntensity,
    post_session_recovery,
    protein_distribution,
)
from buddy_coach.science.supplements import (
    HealthFlag,
    Purpose,
    Supplement,
    supplement_advice,
)
from buddy_coach.science.training import check_weekly_ramp, srpe_load
from buddy_coach.workouts.schemas import DayLoadOut, RampOut

ONBOARDING_NEEDED = "The user has not completed onboarding; ask them to fill in their profile."


class NoArguments(BaseModel):
    """Input for tools that take no arguments."""

    model_config = ConfigDict(extra="forbid")


class GoalSummary(BaseModel):
    """A goal without identifiers or free text (the user-written title can carry prompt
    injection and personal details, so the model only sees structured fields)."""

    goal_type: str
    sport: str | None
    target_date: date | None
    days_to_target: int | None
    target_weight_kg: float | None
    event_distance_km: float | None
    priority: str


class ProfileSummary(BaseModel):
    """Coaching-relevant profile data. No name, email or ids."""

    onboarding_complete: bool
    age_years: int | None = None
    sex: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    experience: str | None = None
    available_days_per_week: int | None = None
    minutes_per_session: int | None = None
    primary_goal: GoalSummary | None = None


class GoalList(BaseModel):
    """Active goals."""

    goals: list[GoalSummary]


async def _active_goals(ctx: ToolContext) -> list[GoalSummary]:
    goals = await ctx.profiles.list_goals(ctx.user_id, GoalStatus.ACTIVE)
    return [
        GoalSummary(
            goal_type=g.goal_type.value,
            sport=g.sport.value if g.sport else None,
            target_date=g.target_date,
            days_to_target=(g.target_date - ctx.today).days if g.target_date else None,
            target_weight_kg=g.target_weight_kg,
            event_distance_km=g.event_distance_km,
            priority=g.priority.value,
        )
        for g in goals
    ]


async def get_profile_summary(ctx: ToolContext, _: NoArguments) -> ProfileSummary:
    """Profile and primary goal."""
    profile = await ctx.profiles.find_profile(ctx.user_id)
    if profile is None:
        return ProfileSummary(onboarding_complete=False)
    primary = next(
        (g for g in await _active_goals(ctx) if g.priority == GoalPriority.PRIMARY.value), None
    )
    return ProfileSummary(
        onboarding_complete=True,
        age_years=age_on(profile.birth_year, ctx.today),
        sex=profile.sex.value,
        height_cm=profile.height_cm,
        weight_kg=profile.weight_kg,
        experience=profile.experience.value,
        available_days_per_week=profile.available_days_per_week,
        minutes_per_session=profile.minutes_per_session,
        primary_goal=primary,
    )


async def list_goals(ctx: ToolContext, _: NoArguments) -> GoalList:
    """Active goals."""
    return GoalList(goals=await _active_goals(ctx))


async def get_today_targets(ctx: ToolContext, _: NoArguments) -> TargetsOut:
    """Today's targets exactly as the app shows them (nutrition module)."""
    return await ctx.targets.targets_today(ctx.user_id)


class SessionInput(BaseModel):
    """A training session."""

    model_config = ConfigDict(extra="forbid")

    duration_min: float = Field(gt=0, le=24 * 60)


class FuellingOutput(BaseModel):
    """In-session carbohydrate guidance."""

    carbs_g_per_hour: int
    total_carbs_g: int


async def session_fuelling(_: ToolContext, args: SessionInput) -> FuellingOutput:
    """Carbohydrate to take in during a session."""
    per_hour = session_carbs_g_per_hour(args.duration_min)
    return FuellingOutput(
        carbs_g_per_hour=per_hour, total_carbs_g=round(per_hour * args.duration_min / 60)
    )


class SessionLoadInput(SessionInput):
    """A session with perceived effort."""

    rpe: float = Field(ge=1, le=10, description="Perceived effort, 1 (very easy) to 10 (max)")


class SessionLoadOutput(BaseModel):
    """Session-RPE training load."""

    load: float
    unit: str = "sRPE"


async def calculate_session_load(_: ToolContext, args: SessionLoadInput) -> SessionLoadOutput:
    """Session-RPE load."""
    return SessionLoadOutput(load=srpe_load(args.duration_min, args.rpe))


class RampInput(BaseModel):
    """Last week's load and the planned load, both in sRPE units."""

    model_config = ConfigDict(extra="forbid")

    last_week_load: float = Field(ge=0, le=50_000)
    planned_week_load: float = Field(ge=0, le=50_000)


class RampOutput(BaseModel):
    """Whether the planned week is a safe step up."""

    verdict: str
    max_allowed_load: float


async def check_weekly_ramp_tool(ctx: ToolContext, args: RampInput) -> RampOutput:
    """Weekly load ramp check by experience level."""
    profile = await ctx.profiles.find_profile(ctx.user_id)
    experience = profile.experience.value if profile else "beginner"
    result = check_weekly_ramp(args.last_week_load, args.planned_week_load, experience)
    return RampOutput(verdict=result.verdict.value, max_allowed_load=result.max_allowed_load)


class TodayCheckin(CheckinIn):
    """Today's check-in answers and the readiness the app computed from them (no date)."""

    readiness: ReadinessOut


async def get_today_readiness(ctx: ToolContext, _: NoArguments) -> TodayCheckin:
    """Today's check-in and readiness exactly as the app shows them (check-in module)."""
    checkin = await ctx.checkins.get(ctx.user_id, ctx.today)
    return TodayCheckin.model_validate(checkin.model_dump(exclude={"day"}))


LOAD_DAYS = 42
"""Days of history in the training load summary (the API's default)."""


class TrainingLoadSummary(BaseModel):
    """Where training stands today; the day-by-day history is left out to save tokens."""

    today: DayLoadOut
    acute_chronic_ratio: float | None
    ramp: RampOut
    excluded_activities: list[str]


async def get_training_load(ctx: ToolContext, _: NoArguments) -> TrainingLoadSummary:
    """Fitness, fatigue, form and this week's ramp from logged workouts (workouts module)."""
    load = await ctx.training.load(ctx.user_id, LOAD_DAYS)
    return TrainingLoadSummary.model_validate(load.model_dump(exclude={"days"}))


WEIGHT_DAYS = 28
FOOD_DAYS = 7


class WeightTrendOutput(BaseModel):
    """Body weight over the last 4 weeks (7-day trend of the morning weights)."""

    latest_kg: float | None
    latest_day: date | None
    trend_start_kg: float | None
    trend_end_kg: float | None
    trend_change_kg: float | None
    measurements: int


async def get_weight_trend(ctx: ToolContext, _: NoArguments) -> WeightTrendOutput:
    """Latest weight and the trend over 4 weeks (body module)."""
    history = await ctx.weights.history(
        ctx.user_id, ctx.today - timedelta(days=WEIGHT_DAYS - 1), ctx.today
    )
    latest = history.weights[0] if history.weights else None
    first = history.trend[0].weight_kg if history.trend else None
    last = history.trend[-1].weight_kg if history.trend else None
    return WeightTrendOutput(
        latest_kg=latest.weight_kg if latest else None,
        latest_day=latest.day if latest else None,
        trend_start_kg=first,
        trend_end_kg=last,
        trend_change_kg=round(last - first, 2) if first is not None and last is not None else None,
        measurements=len(history.weights),
    )


class MealTotals(BaseModel):
    """Calories of one meal and how many foods it has."""

    meal: str
    kcal: float
    foods: int


class FoodTodayOutput(BaseModel):
    """What was logged today, in totals. Food names are left out: they can be user-written text."""

    totals: NutrientTotals
    meals: list[MealTotals]


async def get_food_today(ctx: ToolContext, _: NoArguments) -> FoodTodayOutput:
    """Today's food diary in totals per meal (meals module)."""
    day = await ctx.meals.day(ctx.user_id, ctx.today)
    meals: dict[str, MealTotals] = {}
    for entry in day.entries:
        totals = meals.setdefault(
            entry.meal.value, MealTotals(meal=entry.meal.value, kcal=0, foods=0)
        )
        totals.kcal = round(totals.kcal + entry.kcal, 1)
        totals.foods += 1
    order = list(MealSlot)
    ordered = sorted(meals.values(), key=lambda m: order.index(MealSlot(m.meal)))
    return FoodTodayOutput(totals=day.totals, meals=ordered)


class FoodDaysOutput(BaseModel):
    """Totals of the days with food logged in the last 7 days."""

    days: list[DailyTotalsOut]


async def get_food_last_days(ctx: ToolContext, _: NoArguments) -> FoodDaysOutput:
    """Calories and macros per day over the last week (meals module)."""
    days = await ctx.meals.daily_totals(
        ctx.user_id, ctx.today - timedelta(days=FOOD_DAYS - 1), ctx.today
    )
    return FoodDaysOutput(days=days)


async def _body(ctx: ToolContext) -> BodyData:
    profile = await ctx.profiles.find_profile(ctx.user_id)
    if profile is None:
        raise NotFoundError(ONBOARDING_NEEDED)
    return BodyData(
        weight_kg=profile.weight_kg,
        height_cm=profile.height_cm,
        age_years=age_on(profile.birth_year, ctx.today),
        sex=Sex(profile.sex.value),
    )


class RecoveryInput(BaseModel):
    """A finished (or planned) session and the day around it."""

    model_config = ConfigDict(extra="forbid")

    duration_min: float = Field(gt=0, le=24 * 60)
    intensity: SessionIntensity
    hours_until_next_session: float | None = Field(default=None, ge=0, le=72)
    body_mass_lost_kg: float | None = Field(default=None, ge=0, le=5)
    meals_per_day: int = Field(default=4, ge=3, le=6)


class RecoveryOutput(BaseModel):
    """Recovery meal plus protein spread over the day."""

    recovery_carbs_g: int
    carbs_g_per_hour: int | None
    refuel_hours: int | None
    recovery_protein_g: int
    fluid_ml: int | None
    fluid_warning: str | None
    timing: str
    reason: str
    protein_per_meal_g: int
    meals_per_day: int
    note: str = (
        "Protein per meal shows how to spread protein; the daily protein target comes from "
        "get_today_targets."
    )


async def recovery_nutrition(ctx: ToolContext, args: RecoveryInput) -> RecoveryOutput:
    """Post-session refuelling and protein distribution from the recovery engine."""
    body = await _body(ctx)
    meal = post_session_recovery(
        body,
        args.duration_min,
        args.intensity,
        hours_until_next_session=args.hours_until_next_session,
        body_mass_lost_kg=args.body_mass_lost_kg,
    )
    spread = protein_distribution(body, args.meals_per_day)
    return RecoveryOutput(
        recovery_carbs_g=meal.carbs_g,
        carbs_g_per_hour=meal.carbs_g_per_hour,
        refuel_hours=meal.refuel_hours,
        recovery_protein_g=meal.protein_g,
        fluid_ml=meal.fluid_ml,
        fluid_warning=meal.fluid_warning,
        timing=meal.timing,
        reason=meal.reason,
        protein_per_meal_g=spread.protein_per_meal_g,
        meals_per_day=spread.meals,
    )


class SupplementInput(BaseModel):
    """What the user wants to achieve and any health information they shared."""

    model_config = ConfigDict(extra="forbid")

    purposes: list[Purpose] = Field(min_length=1, max_length=5)
    health_flags: list[HealthFlag] = Field(default_factory=list, max_length=5)


class SupplementEntry(BaseModel):
    """A catalogue entry as the model may present it."""

    name: str
    evidence: str
    what_it_does: str
    typical_use: str
    max_daily: str | None
    cautions: list[str]
    food_first: str | None


class SupplementOutput(BaseModel):
    """Suggested supplements, ones that need a professional, and notes."""

    suggested: list[SupplementEntry]
    ask_a_professional: list[SupplementEntry]
    notes: list[str]
    rule: str = "Only present these entries, doses and cautions. Food first."


PROFESSIONAL_ONLY_USE = "Only after a blood test and on your doctor's advice."


def _entry(item: Supplement) -> SupplementEntry:
    # Entries that need a doctor never carry a dose the model could pass on as advice.
    professional = item.requires_professional
    return SupplementEntry(
        name=item.name,
        evidence=item.evidence.value,
        what_it_does=item.what_it_does,
        typical_use=PROFESSIONAL_ONLY_USE if professional else item.typical_use,
        max_daily=None if professional else item.max_daily,
        cautions=list(item.cautions),
        food_first=item.food_first,
    )


async def supplement_guidance(_: ToolContext, args: SupplementInput) -> SupplementOutput:
    """Evidence-graded supplement options from the curated catalogue."""
    advice = supplement_advice(frozenset(args.purposes), frozenset(args.health_flags))
    return SupplementOutput(
        suggested=[_entry(s) for s in advice.suggested],
        ask_a_professional=[_entry(s) for s in advice.ask_a_professional],
        notes=list(advice.notes),
    )


class MicronutrientInput(BaseModel):
    """Which nutrients to look up; all when empty."""

    model_config = ConfigDict(extra="forbid")

    nutrients: list[Nutrient] = Field(default_factory=list, max_length=10)


class MicronutrientReference(BaseModel):
    """Daily reference for one nutrient."""

    nutrient: Nutrient
    daily_reference: float
    unit: str
    upper_limit: float | None
    upper_limit_applies_to: str | None
    food_sources: list[str]


class MicronutrientOutput(BaseModel):
    """References for the user's sex; intake is judged once food is logged."""

    references: list[MicronutrientReference]
    note: str = (
        "These are reference values, not a diagnosis. Intake can only be judged from logged food."
    )


async def micronutrient_reference(
    ctx: ToolContext, args: MicronutrientInput
) -> MicronutrientOutput:
    """Daily vitamin and mineral references with food sources."""
    body = await _body(ctx)
    wanted = args.nutrients or list(Nutrient)
    return MicronutrientOutput(
        references=[
            MicronutrientReference(
                nutrient=n,
                daily_reference=reference_for(n, body.sex),
                unit=UNITS[n],
                upper_limit=UPPER_LIMIT.get(n),
                upper_limit_applies_to=(
                    None
                    if n not in UPPER_LIMIT
                    else "supplements only"
                    if n in SUPPLEMENT_ONLY_LIMITS
                    else "all sources"
                ),
                food_sources=list(FOOD_SOURCES[n]),
            )
            for n in wanted
        ]
    )


def build_default_registry() -> ToolRegistry:
    """Registry with every built-in tool."""
    registry = ToolRegistry()
    registry.register(
        Tool(
            "get_profile_summary",
            "The user's profile and primary goal.",
            NoArguments,
            get_profile_summary,
        )
    )
    registry.register(Tool("list_goals", "The user's active goals.", NoArguments, list_goals))
    registry.register(
        Tool(
            "get_today_targets",
            "Today's calorie and macro targets, the same numbers the app shows.",
            NoArguments,
            get_today_targets,
        )
    )
    registry.register(
        Tool(
            "get_food_today",
            "What the user logged today: calories, protein, carbs and fat, and per meal.",
            NoArguments,
            get_food_today,
        )
    )
    registry.register(
        Tool(
            "get_food_last_days",
            "Calories and macros per day over the last 7 days of the food diary.",
            NoArguments,
            get_food_last_days,
        )
    )
    registry.register(
        Tool(
            "get_weight_trend",
            "The user's latest weight and its 7-day trend over the last 4 weeks.",
            NoArguments,
            get_weight_trend,
        )
    )
    registry.register(
        Tool(
            "session_fuelling",
            "Carbohydrate to take in during a training session of a given duration.",
            SessionInput,
            session_fuelling,
        )
    )
    registry.register(
        Tool(
            "calculate_session_load",
            "Training load of a session from duration and perceived effort.",
            SessionLoadInput,
            calculate_session_load,
        )
    )
    registry.register(
        Tool(
            "check_weekly_ramp",
            "Check whether a planned week's load is a safe increase over last week.",
            RampInput,
            check_weekly_ramp_tool,
        )
    )
    registry.register(
        Tool(
            "get_today_readiness",
            "Today's check-in (sleep, soreness, mood, pain, HRV, resting heart rate) and the "
            "readiness the app computed from it. Fails when there is no check-in today.",
            NoArguments,
            get_today_readiness,
        )
    )
    registry.register(
        Tool(
            "get_training_load",
            "Fitness, fatigue, form and this week's load ramp from the user's logged workouts.",
            NoArguments,
            get_training_load,
        )
    )
    registry.register(
        Tool(
            "recovery_nutrition",
            "Recovery meal after a session (carbs, protein, fluids, timing) and protein per meal.",
            RecoveryInput,
            recovery_nutrition,
        )
    )
    registry.register(
        Tool(
            "supplement_guidance",
            "Evidence-graded supplement options (e.g. creatine, caffeine, vitamin D) for given "
            "purposes, filtered by health information. The only source for supplement advice.",
            SupplementInput,
            supplement_guidance,
        )
    )
    registry.register(
        Tool(
            "micronutrient_reference",
            "Daily reference intakes, upper limits and food sources for vitamins and minerals.",
            MicronutrientInput,
            micronutrient_reference,
        )
    )
    return registry
