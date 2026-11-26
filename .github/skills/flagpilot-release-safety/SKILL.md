---
name: flagpilot-release-safety
description: "Analyze feature-flag rollouts for release risk and recommend PROCEED, HOLD, REDUCE ROLLOUT, or ROLLBACK. Use when reviewing rollout percentages, environments, telemetry, baselines, recent changes, or release-risk assessments."
argument-hint: "Provide a structured release context or select a FlagPilot flag for a read-only safety assessment."
user-invocable: true
---

# FlagPilot Release Safety

## Purpose

Produce a reasoned, read-only recommendation for a feature-flag release. This skill can be used outside the FlagPilot UI with any supplied structured context. It does not connect to Flagsmith, retrieve telemetry, or change a flag.

## When to use

- Before advancing a feature-flag rollout.
- When reviewing a release in Development, Staging, or Production.
- When comparing current error rate, latency, conversion, or engagement with a baseline.
- When recent changes or a release-risk assessment may affect exposure.
- When deciding whether to proceed, hold, reduce exposure, or recommend rollback.

## Inputs

Ask for or inspect a structured context matching [the context schema](./references/context-schema.md). It should identify:

- Flag name, purpose, enabled state, rollout percentage, target environment, and relevant environment configuration.
- Recent flag or rollout changes, if available.
- Current error rate and latency, when available; conversion/engagement and request counts are useful supporting evidence.
- Baseline metrics for the same environment and comparable time window, when available.
- Any existing release-risk assessment and its reasons.
- Data provenance: `real`, `simulated`, `mixed`, or `unknown`.

Treat every value as user-supplied evidence. Do not fill gaps with typical values or infer a baseline from current metrics. Do not include credentials, environment keys, admin tokens, or other secrets in the context.

## Procedure

1. Validate the flag identity, environment, enabled state, rollout percentage, metric units, and provenance. Call out contradictory or invalid values.
2. Separate observed facts from estimates. Label each metric as real, simulated, mixed, or unknown using the supplied provenance; if provenance is unknown, say so.
3. Review current error rate and latency, comparing them with a supplied baseline only when both values are comparable. Consider conversion/engagement declines, rollout changes, risk assessments, environment, and targeting configuration as additional context.
4. Record material risk signals and missing information explicitly. Missing telemetry is unknown—not zero, nominal, or healthy.
5. Apply the decision criteria below and select exactly one recommendation. Explain how each decisive signal affected it.
6. Return the output format below. Keep the recommendation advisory; do not invoke flag mutation tools or imply that a change has been applied.

## Decision criteria

Use the strongest applicable condition, in this order. A flag is actively exposed only when it is enabled and rollout is greater than 0%.

1. **ROLLBACK** — Recommend human review of rollback when an actively exposed flag has a critical supplied signal: error rate at least 2%, error rate at least 1 percentage point above baseline, latency at least 1000 ms, latency at least 150 ms and 50% above baseline, or conversion/engagement at least 1 percentage point below baseline. State which signal triggered the recommendation. Do not execute rollback.
2. **REDUCE ROLLOUT** — Recommend reducing exposure when an actively exposed flag has a material but non-critical signal: error rate at least 1.1% or 0.3 percentage points above baseline; latency at least 400 ms or at least 100 ms and 20% above baseline; or conversion/engagement at least 0.5 percentage points below baseline. Also recommend reduction for a supplied High-risk assessment at 50% or greater rollout in Production.
3. **HOLD** — Hold when a flag is disabled or at 0%; required current error-rate or latency data is missing; a supplied assessment is High risk without a stronger metric-triggered action; a Medium-risk assessment is at 50% or greater rollout; or a Production rollout at 75% or greater lacks a complete error-rate and latency baseline. A cluster of at least three recent changes in Production is another reason to hold for review.
4. **PROCEED** — Recommend proceeding only when the flag is actively exposed, current error rate and latency are supplied, and no stronger condition above applies. Do not call the release “safe”; state what remains unknown, such as a missing baseline or incomplete history.

These are conservative **illustrative defaults**, not universal SLOs. If the context supplies an authorized team policy, follow it and state that policy; do not silently replace it with these defaults. If a situation is ambiguous, choose HOLD and explain why.

## Output

Return a concise readable assessment with these sections:

1. **Recommendation** — exactly one of `PROCEED`, `HOLD`, `REDUCE ROLLOUT`, or `ROLLBACK`.
2. **Reasoning** — the key evidence and why it leads to this recommendation.
3. **Risk signals** — measured or supplied signals, including their provenance and baseline comparison where available.
4. **Missing information** — data needed to improve confidence; say “None identified” only when the context supports that statement.
5. **Limitations and action boundary** — clarify whether the input is simulated or real, whether anything was actually retrieved, and that no flag change was made.

Do not claim to have queried Flagsmith unless the conversation or tools show that the data was actually retrieved. Do not describe simulated estimates as real telemetry or present a recommendation as an automatic production decision.

## Examples

### Healthy supplied metrics

Given a production flag at 25%, enabled, with current error rate 0.4%, latency 190 ms, baseline error rate 0.3%, baseline latency 185 ms, a Low-risk assessment, and provenance `real`, recommend `PROCEED` if there are no other material signals. Mention that the small baseline deltas do not cross the illustrative thresholds. If conversion, change history, or another field is absent, list it as missing rather than inventing it.

### Missing health data

Given an enabled Staging flag at 10% with no current error-rate or latency data, recommend `HOLD`. Explain that exposure should not advance based on absent telemetry and list the required measurements as missing. Do not treat the absence of reported errors as a zero error rate.

For a complete machine-readable input example, see [healthy-rollout.json](./examples/healthy-rollout.json).

## Limitations and safety

- This skill reasons only over context provided to it. It does not fetch Flagsmith data, verify telemetry, or establish that a metric is genuine.
- Baselines are meaningful only when environment, population, units, and observation windows are comparable.
- Thresholds are illustrative. Follow explicit, authorized service-level objectives when supplied.
- Recommendations can be wrong when input is stale, incomplete, biased, or inconsistent. A qualified human owns release decisions.
- **Analysis only:** never execute or imply execution of a rollout change, flag toggle, or rollback. Actual mutations require a separate authorized application workflow and explicit human confirmation.
- Never request, print, or expose secrets.
