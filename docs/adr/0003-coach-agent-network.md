# ADR-0003: Coach agent network with explicit limits

- Status: accepted
- Date: 2026-11-18

## Context

Users talk to one coach, but the work spans nutrition, training, recovery, progress and motivation.
LLMs are good at understanding, planning within constraints and explaining; they are unreliable at arithmetic and can produce unsafe advice.

## Decision

- A **Head Coach** agent receives every user message, classifies intent and delegates to specialist agents.
- Each agent is declared with a **contract**: role, allowed tools, maximum tool calls per run, maximum tokens, and the domains it may speak about.
- Agents act **only through tools**. Tools are typed (Pydantic input/output) and call domain services. All numbers (calories, macros, load, readiness) come from deterministic engines.
- A **Safety Guard** runs before and after every agent: it blocks red-flag topics, unsafe targets and medical claims, and can replace an answer with an escalation message.
- LLM access goes through a **provider interface**. Tests use a deterministic fake provider; production uses a real provider chosen by configuration.
- We start with a small in-house orchestrator (clear, testable, no hidden state). LangGraph or a similar framework can replace it behind the same interfaces if graphs get complex.

## Consequences

- Every agent run is reproducible in tests and auditable in logs (agent, tools called, limits hit).
- Adding a specialist means: declare its contract, register its tools, add tests.

## Data sent to the LLM provider

Agents receive only what tools return: age, sex, height, weight, experience, availability and
structured goal fields (type, sport, dates, targets). No names, emails, ids or user-written free
text (goal titles) are sent. Processing needs the user's AI consent (see docs/backlog.md).
