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
    r"\s*(?:-\s*)?(snack|bar|gel|drink|shake|smoothie|riegel|before|after|during|vor dem|"
    r"nach dem|während)\b",
    re.IGNORECASE,
)
_SNACK_BEFORE = re.compile(r"\b(snack|gel|bar|shake|drink|riegel) of\s*$", re.IGNORECASE)
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

# Supplement doses above the catalogue maxima (ADR-0005), self-prescribed iron, and substances
# that are out of scope. Numbers are normalised first ("5,000", "5'000", "5 000" -> "5000"), and
# every number is tied to the nutrient right next to it, so one sentence can name several.
_THOUSANDS = re.compile(r"(?<=\d)[,'\u2019 \u00a0\u202f](?=\d{3}\b)")
_DECIMAL_COMMA = re.compile(r"(?<=\d),(?=\d{1,2}\b)")
_AMOUNT = r"(\d+(?:\.\d+)?)\s*(iu|ie|µg|mcg|ug|mg|g)\b"
_VITAMIN_D = r"\bvitamin[\s-]*d(?:\s*3)?\b|\bd3\b|cholecalciferol"
# Other nutrients end the link between a nutrient and a number, so "vitamin D and magnesium
# 400 mg" is not a vitamin D dose. Food amounts need no stop words: grams never count as a
# vitamin D dose ("Vitamin D: eat 150 g salmon").
_STOP_WORDS = (
    r"magnesium|calcium|kalzium|zinc|zink|iron|eisen|caffeine|koffein"
    r"|creatine|kreatin|omega|vitamin|folate|folsäure|b12|protein|selenium|selen|iodine|jod|biotin"
)


def _gap(max_chars: int, also_stop_at: str = "") -> str:
    """Up to `max_chars` characters that cross no sentence end, number or stop word."""
    return rf"(?:(?!\b(?:{_STOP_WORDS})\b)[^.;\d{also_stop_at}]){{0,{max_chars}}}?"


_COUNTS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "zwei": 2, "drei": 3, "vier": 4}
_COUNT = rf"(\d+|{'|'.join(_COUNTS)})"
_TIMES = r"\s*[x\u00d7]\s*"
_PILLS = r"pills?|tablets?|capsules?|tabletten|kapseln"
# "2 x 5000 IU", "1 capsule (5000 IU)", "2 capsules of 1000 IU"
_PER_PILL = rf"(?:{_TIMES}|\s+(?:{_PILLS})\s*(?:\(\s*|of\s+|à\s+|zu\s+)?)"
# Groups: (count, amount, unit) for "vitamin D ... [2 x] 5000 IU", then (amount, unit) for
# "5000 IU [daily] of vitamin D". A number before a comma belongs to what came before it
# ("Folate 300 µg, vitamin D 20 µg").
_VITAMIN_D_DOSE = re.compile(
    rf"(?:{_VITAMIN_D}){_gap(25)}(?:{_COUNT}{_PER_PILL})?{_AMOUNT}"
    rf"|{_AMOUNT}{_gap(12, also_stop_at=',')}(?:of\s+)?(?:{_VITAMIN_D})",
    re.IGNORECASE,
)
_CAFFEINE = r"caffeine|koffein"
_CAFFEINE_DOSE = re.compile(
    rf"(?:{_CAFFEINE})\s*[:(]?\s*(?:of\s+|about\s+|~\s*)?{_AMOUNT}"
    rf"|{_AMOUNT}\s*(?:of\s+)?(?:{_CAFFEINE})",
    re.IGNORECASE,
)
# Groups: (count, amount, unit) for "two 300 mg caffeine pills" and for
# "2 caffeine tablets of 300 mg"; the per-dose amount is multiplied by the count.
_CAFFEINE_COUNT = re.compile(
    rf"\b{_COUNT}(?:{_TIMES}|\s*){_AMOUNT}\s*(?:of\s+)?(?:{_CAFFEINE})"
    rf"|\b{_COUNT}\s+(?:{_CAFFEINE})\s+(?:{_PILLS})\s+(?:of|à|a|zu)\s+{_AMOUNT}"
    rf"|(?:{_CAFFEINE})[:\s]+{_COUNT}{_PER_PILL}{_AMOUNT}",
    re.IGNORECASE,
)
# "Caffeine: 6 mg per kg, so 540 mg" - the total after "so" is checked on its own.
_CAFFEINE_TOTAL = re.compile(rf"(?:{_CAFFEINE})[^.]{{0,40}}?\bso\s+{_AMOUNT}", re.IGNORECASE)
_CAFFEINE_PER_KG = re.compile(
    rf"(\d+(?:\.\d+)?)\s*mg\s*(?:per|/)\s*kg[^.]{{0,25}}(?:{_CAFFEINE})"
    rf"|(?:{_CAFFEINE})[^.]{{0,25}}?(\d+(?:\.\d+)?)\s*mg\s*(?:per|/)\s*kg",
    re.IGNORECASE,
)
# Iron is only flagged as a supplement instruction, never as a food fact ("lentils give 3 mg iron").
_IRON_DOSE = re.compile(
    r"\b(take|taking|supplement\w*|tablet|pill|capsule|nimm|einnehmen|tablette)\b[^.]{0,30}"
    r"\d+\s*mg\s*(of\s+)?(elemental\s+)?(iron|eisen)\b"
    r"|\b(take|taking|nimm)\b[^.]{0,15}\b(iron|eisen)\b[^.]{0,15}\d+\s*mg"
    r"|ferrous\s+(sulfate|sulphate|gluconate|fumarate)|eisen(ii)?[- ]?(sulfat|gluconat)",
    re.IGNORECASE,
)
# Out-of-scope substances are blocked when recommended or dosed, not when merely mentioned
# ("Avoid SARMs: they are banned", "Squats raise testosterone a little").
_OUT_OF_SCOPE_SUBSTANCE = (
    r"\b(?:melatonin|sarms?|testosterone|ephedrine|dnp|clenbuterol|anabolic steroids?)\b"
)
# The substance must be the object of the verb: "try squats to boost testosterone" is not advice
# to take it, so the link stops at "to".
_OUT_OF_SCOPE_ADVICE = re.compile(
    r"\b(?:take|taking|try|use|using|start|dose|dosing|recommend\w*|suggest\w*|consider"
    r"|stack|cycle|nimm|nehmen|einnehmen|empfehle\w*|probier\w*)\b"
    rf"(?:(?!\b(?:to|zu|um)\b)(?:[^.;]|(?<=\d)\.(?=\d))){{0,30}}?{_OUT_OF_SCOPE_SUBSTANCE}",
    re.IGNORECASE,
)
# Grams are food ("a 200 g yoghurt"), never a dose of these substances.
_ANY_DOSE = re.compile(r"\d+(?:\.\d+)?\s*(?:mg|µg|mcg|ug|iu|ie)\b", re.IGNORECASE)
# A negation directly before the verb ("never take", "I can't recommend", "avoid taking") makes
# it a warning; "if sleep is not great, take melatonin" is still advice.
_NEGATION = re.compile(
    r"\b(?:don['\u2019]?t|do not|never|avoid|can['\u2019]?t|cannot|can not|won['\u2019]?t|will not"
    r"|shouldn['\u2019]?t|should not|wouldn['\u2019]?t|would not|not|no need to|nie|nicht|keine?)"
    r"\s+$",
    re.IGNORECASE,
)
# Sentences, without splitting decimals ("0.5 mg").
_SENTENCE = re.compile(r"(?:[^.;!?]|(?<=\d)\.(?=\d))+")
MAX_VITAMIN_D_UG = 100.0  # = 4000 IU
IU_PER_UG_VITAMIN_D = 40.0
MAX_CAFFEINE_MG = 400.0
MAX_CAFFEINE_MG_PER_KG = 6.0


def _normalise_numbers(text: str) -> str:
    return _DECIMAL_COMMA.sub(".", _THOUSANDS.sub("", text))


def _amounts(match: re.Match[str]) -> tuple[float, float, str]:
    """(count, amount, unit) from a match whose groups are [count,] amount, unit."""
    groups = [g for g in match.groups() if g is not None]
    count = 1.0
    if len(groups) == 3:
        word = groups.pop(0).lower()
        count = float(_COUNTS.get(word) or word)
    return count, float(groups[0]), groups[1].lower()


def _vitamin_d_ug(amount: float, unit: str) -> float | None:
    """Micrograms, or None when the unit cannot be a vitamin D dose (grams of food, whole mg)."""
    if unit in {"iu", "ie"}:
        return amount / IU_PER_UG_VITAMIN_D
    if unit == "mg":
        return amount * 1000 if amount < 1 else None
    if unit == "g":
        return None
    return amount  # µg, mcg, ug


def _caffeine_mg(amount: float, unit: str) -> float:
    return amount * 1000 if unit == "g" else amount


def _recommends_out_of_scope(text: str) -> bool:
    for sentence in _SENTENCE.finditer(text):
        part = sentence.group()
        for m in _OUT_OF_SCOPE_ADVICE.finditer(part):
            # A warning is fine, but never one that also names a dose ("never more than 5 mg").
            if not _NEGATION.search(part[: m.start()]) or _ANY_DOSE.search(part):
                return True
        # A dose right after the substance is never fine ("Melatonin 3 mg helps").
        if re.search(rf"{_OUT_OF_SCOPE_SUBSTANCE}[^\d]{{0,20}}{_ANY_DOSE.pattern}", part, re.I):
            return True
    return False


def _unsafe_supplement_dose(text: str) -> bool:
    text = _normalise_numbers(text)
    if _recommends_out_of_scope(text) or _IRON_DOSE.search(text):
        return True
    for m in _CAFFEINE_COUNT.finditer(text):
        count, amount, unit = _amounts(m)
        if unit in {"mg", "g"} and count * _caffeine_mg(amount, unit) > MAX_CAFFEINE_MG:
            return True
    for m in _VITAMIN_D_DOSE.finditer(text):
        count, amount, unit = _amounts(m)
        micrograms = _vitamin_d_ug(amount, unit)
        if micrograms is not None and count * micrograms > MAX_VITAMIN_D_UG:
            return True
    for m in [*_CAFFEINE_DOSE.finditer(text), *_CAFFEINE_TOTAL.finditer(text)]:
        _, amount, unit = _amounts(m)
        if unit in {"mg", "g"} and _caffeine_mg(amount, unit) > MAX_CAFFEINE_MG:
            return True
    for m in _CAFFEINE_PER_KG.finditer(text):
        if float(m.group(1) or m.group(2)) > MAX_CAFFEINE_MG_PER_KG:
            return True
    return False


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
        """Block diagnoses, very low daily calories, harmful advice and unsafe supplement doses."""
        text = _normalise_numbers(text)
        if _DIAGNOSIS.search(text) or _DANGEROUS_ADVICE.search(text):
            return self._escalate(SafetyCategory.UNSAFE_OUTPUT, language)
        if _unsafe_supplement_dose(text):
            return self._escalate(SafetyCategory.UNSAFE_OUTPUT, language)
        for match in _KCAL_NUMBER.finditer(text):
            if int(match.group(1)) >= MIN_SAFE_DAILY_KCAL:
                continue
            window = text[max(0, match.start() - 40) : match.end() + 25]
            # "a 200 kcal gel" is a snack; "800 kcal per day and drink water" is not.
            snack = _SNACK_CONTEXT.match(text, match.end()) or _SNACK_BEFORE.search(
                text[max(0, match.start() - 12) : match.start()]
            )
            if _DAILY_CONTEXT.search(window) and not snack:
                return self._escalate(SafetyCategory.UNSAFE_OUTPUT, language)
        return SafetyVerdict(SafetyCategory.NONE)

    @staticmethod
    def _escalate(category: SafetyCategory, language: str) -> SafetyVerdict:
        messages = _MESSAGES.get(language, _MESSAGES["en"])
        return SafetyVerdict(category, messages[category])
