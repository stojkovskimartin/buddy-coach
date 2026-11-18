# The coach agent network

Decision record: [ADR-0003](adr/0003-coach-agent-network.md), supplements: [ADR-0005](adr/0005-recovery-nutrition-and-supplements.md).
Code: `services/api/src/buddy_coach/coach/`.

## How one message is answered

1. **Safety Guard (input)** – red flags (emergency, mental health, eating disorder, injury)
   return a fixed, reviewed message in the user's language. No LLM is called.
2. **Router** – keyword scoring (English and German) picks a specialist; ties go to the Head Coach.
3. **Specialist agent** – loops model → tools → model within its contract limits.
4. **Safety Guard (output)** – blocks diagnoses, dangerously low daily calories, harmful
   training advice and supplement overdoses.
5. **Audit log** – agent, tools used, limits hit and tokens (never message content).

## Agents and their tools

| Agent | Answers | Tools | Max tool calls |
| --- | --- | --- | --- |
| Head Coach | General questions, motivation, next steps | profile, goals | 2 |
| Nutrition | Calories, macros, meals, vitamins, recovery food, supplements, fuelling | profile, nutrition targets, session fuelling, recovery nutrition, supplement guidance, micronutrient reference | 4 |
| Training | Sessions, load, progression | profile, goals, session load, weekly ramp | 4 |
| Recovery | Readiness, rest days, refuelling | profile, readiness, recovery nutrition | 3 |
| Progress | Progress towards goals | profile, goals | 3 |
| Motivation | Encouragement | profile, goals | 2 |

Every agent also has a maximum of 6 steps, 800 output tokens per step and a 20,000-token budget.

## Rules every agent follows

- Every number comes from a tool (deterministic engine); the model never calculates.
- Not a doctor: no diagnoses or medication; medical topics go to a professional.
- Supplements only from `supplement_guidance`; iron and high-dose vitamin D need a blood test.
- Data sent to the model: age, sex, height, weight, experience, availability and structured goal
  fields. Never names, emails, ids or user-written free text.

## Tools

| Tool | Engine | Returns |
| --- | --- | --- |
| `get_profile_summary` | profile service | body data, experience, primary goal |
| `list_goals` | profile service | active goals with days to target |
| `calculate_nutrition_targets` | `science/nutrition.py` | kcal, protein, carbs, fat, reasons |
| `session_fuelling` | `science/nutrition.py` | carbs per hour during a session |
| `recovery_nutrition` | `science/recovery.py` | recovery meal, fluids, protein per meal |
| `supplement_guidance` | `science/supplements.py` | catalogue entries, professional referrals, doping note |
| `micronutrient_reference` | `science/micronutrients.py` | daily references, upper limits, food sources |
| `calculate_session_load` | `science/training.py` | session-RPE load |
| `check_weekly_ramp` | `science/training.py` | safe or too steep, max allowed load |
| `assess_readiness` | `science/training.py` | score 0–100, traffic light, limiting factors |

## LLM providers

| `BUDDY_LLM_PROVIDER` | Use |
| --- | --- |
| `dev` | Local development without a key; calls one tool and returns its raw result. Refused in production. |
| `anthropic` | Real answers via the Anthropic Messages API, with retries on overload and graceful degradation. |

## Adding an agent or tool

1. Implement the engine function (pure, tested) in `science/` if numbers are involved.
2. Add a tool in `coach/builtin_tools.py` with Pydantic input and output models (no ids, no free text).
3. Allow it in the right contract in `coach/contracts.py`.
4. Add keywords in `coach/routing.py` if it is a new topic.
5. Tests: engine unit tests, tool over HTTP in `tests/agents/`, routing and safety cases.
