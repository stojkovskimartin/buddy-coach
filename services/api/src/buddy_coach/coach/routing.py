"""Intent routing: which specialist handles a message.

Deterministic keyword scoring (English and German) keeps routing cheap, fast and testable.
Keywords match whole words with common endings ("run", "runs", "running"); a trailing ``*``
marks a stem that may continue ("motivat*" -> "motivation"). An LLM classifier can replace
this behind ``route`` when needed.
"""

from __future__ import annotations

import re

from buddy_coach.coach.contracts import AgentName

_KEYWORDS: dict[AgentName, tuple[str, ...]] = {
    AgentName.NUTRITION: (
        "eat",
        "ate",
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
        "kalorie*",
        "ernährung",
        "hunger",
        "frühstück",
        "eiweiss",
    ),
    AgentName.TRAINING: (
        "run",
        "ran",
        "ride",
        "rode",
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
        "plan",
        "lauf*",
        "laufe",
        "jogg*",
        "rennen",
        "velo",
        "schwimm*",
        "wander*",
        "krafttraining",
        "training",
        "intervall*",
    ),
    AgentName.RECOVERY: (
        "sleep",
        "slept",
        "tired",
        "sore",
        "rest",
        "recover*",
        "hrv",
        "fatigue",
        "exhausted",
        "müde",
        "schlaf*",
        "muskelkater",
        "erholung",
        "pause",
    ),
    AgentName.PROGRESS: (
        "progress",
        "trend",
        "review",
        "result",
        "improve*",
        "how am i doing",
        "this week",
        "this month",
        "fortschritt*",
        "entwicklung",
        "verbesser*",
    ),
    AgentName.MOTIVATION: (
        "motivat*",
        "lazy",
        "give up",
        "can't be bothered",
        "bored",
        "quit",
        "keine lust",
        "aufgeben",
    ),
}

_SUFFIXES = r"(?:s|es|ed|ing|ning|ming|er|en|e|n)?"


def _pattern(keyword: str) -> str:
    if keyword.endswith("*"):
        return r"\b" + re.escape(keyword[:-1]) + r"\w*"
    return r"\b" + re.escape(keyword) + _SUFFIXES + r"\b"


_PATTERNS = {
    agent: re.compile("|".join(_pattern(k) for k in keywords), re.IGNORECASE)
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
