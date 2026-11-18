"""Safety Guard: checks every user message before and every answer after the agents.

This is a deterministic first line (patterns in English and German). A classifier model can be
added behind the same interface; the patterns stay as a floor that never depends on an LLM.
Patterns are kept specific to avoid false alarms ("stop eating junk food" is fine) and every
change must come with tests for both sides.
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
            r"suizid",
            r"mich umbringen",
            r"nicht mehr leben",
            r"mir etwas antun",
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
            r"\bpurg(e|ed|ing)\b",
            r"throw(ing)? up after",
            r"make myself (sick|vomit|throw up)",
            r"laxative",
            r"stop eating (completely|entirely|altogether|at all|for \d+ days)",
            r"stop eating to (make weight|lose)",
            r"not eat(ing)? (at all|for \d+ days)",
            r"starv(e|ing) myself",
            r"gar nichts (mehr )?essen",
            r"nichts mehr essen",
            r"erbrechen nach",
            r"abführmittel",
            r"mich hungern",
        ),
    ),
    (
        SafetyCategory.INJURY,
        _rx(
            r"sharp pain",
            r"stabbing pain",
            r"\bswollen\b",
            r"\bswelling\b",
            r"can'?t put weight on",
            r"stechende[rn]? schmerz",
            r"geschwollen",
        ),
    ),
)

_MESSAGES: dict[str, dict[SafetyCategory, str]] = {
    "en": {
        SafetyCategory.EMERGENCY: (
            "This could be serious. Please stop exercising now. If the symptoms are strong or do "
            "not go away, call emergency services (144 in Switzerland, 112 in Europe) or see a "
            "doctor today. Once you have been checked, I will plan your training around it."
        ),
        SafetyCategory.MENTAL_HEALTH: (
            "I am really sorry you are going through this, and you do not have to face it alone. "
            "In Switzerland you can call Die Dargebotene Hand on 143 at any time, or 144 in an "
            "emergency. Talking to someone you trust or to your doctor can help too."
        ),
        SafetyCategory.EATING_DISORDER: (
            "Thank you for telling me. What you describe can harm your health, so I am pausing "
            "calorie targets and will not give diet numbers for now. Please talk to your doctor "
            "or an eating-disorder specialist. Die Dargebotene Hand (143) also listens at any time."
        ),
        SafetyCategory.INJURY: (
            "Sharp pain or swelling is a signal to stop that activity. Rest it, and see a doctor "
            "or physiotherapist if it does not improve within a few days. Tell me once it has "
            "been checked and I will adjust your plan around it."
        ),
        SafetyCategory.UNSAFE_OUTPUT: (
            "I cannot give that advice safely. For anything medical, please check with a doctor "
            "or a registered dietitian."
        ),
    },
    "de": {
        SafetyCategory.EMERGENCY: (
            "Das könnte ernst sein. Bitte hör sofort mit dem Training auf. Wenn die Beschwerden "
            "stark sind oder nicht weggehen, ruf den Notruf (144 in der Schweiz, 112 in Europa) "
            "oder geh heute noch zum Arzt. Danach plane ich dein Training entsprechend."
        ),
        SafetyCategory.MENTAL_HEALTH: (
            "Es tut mir sehr leid, dass es dir so geht, und du musst da nicht allein durch. "
            "In der Schweiz erreichst du Die Dargebotene Hand jederzeit unter 143, im Notfall "
            "die 144. Auch ein Gespräch mit einer Vertrauensperson oder deinem Arzt kann helfen."
        ),
        SafetyCategory.EATING_DISORDER: (
            "Danke, dass du mir das sagst. Was du beschreibst, kann deiner Gesundheit schaden. "
            "Ich setze die Kalorienziele deshalb aus und gebe vorerst keine Diätzahlen. Bitte "
            "sprich mit deinem Arzt oder einer Fachstelle für Essstörungen. Die Dargebotene Hand "
            "(143) hört dir ebenfalls jederzeit zu."
        ),
        SafetyCategory.INJURY: (
            "Stechende Schmerzen oder eine Schwellung sind ein Zeichen, diese Belastung zu "
            "stoppen. Schone die Stelle und geh zum Arzt oder in die Physiotherapie, wenn es "
            "nach ein paar Tagen nicht besser ist. Danach passe ich deinen Plan an."
        ),
        SafetyCategory.UNSAFE_OUTPUT: (
            "Diesen Rat kann ich nicht sicher geben. Für medizinische Fragen wende dich bitte "
            "an einen Arzt oder eine Ernährungsberatung."
        ),
    },
}

_DIAGNOSIS = _rx(
    r"\byou (probably |might |may |likely )?(have|are suffering from) (a |an )?"
    r"(diabetes|cancer|asthma|an?a?emia|\w+ disorder|\w*disease|\w* ?syndrome|infection|"
    r"fracture|tear)",
    r"\b(du hast|sie haben|du leidest an) (wahrscheinlich |vermutlich |wohl )?(eine? |einen )?"
    r"(diabetes|krebs|asthma|anämie|\w*störung|\w*krankheit|\w*syndrom|\w*entzündung|"
    r"\w*fraktur|\w*riss|bruch)",
)
_KCAL_NUMBER = re.compile(r"(\d{3,4})\s*(?:kcal|cal\b|calories|kalorien)", re.IGNORECASE)
# Low numbers are only unsafe when they describe a whole day, not a snack or a session.
_DAILY_CONTEXT = re.compile(
    r"per day|a day|daily|/\s*day|pro tag|am tag|täglich|each day|total|only eat|eat only|"
    r"\beat \d|iss \d|nur \d|limit (yourself|your intake) to|insgesamt",
    re.IGNORECASE,
)
_SNACK_CONTEXT = re.compile(
    r"snack|\bbar\b|\bgel\b|drink|shake|before|after|during|vor dem|nach dem|während",
    re.IGNORECASE,
)
_DANGEROUS_ADVICE = _rx(
    r"train(ing)? through (the )?pain",
    r"ignore the pain",
    r"push through the pain",
    r"fast(ing)? for \d+ (days|hours)",
    r"skip (all |your )?meals",
    r"trotz (der )?schmerzen (weiter)?trainier",
    r"\d+ tage fasten",
)
MIN_SAFE_DAILY_KCAL = 1200


def safety_language(locale: str | None) -> str:
    """Language for safety messages: German for ``de`` locales, otherwise English."""
    return "de" if locale and locale.lower().startswith("de") else "en"


class SafetyGuard:
    """Checks user input and agent output."""

    def check_input(self, message: str, language: str = "en") -> SafetyVerdict:
        """Escalate red-flag messages instead of coaching on them."""
        for category, pattern in _INPUT_RULES:
            if pattern.search(message):
                return self._escalate(category, language)
        return SafetyVerdict(SafetyCategory.NONE)

    def check_output(self, text: str, language: str = "en") -> SafetyVerdict:
        """Block diagnoses, dangerously low daily calories and harmful training advice."""
        if _DIAGNOSIS.search(text) or _DANGEROUS_ADVICE.search(text):
            return self._escalate(SafetyCategory.UNSAFE_OUTPUT, language)
        for match in _KCAL_NUMBER.finditer(text):
            if int(match.group(1)) >= MIN_SAFE_DAILY_KCAL:
                continue
            window = text[max(0, match.start() - 40) : match.end() + 25]
            if _DAILY_CONTEXT.search(window) and not _SNACK_CONTEXT.search(window):
                return self._escalate(SafetyCategory.UNSAFE_OUTPUT, language)
        return SafetyVerdict(SafetyCategory.NONE)

    @staticmethod
    def _escalate(category: SafetyCategory, language: str) -> SafetyVerdict:
        messages = _MESSAGES.get(language, _MESSAGES["en"])
        return SafetyVerdict(category, messages[category])
