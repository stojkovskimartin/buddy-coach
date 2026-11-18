# Security and data protection

## Reporting a vulnerability

Do not open a public issue. Email the maintainers (address to be set before launch) with steps to reproduce.
We acknowledge within 3 working days.

## Data we handle

Buddy Coach processes health and fitness data (body measurements, nutrition, heart rate, sleep, wellbeing check-ins).
Under the Swiss revFADP and the EU GDPR this is sensitive personal data. Rules for every contributor:

- Collect only what a feature needs; every new data field needs a stated purpose.
- Health data needs explicit, revocable consent per purpose (health processing, AI processing).
- Never log health data, tokens or passwords. Logs carry ids, not content.
- Never send names, emails or user ids to an LLM provider; send only the minimum task context.
- Encrypt in transit (TLS) and at rest; encrypt device tokens and health-screening answers at field level.
- Users can export and delete all their data, including AI memory.
- Host in Switzerland or the EU; sign data processing agreements with every sub-processor.

The product is a wellness and coaching tool, not a medical device: no diagnoses, and red-flag symptoms always lead to "see a professional".
