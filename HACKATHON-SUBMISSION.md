# FlagPilot — Hackathon Submission

## Project title

**FlagPilot — Ship with confidence**

## Short description

FlagPilot is a feature-flag release-management companion for the Flagsmith ecosystem. It gives developers a visual place to explore staged releases, inspect simulated monitoring signals, and reason about release safety while keeping demo data clearly separate from optional, read-only Flagsmith evaluations.

## Problem

Feature flags make gradual releases and fast rollbacks possible, but the decision to advance a rollout often requires comparing configuration, exposure, operational signals, and recent changes across different views. A missing metric can also be mistaken for a healthy one when context is unclear. Teams need a practical way to explore release decisions without presenting guesses as production evidence or making unreviewed changes.

## Solution

FlagPilot turns the feature-flag release lifecycle into an interactive release playground. In Demo Mode, deterministic scenarios let a developer see how rollout progress, simulated monitoring, risk signals, activity, and a safety recommendation fit together. An optional backend retrieves Flagsmith evaluated flag state through a verified, read-only integration, without mutating remote flags or claiming monitoring data it does not receive.

## Main features

- **Guided product tour** and overview dashboard for a first-time judge.
- **Feature flag lifecycle** with typed local flag configuration, targeting-rule previews, environment comparison, duplication, and local change history.
- **Rollout simulator** with staged exposure, simulated health metrics, confirmation-gated local rollback, and related activity.
- **Release monitoring** with deterministic request, error, latency, conversion, and exposure series; baseline comparisons; time ranges; anomaly explanations; and health classification.
- **Release Safety** with clear risk signals and contextual next steps.
- **Release Safety Agent Skill** that analyzes structured context and recommends exactly one of `PROCEED`, `HOLD`, `REDUCE ROLLOUT`, or `ROLLBACK`. The skill is advisory and does not execute changes.
- **Repeatable demo scenarios:** healthy gradual rollout, elevated error rate, high latency, risky production rollout, and rollback.
- **Demo reset** that restores sample data without deleting profile preferences or connection settings.
- **Flagsmith Live Mode** with a verified, read-only evaluation of a configured Production environment through the deployed backend.
- **Demo Mode fallback** that has been verified to restore successfully after disconnecting the Flagsmith backend.

## Technical architecture

- **Frontend:** React, TypeScript, Vite, Tailwind CSS v4, and Lucide icons.
- **Backend:** Separate Express + TypeScript service under `backend/`.
- **Flagsmith:** The backend uses the official `@flagsmith/flagsmith` JavaScript SDK for remote, environment-level evaluation via the Flags API.
- **Data boundaries:** Demo Mode state is stored in browser `localStorage`; Live Mode requests go to the backend and return evaluated Flagsmith flags. Demo telemetry, local targeting evaluation, rollout simulation, and local activity are not presented as live server data.
- **Frontend hosting:** Deployed on Vercel.
- **Backend hosting:** Deployed on Render.
- **Validation:** Deterministic frontend and backend tests cover release-domain logic and mocked Flagsmith API behavior.
- **Deployment verification:** The deployed backend health endpoint and the deployed frontend-to-backend Flagsmith Production evaluation have been verified.

## Flagsmith ecosystem relevance

FlagPilot complements Flagsmith; it is not a replacement for the Flagsmith feature-flag service. It demonstrates how evaluated flags can be surfaced alongside a release-management experience. The backend maps local Development, Staging, and Production aliases to configured Flags API Environment Keys; those aliases are not discovered Flagsmith environment names.

The integration is intentionally read-only. It does not use a privileged Management API token, does not create or update flags, and does not provide production telemetry, targeting rules, rollout percentages, or server-side audit history. Flagsmith Environment Keys are public SDK keys; keeping them in backend configuration is a routing choice, not a way to make them secret.

## Agent Skill

The reusable skill lives at `.github/skills/flagpilot-release-safety/SKILL.md`, with a machine-readable example and input schema. It reasons only over supplied structured release context, labels provenance, treats absent metrics as missing rather than healthy, and explains its recommendation. The UI currently uses a deterministic local rule-based fallback; no external AI model is configured or claimed. Neither the skill nor the UI fallback changes a flag.

## Open-source angle and contribution status

The codebase includes contribution guidance, issue and pull-request templates, and a GitHub Actions workflow for lint, build, and tests.

A possible small ecosystem contribution identified during review is a documentation clarification in the official Flagsmith JavaScript SDK docs connecting Node/server-side remote evaluation, Environment Key categories, and raw versus JSON value handling. This is only a candidate: no upstream issue was verified, and no upstream issue or pull request has been submitted.

**Licensing:** A license should be added before presenting the project as a formally licensed open-source distribution.

## Security and limitations

- The backend exposes public, unauthenticated, read-only endpoints. There is no tenant isolation; CORS does not prevent non-browser clients from calling the service.
- The backend rejects mutation methods, limits request size, applies per-IP rate limiting and security headers, uses configured CORS origins, and sanitizes errors. The in-memory limit is not a durable abuse-control system.
- Only public Flags API Environment Keys are supported. Do not configure privileged Management API tokens or put confidential values in flag payloads.
- Demo monitoring, targeting evaluation, experimentation, rollout behavior, and activity are local/simulated. No production telemetry is integrated.
- Flagsmith Live Mode has been verified for a configured Production environment through the deployed backend.
- The integration is read-only and does not control remote flag configuration or rollout changes.
- The design is intended for a controlled hackathon demonstration, not production multi-tenant use.

## Demo walkthrough outline

1. **Overview:** Introduce FlagPilot and point out the Demo Mode indicator.
2. **Choose a scenario:** Select “Elevated error rate” to populate a coherent, explicitly simulated release.
3. **Inspect monitoring:** Show the error trend, baseline comparison, and explanation; note that timing is not proof of causation.
4. **Review Release Safety:** Show how the signals lead to an advisory recommendation and what information is missing.
5. **Show the Agent Skill:** Explain the structured inputs, provenance handling, and analysis-only boundary.
6. **Show Flagsmith Live Mode:** Demonstrate the verified Production connection and read-only flag evaluation.
7. **Show Demo Mode fallback:** Explain and demonstrate that the local demo experience restores when disconnected from the backend.

## Suggested two-minute pitch

> Feature flags help teams release gradually, but deciding whether to keep expanding a rollout means understanding exposure, configuration, operational signals, and recent changes together. FlagPilot is a release-management companion for the Flagsmith ecosystem that makes that decision workflow visible.
>
> In Demo Mode, I can select a deterministic release scenario and follow the same flag through its rollout, monitoring view, activity, and Release Safety assessment. Here, the error rate is rising against the simulated baseline, so the dashboard explains why the recommendation is to hold or reduce exposure. These metrics are explicitly simulated; they are not production telemetry.
>
> FlagPilot also includes a reusable Release Safety Agent Skill. It takes structured context, reports missing information instead of treating it as healthy, and returns one advisory recommendation. It cannot change a flag.
>
> FlagPilot also connects to Flagsmith through a deployed backend using the official JavaScript SDK for read-only Production flag evaluation. The integration has been verified, and the application clearly separates the live evaluation from its local Demo Mode.
>
> The goal is to make release decisions easier to inspect and discuss—without hiding what is simulated, what is connected, or what remains a human decision.

## Implemented versus unverified

**Implemented and verified**

- Frontend dashboard, flags, rollouts, experiments, environment views, release risks, release monitoring, settings, tour, deterministic scenarios, and reset flow.
- Structured Release Safety Agent Skill plus deterministic local UI analysis.
- Protected, read-only Flagsmith backend adapter.
- Vercel frontend deployment.
- Render backend deployment.
- Backend health endpoint verification.
- Deployed frontend-to-backend Flagsmith Production evaluation.
- Demo Mode fallback restoration after disconnecting the backend.
- Local secret-file ignore rules, contribution resources, and CI workflow definition.
- Automated tests using deterministic fixtures and mocked Flagsmith responses.

**Not verified or not performed**

- Upstream contribution: no issue or pull request has been submitted.
- Open-source licensing: no license has been selected or added.
- Hosted GitHub Actions execution: not independently verified during final deployment verification.
- Product screenshots for the submission: not yet prepared as a dedicated submission screenshot set.

## Suggested manual submission checklist

- Choose and add a license before claiming open-source reuse terms.
- Review the GitHub repository contents and confirm the final commit.
- Add the actual repository URL and deployed demo URL to the hackathon submission.
- Optionally configure additional Flagsmith demo scenarios with non-confidential flag values.
- Capture genuine product screenshots following `docs/screenshots/README.md`.
- Confirm CI passes on the published repository.
- Complete and submit the hackathon entry manually.
