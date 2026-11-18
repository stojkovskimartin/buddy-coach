# Sports-science engines

Code: `services/api/src/buddy_coach/science/`. Pure functions, no I/O, fully unit-tested.
All constants are common guidance and **must be reviewed by a qualified sports nutritionist and
coach before launch**. Each module names the source family of its values.

## Nutrition (`nutrition.py`)

| Topic | Rule |
| --- | --- |
| Resting energy | Mifflin–St Jeor: 10 × kg + 6.25 × cm − 5 × age + 5 (men) / − 161 (women) |
| Maintenance | resting × lifestyle factor (1.2–1.55) + 75% of watch-measured training energy |
| Weight change | 7,700 kcal per kg; default −0.5% / +0.25% of body weight per week, capped at −1% / +0.5% |
| Floor | never below the larger of resting energy and 1,500 kcal (men) / 1,200 kcal (women) |
| Protein | 2.0 (lose) / 1.6 (maintain) / 1.8 (gain) g per kg reference weight, max 35% of energy |
| Fat | at least 25% of energy and 0.6 g per kg reference weight |
| Reference weight | actual weight, capped at the weight for BMI 25 |
| Adaptive maintenance | intake minus weight trend × 7,700; needs 14 days, 80% logged, within ±25% of the formula |
| In-session carbs | < 60 min: 0; 60–150 min: 45 g/h; longer: 75 g/h |

## Training (`training.py`)

| Topic | Rule |
| --- | --- |
| Session load | session-RPE (minutes × effort 1–10) or Banister TRIMP from heart rate |
| Fitness / fatigue / form | 42-day and 7-day exponentially weighted load; form = yesterday's fitness − fatigue |
| Acute:chronic ratio | fatigue ÷ fitness, only once fitness ≥ 10; a warning sign above ~1.5 |
| Weekly ramp | max +10% (beginner, intermediate) or +15% (advanced, elite); restart floor after breaks |
| Readiness | sleep, soreness, mood, HRV (ln rMSSD z-score), resting HR and form → 0–100; pain caps at red |

## Recovery nutrition (`recovery.py`, `micronutrients.py`, `supplements.py`)

| Topic | Rule |
| --- | --- |
| Protein per meal | 0.3 g per kg reference weight, 20–40 g, 3–6 meals |
| After training | next session < 8 h: 1.2 g carbs/kg quickly; hard or ≥ 90 min: 1.0 g/kg; moderate: 0.5 g/kg; easy: normal meals |
| Fluids | 1.5 L per kg body mass lost |
| Vitamins and minerals | D-A-CH adult reference intakes, EFSA upper limits; intake judged over ≥ 3 logged days |
| Supplements | curated catalogue with evidence grade, max daily amount, cautions, contraindications; iron and vitamin D only via a doctor |

See [ADR-0005](adr/0005-recovery-nutrition-and-supplements.md) for the reasoning.
