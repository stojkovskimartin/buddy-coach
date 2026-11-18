# ADR-0005: Recovery nutrition – micronutrients, protein timing and supplements

- Status: accepted
- Date: 2026-11-18

## Context

Users want to recover better and feel ready for the next day. Beyond calories and macros this
means vitamins and minerals, protein spread over the day, refuelling after training, and
questions about supplements such as creatine, vitamin D, iron or caffeine.
Supplement advice is where wellness apps most often cause harm: megadoses, interactions,
masking a medical problem, or contaminated products for tested athletes.

## Decision

1. **Food first.** The coach always starts with food sources; supplements are a second step.
2. **Deterministic engines, not the LLM**, own every number (ADR-0003):
   - `science/micronutrients.py` – reference intakes (D-A-CH) and upper limits (EFSA) per
     nutrient and sex; compares logged intake with them and names food sources for gaps.
   - `science/recovery.py` – protein per meal (about 0.3 g/kg reference weight, 3–5 meals),
     post-session carbohydrate and protein, fluid replacement from sweat loss.
   - `science/supplements.py` – a curated catalogue: each entry has an evidence grade
     (A strong, B moderate, C weak), typical use, a daily maximum, cautions and
     contraindications.
3. **Hard rules in the catalogue**
   - Supplements that only make sense with a diagnosed deficiency (iron, vitamin D in high
     doses) are marked `requires_professional`: the coach suggests a blood test with a doctor,
     never a dose.
   - Contraindications (kidney disease, pregnancy, heart conditions, medication) remove an
     entry from suggestions and point to a professional.
   - Melatonin and other medicines are out of scope.
   - Tested athletes are told to use batch-tested products (e.g. Kölner Liste, Informed Sport).
4. **Micronutrient intake** is only judged from logged food (food module, later). Until then
   the tools return reference values and food sources, never a "you are deficient" statement.
5. **Safety Guard** blocks supplement doses above the catalogue maxima in agent output.

## Consequences

- All values are common guidance and must be reviewed by a qualified sports nutritionist before
  launch; each constant names its source family so the review is mechanical.
- New supplements are added by extending the catalogue and its tests, not by prompting.
