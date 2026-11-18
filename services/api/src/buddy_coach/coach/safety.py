"""Safety Guard: checks every user message before and every answer after the agents.

This is a deterministic first line (patterns in English and German). A classifier model can be
added behind the same interface; the patterns stay as a floor that never depends on an LLM.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum


class SafetyCategory(StrEnum):
    """Why a message was escalated."""

    NONE = "none"
    EMERGENCY = "emergency"
    MENTAL_HEALTH = "mental_health"
    EATING_DISORDER = "eating_disorder"
    INJURY = "injury"
    UNSAFE_OUTPUT = "unsafe_output"


@dataclass(frozen=True, slots=True)
class SafetyVerdict:
    """Either allowed, or replaced by a fixed, reviewed message."""

    category: SafetyCategory
    message: str | None = None

    @property
    def allowed(self) -> bool:
        """True when coaching may continue normally."""
        return self.category is SafetyCategory.NONE


def _rx(*patterns: str) -> re.Pattern[str]:
    return re.compile("|".join(patterns), re.IGNORECASE)


# Order matters: the most serious category wins.
_INPUT_RULES: tuple[tuple[SafetyCategory, re.Pattern[str]], ...] = (
    (
        SafetyCategory.MENTAL_HEALTH,
        _rx(
            r"suicid",
            r"kill myself",
            r"end my life",
            r"self[- ]?harm",
            r"hurt myself",
            r"selbstmord",
            r"mich umbringen",
            r"nicht mehr leben",
        ),
    ),
    (
        SafetyCategory.EMERGENCY,
        _rx(
            r"chest pain",
            r"brustschmerz",
            r"\bfaint(ed|ing)?\b",
            r"passed out",
            r"ohnmacht",
            r"bewusstlos",
            r"can'?t breathe",
            r"cannot breathe",
            r"atemnot",
        ),
    ),
    (
        SafetyCategory.EATING_DISORDER,
        _rx(
            r"\bpurg(e|ing)\b",
            r"throw(ing)? up after",
            r"make myself (sick|vomit|throw up)",
            r"laxative",
            r"stop eating",
            r"\bstarv(e|ing)\b",
            r"nichts mehr essen",
            r"erbrechen nach",
            r"abführmittel",
        ),
    ),
    (
        SafetyCategory.INJURY,
        _rx(
            r"sharp pain",
            r"stabbing pain",
            r"\bswollen\b",
            r"swelling",
            r"can'?t put weight",
            r"stechende[rn]? schmerz",
            r"geschwollen",
        ),
    ),
)

ESCALATION_MESSAGES = {
    SafetyCategory.EMERGENCY: (
        "This could be serious. Please stop exercising now. If the symptoms are strong or do not "
        "go away, call emergency services (144 in Switzerland, 112 in Europe) or see a doctor "
        "today. Once you have been checked, I will plan your training around it."
    ),
    SafetyCategory.MENTAL_HEALTH: (
        "I am really sorry you are going through this, and you do not have to face it alone. "
        "In Switzerland you can call Die Dargebotene Hand on 143 at any time, or 144 in an "
        "emergency. Talking to someone you trust or to your doctor can help too."
    ),
    SafetyCategory.EATING_DISORDER: (
        "Thank you for telling me. What you describe can harm your health, so I am pausing "
        "calorie targets and will not give diet numbers for now. Please talk to your doctor or "
        "an eating-disorder specialist. Die Dargebotene Hand (143) also listens at any time."
    ),
    SafetyCategory.INJURY: (
        "Sharp pain or swelling is a signal to stop that activity. Rest it, and see a doctor or "
        "physiotherapist if it does not improve within a few days. Tell me once it has been "
        "checked and I will adjust your plan around it."
    ),
    SafetyCategory.UNSAFE_OUTPUT: (
        "I cannot give that advice safely. For anything medical, please check with a doctor or "
        "a registered dietitian."
    ),
}

_DIAGNOSIS = _rx(
    r"\byou (probably |might |may |likely )?(have|are suffering from) (a |an )?"
    r"(diabetes|cancer|asthma|an?a?emia|disorder|disease|syndrome|infection|fracture|tear)"
)
_DAILY_KCAL = re.compile(
    r"(\d{3,4})\s*(?:kcal|calories|kalorien)\s*(?:per day|a day|daily|/\s*day|pro tag|am tag)",
    re.IGNORECASE,
)
MIN_SAFE_DAILY_KCAL = 1200


class SafetyGuard:
    """Checks user input and agent output."""

    def check_input(self, message: str) -> SafetyVerdict:
        """Escalate red-flag messages instead of coaching on them."""
        for category, pattern in _INPUT_RULES:
            if pattern.search(message):
                return SafetyVerdict(category, ESCALATION_MESSAGES[category])
        return SafetyVerdict(SafetyCategory.NONE)

    def check_output(self, text: str) -> SafetyVerdict:
        """Block diagnoses and dangerously low daily calorie advice."""
        if _DIAGNOSIS.search(text):
            return SafetyVerdict(
                SafetyCategory.UNSAFE_OUTPUT, ESCALATION_MESSAGES[SafetyCategory.UNSAFE_OUTPUT]
            )
        for match in _DAILY_KCAL.finditer(text):
            if int(match.group(1)) < MIN_SAFE_DAILY_KCAL:
                return SafetyVerdict(
                    SafetyCategory.UNSAFE_OUTPUT, ESCALATION_MESSAGES[SafetyCategory.UNSAFE_OUTPUT]
                )
        return SafetyVerdict(SafetyCategory.NONE)
