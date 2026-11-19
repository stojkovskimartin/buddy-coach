"""Agent contracts: role, allowed tools and hard limits for every agent (ADR-0003)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class AgentName(StrEnum):
    """All agents in the network."""

    HEAD_COACH = "head_coach"
    NUTRITION = "nutrition"
    TRAINING = "training"
    RECOVERY = "recovery"
    PROGRESS = "progress"
    MOTIVATION = "motivation"


@dataclass(frozen=True, slots=True)
class AgentContract:
    """What an agent is, what it may do, and when it must stop."""

    name: AgentName
    role: str
    allowed_tools: frozenset[str]
    max_tool_calls: int = 4
    max_steps: int = 6
    max_output_tokens: int = 800
    token_budget: int = 20_000

    def __post_init__(self) -> None:
        if self.max_tool_calls < 0 or self.max_steps < 1 or self.token_budget < 1:
            msg = "agent limits must be positive"
            raise ValueError(msg)


BASE_RULES = """You are part of Buddy Coach, a personal coach for athletes of every level.
Rules you must always follow:
- Every number (calories, macros, load, readiness, targets) must come from a tool result.
  Never calculate or invent numbers yourself. If no tool gives the number, say you do not know.
- You are not a doctor. Do not diagnose, name diseases or suggest medication.
  For pain, illness or anything medical, recommend seeing a professional.
- Never encourage extreme diets, fasting, skipping meals or training through pain.
- Supplements: food first; only mention supplements, doses and cautions returned by
  supplement_guidance. Iron and high-dose vitamin D only after a blood test with a doctor.
- Be brief: at most about 150 words. Explain the "why" in one sentence.
- Answer in the user's language."""

PROFILE = "get_profile_summary"
GOALS = "list_goals"

CONTRACTS: dict[AgentName, AgentContract] = {
    AgentName.HEAD_COACH: AgentContract(
        name=AgentName.HEAD_COACH,
        role="You are the Head Coach. Answer general questions, keep the user motivated and "
        "point them to the right next step.",
        allowed_tools=frozenset({PROFILE, GOALS}),
        max_tool_calls=2,
    ),
    AgentName.NUTRITION: AgentContract(
        name=AgentName.NUTRITION,
        role="You are the nutrition specialist. Help with calorie and macro targets, meals, "
        "vitamins and minerals, recovery nutrition, supplements and fuelling for training. "
        "Use get_today_targets for any target, get_food_today / get_food_last_days for what the "
        "user ate and get_weight_trend for how their weight moves.",
        allowed_tools=frozenset(
            {
                PROFILE,
                "get_today_targets",
                "get_food_today",
                "get_food_last_days",
                "get_weight_trend",
                "session_fuelling",
                "recovery_nutrition",
                "supplement_guidance",
                "micronutrient_reference",
            }
        ),
    ),
    AgentName.TRAINING: AgentContract(
        name=AgentName.TRAINING,
        role="You are the training specialist. Help with sessions, load and progression. "
        "Check get_training_load and get_today_readiness before recommending more training; use "
        "the session load and ramp tools for planned sessions and weeks.",
        allowed_tools=frozenset(
            {
                PROFILE,
                GOALS,
                "get_training_load",
                "get_today_readiness",
                "calculate_session_load",
                "check_weekly_ramp",
            }
        ),
    ),
    AgentName.RECOVERY: AgentContract(
        name=AgentName.RECOVERY,
        role="You are the recovery specialist. Judge readiness with get_today_readiness; if there "
        "is no check-in today, ask the user to do the daily check-in. Suggest easy days or "
        "rest when needed.",
        allowed_tools=frozenset(
            {PROFILE, "get_today_readiness", "get_training_load", "recovery_nutrition"}
        ),
        max_tool_calls=3,
    ),
    AgentName.PROGRESS: AgentContract(
        name=AgentName.PROGRESS,
        role="You are the progress analyst. Summarise progress towards the user's goals "
        "honestly and suggest one focus for next week.",
        allowed_tools=frozenset(
            {PROFILE, GOALS, "get_training_load", "get_weight_trend", "get_food_last_days"}
        ),
        max_tool_calls=3,
    ),
    AgentName.MOTIVATION: AgentContract(
        name=AgentName.MOTIVATION,
        role="You are the motivation coach. Encourage without pressure, connect today's step "
        "to the user's goal, and never shame.",
        allowed_tools=frozenset({PROFILE, GOALS}),
        max_tool_calls=2,
    ),
}


def system_prompt(contract: AgentContract, coach_style: str | None) -> str:
    """Full system prompt for an agent, including the user's preferred coaching style."""
    style = {
        "strict": "Be direct and demanding, but respectful.",
        "data_driven": "Lead with the numbers from tools, then the advice.",
        "friendly": "Be warm and encouraging.",
    }.get(coach_style or "friendly", "Be warm and encouraging.")
    return f"{BASE_RULES}\n\n{contract.role}\nStyle: {style}"
