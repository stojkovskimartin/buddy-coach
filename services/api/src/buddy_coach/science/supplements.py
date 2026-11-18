"""Curated, evidence-graded supplement catalogue (ADR-0005).

The coach may only talk about supplements in this catalogue, with these doses and cautions.
Sources: ISSN and IOC consensus statements, EFSA opinions. Values are common guidance and
must be reviewed by a qualified sports nutritionist before launch.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Evidence(StrEnum):
    """Strength of evidence for a performance or recovery benefit."""

    A = "strong"
    B = "moderate"
    C = "weak"


class HealthFlag(StrEnum):
    """Conditions that rule a supplement out without professional advice."""

    KIDNEY_DISEASE = "kidney_disease"
    PREGNANT_OR_BREASTFEEDING = "pregnant_or_breastfeeding"
    HEART_CONDITION = "heart_condition"
    TAKES_MEDICATION = "takes_medication"
    HIGH_BLOOD_PRESSURE = "high_blood_pressure"


class Purpose(StrEnum):
    """What a user wants a supplement for."""

    STRENGTH_POWER = "strength_power"
    ENDURANCE = "endurance"
    RECOVERY = "recovery"
    HYDRATION = "hydration"
    GENERAL_HEALTH = "general_health"


@dataclass(frozen=True, slots=True)
class Supplement:
    """One catalogue entry."""

    key: str
    name: str
    evidence: Evidence
    purposes: frozenset[Purpose]
    what_it_does: str
    typical_use: str
    max_daily: str
    cautions: tuple[str, ...]
    contraindications: frozenset[HealthFlag] = frozenset()
    requires_professional: bool = False
    food_first: str | None = None


DOPING_NOTE = (
    "If you compete in tested sport, only use batch-tested products (e.g. Kölner Liste, "
    "Informed Sport): supplements can be contaminated with banned substances."
)

CATALOGUE: tuple[Supplement, ...] = (
    Supplement(
        key="creatine",
        name="Creatine monohydrate",
        evidence=Evidence.A,
        purposes=frozenset({Purpose.STRENGTH_POWER, Purpose.RECOVERY}),
        what_it_does="Supports repeated short, hard efforts, strength gains and recovery "
        "between sessions.",
        typical_use="3-5 g per day, every day, at any time; no loading phase needed.",
        max_daily="5 g",
        cautions=(
            "Body weight often rises 1-2 kg from water stored in muscle.",
            "Drink normally; take with a meal if your stomach is sensitive.",
        ),
        contraindications=frozenset(
            {HealthFlag.KIDNEY_DISEASE, HealthFlag.PREGNANT_OR_BREASTFEEDING}
        ),
    ),
    Supplement(
        key="protein_powder",
        name="Protein powder (whey or plant)",
        evidence=Evidence.A,
        purposes=frozenset({Purpose.RECOVERY, Purpose.STRENGTH_POWER}),
        what_it_does="A convenient way to reach your protein per meal; no advantage over food.",
        typical_use="One serving (20-40 g protein) when a meal would otherwise be low in protein.",
        max_daily="Counts towards your daily protein target",
        cautions=("Choose products with a short ingredient list.",),
        contraindications=frozenset({HealthFlag.KIDNEY_DISEASE}),
        food_first="Dairy, eggs, meat, fish, legumes and tofu do the same job.",
    ),
    Supplement(
        key="caffeine",
        name="Caffeine",
        evidence=Evidence.A,
        purposes=frozenset({Purpose.ENDURANCE, Purpose.STRENGTH_POWER}),
        what_it_does="Lowers perceived effort and improves endurance and power.",
        typical_use="About 3 mg per kg body weight, 30-60 minutes before a key session or race; "
        "not more than 200 mg in one dose.",
        max_daily="400 mg from all sources (about 5 espressos)",
        cautions=(
            "Avoid within about 6 hours of bedtime: poor sleep costs more than caffeine gives.",
            "Try it in training first, never new on race day.",
        ),
        contraindications=frozenset(
            {
                HealthFlag.HEART_CONDITION,
                HealthFlag.HIGH_BLOOD_PRESSURE,
                HealthFlag.PREGNANT_OR_BREASTFEEDING,
                HealthFlag.TAKES_MEDICATION,
            }
        ),
    ),
    Supplement(
        key="electrolytes",
        name="Electrolytes (sodium)",
        evidence=Evidence.A,
        purposes=frozenset({Purpose.HYDRATION, Purpose.ENDURANCE}),
        what_it_does="Replaces sodium lost in sweat during long or hot sessions.",
        typical_use="In sessions over about 2 hours or in heat: a sports drink or electrolyte "
        "tablet with your fluids; amounts depend on your sweat rate.",
        max_daily="Follow the product label",
        cautions=("Not needed for short sessions; normal meals cover it.",),
        contraindications=frozenset({HealthFlag.HIGH_BLOOD_PRESSURE, HealthFlag.KIDNEY_DISEASE}),
    ),
    Supplement(
        key="nitrate",
        name="Dietary nitrate (beetroot juice)",
        evidence=Evidence.B,
        purposes=frozenset({Purpose.ENDURANCE}),
        what_it_does="May improve efficiency in endurance efforts, mostly in non-elite athletes.",
        typical_use="One concentrated beetroot shot 2-3 hours before a key session.",
        max_daily="Follow the product label",
        cautions=("Can turn urine red; harmless.", "Avoid antibacterial mouthwash around it."),
        contraindications=frozenset({HealthFlag.TAKES_MEDICATION}),
        food_first="Beetroot, rocket, spinach and celery are rich in nitrate.",
    ),
    Supplement(
        key="beta_alanine",
        name="Beta-alanine",
        evidence=Evidence.B,
        purposes=frozenset({Purpose.STRENGTH_POWER, Purpose.ENDURANCE}),
        what_it_does="May help hard efforts lasting about 1-4 minutes.",
        typical_use="Split doses with meals over several weeks; follow the product label.",
        max_daily="6.4 g",
        cautions=("Harmless tingling of the skin is common; split doses reduce it.",),
        contraindications=frozenset({HealthFlag.PREGNANT_OR_BREASTFEEDING}),
    ),
    Supplement(
        key="omega_3",
        name="Omega-3 fatty acids",
        evidence=Evidence.C,
        purposes=frozenset({Purpose.GENERAL_HEALTH, Purpose.RECOVERY}),
        what_it_does="Important for general health; effects on sports recovery are uncertain.",
        typical_use="Food first; a supplement mainly if you eat no fish.",
        max_daily="Follow the product label",
        cautions=("Can thin the blood: check with a doctor if you take blood thinners.",),
        contraindications=frozenset({HealthFlag.TAKES_MEDICATION}),
        food_first="Fatty fish (salmon, herring, mackerel) twice a week; walnuts, linseed.",
    ),
    Supplement(
        key="vitamin_d",
        name="Vitamin D",
        evidence=Evidence.B,
        purposes=frozenset({Purpose.GENERAL_HEALTH}),
        what_it_does="Supports bones, muscles and immunity; many people in Switzerland are low "
        "in winter.",
        typical_use="Ask your doctor for a blood test; the dose depends on the result.",
        max_daily="100 µg (4000 IU) from all sources",
        cautions=("Do not take high doses without a test: too much is harmful.",),
        requires_professional=True,
        food_first="Fatty fish and eggs; sunlight on the skin in summer.",
    ),
    Supplement(
        key="iron",
        name="Iron",
        evidence=Evidence.B,
        purposes=frozenset({Purpose.ENDURANCE, Purpose.GENERAL_HEALTH}),
        what_it_does="Only helps when iron stores are low, which is common in endurance athletes "
        "and women.",
        typical_use="Only after a blood test (ferritin) and on your doctor's advice.",
        max_daily="As prescribed",
        cautions=("Iron without a deficiency can harm; never self-prescribe it.",),
        requires_professional=True,
        food_first="Red meat, legumes, whole grains and seeds, eaten with vitamin C.",
    ),
    Supplement(
        key="magnesium",
        name="Magnesium",
        evidence=Evidence.C,
        purposes=frozenset({Purpose.RECOVERY, Purpose.GENERAL_HEALTH}),
        what_it_does="Only helpful if your intake from food is low; no proven effect on cramps.",
        typical_use="Food first; a supplement only if food intake stays low.",
        max_daily="250 mg from supplements",
        cautions=("Higher doses often cause diarrhoea.",),
        contraindications=frozenset({HealthFlag.KIDNEY_DISEASE}),
        food_first="Nuts, seeds, whole grains, legumes, dark chocolate.",
    ),
)

_BY_KEY = {s.key: s for s in CATALOGUE}
# Medicines and banned or dangerous substances: the coach never recommends them (the Safety Guard
# blocks answers that mention them).
OUT_OF_SCOPE = frozenset(
    {"melatonin", "sarms", "testosterone", "ephedrine", "dnp", "clenbuterol", "anabolic steroids"}
)


@dataclass(frozen=True, slots=True)
class SupplementAdvice:
    """Catalogue entries split into suggested, see-a-professional and excluded."""

    suggested: tuple[Supplement, ...]
    ask_a_professional: tuple[Supplement, ...]
    notes: tuple[str, ...]


def get_supplement(key: str) -> Supplement | None:
    """A catalogue entry by key, or None if the coach must not discuss it."""
    return _BY_KEY.get(key.strip().lower())


def supplement_advice(
    purposes: frozenset[Purpose],
    flags: frozenset[HealthFlag] = frozenset(),
    *,
    min_evidence: Evidence = Evidence.B,
) -> SupplementAdvice:
    """Supplements for the given purposes, filtered by evidence and health flags.

    Entries that need a test or clash with a health flag go to ``ask_a_professional``.
    """
    order = {Evidence.A: 0, Evidence.B: 1, Evidence.C: 2}
    suggested: list[Supplement] = []
    professional: list[Supplement] = []
    for item in CATALOGUE:
        if not item.purposes & purposes:
            continue
        if item.requires_professional or item.contraindications & flags:
            professional.append(item)
        elif order[item.evidence] <= order[min_evidence]:
            suggested.append(item)
    notes = [DOPING_NOTE]
    if flags:
        notes.append(
            "Because of the health information you shared, check any supplement with your "
            "doctor or pharmacist first."
        )
    suggested.sort(key=lambda s: order[s.evidence])
    return SupplementAdvice(
        suggested=tuple(suggested), ask_a_professional=tuple(professional), notes=tuple(notes)
    )
