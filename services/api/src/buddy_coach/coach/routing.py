"""Intent routing: which specialist handles a message.

Deterministic keyword scoring (English and German) keeps routing cheap, fast and testable.
An LLM classifier can replace it behind ``route`` when needed.
"""

from __future__ import annotations

import re

from buddy_coach.coach.contracts import AgentName

_KEYWORDS: dict[AgentName, tuple[str, ...]] = {
    AgentName.NUTRITION: (
        "eat",
        "food",
        "meal",
        "calorie",
        "kcal",
        "protein",
        "carb",
        "fat",
        "diet",
        "hungry",
        "snack",
        "breakfast",
        "lunch",
        "dinner",
        "fuel",
        "gel",
        "macro",
        "essen",
        "mahlzeit",
        "kalorien",
        "ernährung",
        "hunger",
        "frühstück",
    ),
    AgentName.TRAINING: (
        "run",
        "ride",
        "bike",
        "swim",
        "workout",
        "session",
        "interval",
        "pace",
        "race",
        "marathon",
        "ironman",
        "triathlon",
        "hike",
        "ski",
        "strength",
        "gym",
        "load",
        "plan",
        "lauf",
        "rennen",
        "rad",
        "schwimm",
        "wander",
        "krafttraining",
        "training",
    ),
    AgentName.RECOVERY: (
        "sleep",
        "tired",
        "sore",
        "rest",
        "recover",
        "hrv",
        "fatigue",
        "exhausted",
        "ready",
        "müde",
        "schlaf",
        "muskelkater",
        "erholung",
        "pause",
    ),
    AgentName.PROGRESS: (
        "progress",
        "trend",
        "review",
        "results",
        "improve",
        "how am i doing",
        "this week",
        "this month",
        "fortschritt",
        "entwicklung",
        "verbessert",
    ),
    AgentName.MOTIVATION: (
        "motivat",
        "lazy",
        "give up",
        "can't be bothered",
        "no energy to",
        "bored",
        "quit",
        "keine lust",
        "aufgeben",
        "motivation",
    ),
}

_PATTERNS = {
    agent: re.compile(r"\b(" + "|".join(re.escape(k) for k in keywords) + r")", re.IGNORECASE)
    for agent, keywords in _KEYWORDS.items()
}


class IntentRouter:
    """Picks the specialist with the most keyword hits; ties and no hits go to the Head Coach."""

    def route(self, message: str) -> AgentName:
        """Return the agent that should handle the message."""
        scores = {agent: len(pattern.findall(message)) for agent, pattern in _PATTERNS.items()}
        best = max(scores.values())
        if best == 0:
            return AgentName.HEAD_COACH
        winners = [agent for agent, score in scores.items() if score == best]
        return winners[0] if len(winners) == 1 else AgentName.HEAD_COACH
