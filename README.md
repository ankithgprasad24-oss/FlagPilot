# FlagPilot

> **Release confidence for teams shipping with feature flags.**

FlagPilot is a visual release-management companion for the Flagsmith ecosystem. It helps developers inspect a flag rollout, explore release signals, and reason about whether to proceed, pause, reduce exposure, or recommend a rollback—without pretending simulated data is production telemetry or silently changing a real flag.

Feature-flag systems make controlled releases possible, but rollout state, operational signals, and the reasoning behind a release decision can be scattered across tools. FlagPilot brings those workflows into one readable dashboard, with an explicit boundary between locally simulated release management and verified, read-only Flagsmith evaluations.

## What makes FlagPilot distinct

- **A safe release playground:** explore flag lifecycle, environment comparisons, targeting previews, staged rollout, and emergency actions against local Demo Mode data.
- **Monitoring with provenance:** inspect deterministic trends, baselines, and anomaly explanations; demo measurements are labelled simulated, while unavailable live telemetry stays unavailable.
- **Advisory release safety:** a reusable [Release Safety Agent Skill](./.github/skills/flagpilot-release-safety/SKILL.md) and deterministic local fallback explain `PROCEED`, `HOLD`, `REDUCE ROLLOUT`, or `ROLLBACK`. Neither performs mutations.
- **Flagsmith ecosystem integration:** an optional backend uses the official JavaScript SDK for environment-level remote evaluation. Live Mode is shown only after a real backend evaluation succeeds; the backend exposes no privileged management operations.
- **Built for a short demo:** guided tour and coherent, repeatable scenarios for healthy rollout, rising errors, high latency, risky production exposure, and rollback.

### Demo Mode and Live Mode

| Mode | Data and behavior |
|---|---|
| **Demo Mode** | Works locally without a backend or Flagsmith account. Flags, edits, experiments, activity, and monitoring are local/simulated and stored in browser `localStorage`. |
| **Live Mode** | Optional. The backend retrieves evaluated flags from a configured Flagsmith Environment Key. The connection is reported successful only after an evaluation completes. This is read-only and does not provide telemetry, flag mutations, or server-side audit history. |

No real Flagsmith connection is configured or claimed for this checkout. See [Flagsmith setup](#flagsmith-integration) and [deployment](#deployment-for-a-hackathon-demo) if you choose to configure one.

### Quick start

Requirements: Node.js 22 or compatible current Node.js, and npm.

```sh
npm ci
npm run dev
```

Open the Vite URL printed in the terminal. Demo Mode is usable immediately; no backend configuration is needed. To run both services for optional Live Mode, install backend dependencies and start it in a second terminal:

```sh
npm ci --prefix backend
npm run backend:dev
```

Then connect from **Settings → Flagsmith connection** after configuring backend environment variables. Local backend setup is described under [Flagsmith integration](#flagsmith-integration).

### Validate changes

```sh
npm run lint
npm run build
npm test
```

The tests use deterministic fixtures and mocked Flagsmith responses. Passing them does not establish a real Flagsmith connection or hosted deployment.

### Security and licensing status

The backend is intentionally read-only and has no application authentication or tenant isolation. CORS is not authentication; a public demo endpoint can be called by non-browser clients. Do not put confidential values in Flagsmith flags. This architecture is suitable for a controlled hackathon demonstration, **not production multi-tenant hosting**. See [security considerations](#security-considerations).

The checkout currently has **no `LICENSE` file** and is not yet a licensed open-source distribution. The project is prepared for public review and contribution, but the owner must choose and add a license before reuse rights can be represented as granted. The working directory also has no Git metadata, so repository history and tracked-file status were not available during this review.

For a concise judging brief, see [HACKATHON-SUBMISSION.md](./HACKATHON-SUBMISSION.md). For suggested genuine product captures, see the [screenshot guide](./docs/screenshots/README.md).

## Screenshots

There are no product UI screenshots in this checkout. The existing `src/assets/hero.png` is a decorative brand graphic, not an application capture, so it is not presented as one. Capture actual application screens and add them under `docs/screenshots/` using the [screenshot guide](./docs/screenshots/README.md); do not include credentials, browser secrets, or fabricated live metrics.

## Hackathon demo

Start with the Overview, where a short project introduction explains the release workflow. The optional guided tour is available from the sidebar or Settings; it can be skipped, replayed, and is never forced on returning users. It walks through the Overview, flag management, progressive rollouts, Release Safety, monitoring, the Release Safety Agent Skill, and Settings.

In Demo Mode, choose a deterministic release scenario on the Overview:

- **Healthy gradual rollout** — a low-risk Staging release with stable simulated monitoring.
- **Elevated error rate** — an increasing simulated error trend to inspect and discuss.
- **High latency** — a simulated response-time increase compared with its baseline.
- **Risky production rollout** — full Production exposure with elevated risk signals.
- **Rollback scenario** — a disabled Production flag at 0% exposure with a linked local rollback event.

Scenarios configure a selected sample flag, environment, rollout, monitoring pattern, safety assessment, and local activity/timeline together. All scenario metrics and events are simulated; they are reproducible and are not production telemetry. Selecting a scenario replaces the current local demo flag set and release history with that scenario's fixtures. Scenario controls are unavailable in Live Mode.

Use **Settings → Reset demo data** to restore sample flags and clear local experiments and release history. A confirmation step explains the scope. Reset preserves the profile name, notification preference, tour status, and Flagsmith connection settings; it never mutates remote Flagsmith flags. In Live Mode, it clears saved local demo fixtures without changing the currently displayed Flagsmith evaluations.

## Project architecture

- `src/App.tsx` — application shell, navigation, local persistence, and integration-mode boundary.
- `src/features/` — flag lifecycle, rollout simulation, release safety, demo scenarios, and release monitoring.
- `src/integrations/` — frontend data-source and protected backend client.
- `backend/` — Express API and server-only Flagsmith SDK configuration.
- `.github/skills/flagpilot-release-safety/` — reusable Agent Skill instructions, examples, and input contract.
- `tests/` and `backend/` tests — deterministic frontend-domain and backend integration tests.

### Data flow and mode boundaries

In Demo Mode, the React app loads sample fixtures and stores local edits, scenarios, and activity in browser `localStorage`. These records are demonstrations, not synchronized with Flagsmith.

In Live Mode, the browser calls the configured FlagPilot backend. The backend selects an Environment Key from server configuration and initializes the official `@flagsmith/flagsmith` SDK to retrieve evaluated flags from Flagsmith's Flags API. The frontend receives flag keys, evaluated enabled states, values, and the selected local environment label. The SDK's `getAllFlags()` values are passed through as evaluated; textual values are not guessed to be JSON booleans or numbers.

The Development, Staging, and Production names in FlagPilot are local aliases mapped to three backend Environment Key settings; they are not discovered environment names returned by Flagsmith. Switching an alias changes which configured key the backend uses. The current adapter performs environment-level evaluation without an identity, user traits, or user-specific targeting context.

The Feature Flags workspace supports Boolean, String, Number, and JSON demo flags. Each flag can have an independent enabled state, typed default value, percentage rollout, targeting rules, and ALL/ANY condition logic in Development, Staging, and Production. Flag creation and edits are saved in this browser. The editor previews deterministic local targeting and rollout evaluation for editable sample-user attributes, compares environment configuration, supports duplication, and shows matching local activity.

## Feature-flag lifecycle and targeting

Open a flag from **Feature Flags** to inspect and manage its details. The detail editor validates keys, typed values, rollout bounds, and enabled targeting conditions before saving. Use **Duplicate** to create a new flag and key while retaining a copy of the source configuration.

Targeting rules support equals, does not equal, contains, greater than, and less than operators. Conditions are combined as **ALL (AND)** or **ANY (OR)** per environment. The sample-user evaluator applies the selected environment's enabled state and value, targeting rules, and a stable deterministic rollout bucket. This is a local demonstration only; it is not Flagsmith evaluation, and it does not affect a connected environment.

The environment comparison cards show Development, Staging, and Production configuration side by side and highlight differences relative to Development, including unconfigured environments. Edit a particular environment using its tab.

Flag edits add a local activity event with a summary of changed identity, type, value, enabled state, rollout, and targeting configuration. The detail view's change history is sourced from this browser's local activity log. It is not a server-side audit trail and is not synchronized to Flagsmith. In Live Mode, Flagsmith evaluations remain read-only and the management editor is unavailable; the backend does not expose flag mutations or audit history.

Run lifecycle and recommendation tests with:

```sh
npm test
```

## Rollout simulator

The Rollouts page previews releases at 0%, 10%, 25%, 50%, 75%, and 100%, with deterministic simulated traffic splits, conversion, errors, latency, and estimated impact. Select a stage to compare it with the other stages. Error-rate and latency alert thresholds are adjustable; simulated warnings recommend holding or rolling back. Applying a stage updates the selected local demo flag and records stage/health events in Activity Log and Release Risks. Rollback requires confirmation, disables the local demo flag, and records the action. These metrics are illustrative only—not production telemetry. In Live Flagsmith mode the simulator remains preview-only.

## Release monitoring

Open **Release Monitoring** from the sidebar, an Overview KPI card, or the Rollouts results panel to inspect one feature flag. Choose a 1-hour, 6-hour, 24-hour, or 7-day window. Demo Mode displays a deterministic trend for request volume, error rate, latency, conversion, and rollout exposure, along with an early-window baseline comparison, stage progression, flag-related local rollout/safety history, and generated signal events. The sample patterns intentionally include error increases, latency increases, and request-volume declines so the anomaly explanations can be explored. The range and selected flag are view controls; monitoring observations do not mutate a flag or create persisted activity.

Signals compare the start of the selected window with its latest samples and identify threshold crossings, abrupt final-sample jumps, or sustained unusual movement. The page summarizes healthy, warning, or critical status alongside the existing Release Safety risk score, explains the evidence, and suggests an investigation or hold. Signal timing is not proof of causation; compare cohorts, control traffic, and service logs before deciding. Recommendations are informational only—FlagPilot never automatically changes production flags.

In Flagsmith Live Mode, the page displays the verified evaluated flag state but does **not** create demo series or claim real request metrics. The read-only Flagsmith evaluation integration does not provide rollout history, exposure, request volume, errors, latency, conversion, deployment events, or monitoring telemetry. Those details remain unavailable until a genuine telemetry source is separately configured. Local activity is labeled as workspace history and is not server-side Flagsmith history.

## Run locally

```sh
npm install
npm install --prefix backend
npm run backend:dev
```

In another terminal, start the frontend:

```sh
npm run dev
```

## Flagsmith integration

The official [`@flagsmith/flagsmith`](https://www.npmjs.com/package/@flagsmith/flagsmith) JavaScript SDK runs only in the backend. The frontend calls a small read-only backend API; it does not receive the configured Environment Key.

### Configure the backend

1. Copy `backend/.env.example` to `backend/.env`.
2. In Flagsmith, copy the **Environment Key** for each Flags API environment you want to evaluate. Add it to the matching local alias variable: `FLAGSMITH_DEVELOPMENT_ENVIRONMENT_KEY`, `FLAGSMITH_STAGING_ENVIRONMENT_KEY`, and/or `FLAGSMITH_PRODUCTION_ENVIRONMENT_KEY`. Configure only the aliases you need.
3. Keep the default `FLAGSMITH_API_URL` for Flagsmith Cloud, or set it to your self-hosted Flagsmith API v1 base URL. The URL must use HTTPS except for a loopback development endpoint.
4. For older single-environment setups, `FLAGSMITH_ENVIRONMENT_KEY` is still supported. It is assigned only to the environment named by `FLAGSMITH_ENVIRONMENT_NAME` (Development, Staging, or Production) and is used only if that environment-specific key is empty. Do not set both variables for the same environment expecting the legacy key to override it.
5. Start the backend with `npm run backend:dev`, and the frontend with `npm run dev` in separate terminals. The backend listens on `127.0.0.1:3002` by default.
6. In FlagPilot, open **Settings → Flagsmith connection**, choose the matching environment, enter the backend URL if it differs from the default, then select **Connect to Flagsmith**. The backend verifies the selected environment key before evaluated flags appear. Use **Refresh flags** to fetch them again. Switching environments in the top navigation also fetches the corresponding backend-mapped environment; a missing key is reported instead of relabeling another environment's data.

The frontend remains in Demo Mode until a user connects. The backend may run without Flagsmith configuration: `/api/health` reports backend availability, while Flagsmith connection and flag endpoints return a clear configuration error. No Environment Keys are configured in this repository, so a successful Flagsmith connection is not assumed or claimed.

Optionally copy the root `.env.example` to `.env.local` and set `VITE_FLAGPILOT_BACKEND_URL` to a different backend origin. This value is a public URL, not a credential. Restart Vite after changing it.

## Deployment for a hackathon demo

The repository includes a static Vercel frontend configuration (`vercel.json`) and a Render backend blueprint (`render.yaml`). Deployment is manual; these files do not create hosting accounts, deploy services, or configure credentials. Demo Mode works without either service. Live Mode requires the hosted backend and, if you want to show Flagsmith data, a configured Flagsmith Environment Key.

### Deploy the backend to Render

1. Push this project to a Git provider and create a Render **Blueprint** from the repository, selecting `render.yaml`. Alternatively, create a Node web service with **Root Directory** `backend`, **Build Command** `npm ci && npm run build`, **Start Command** `npm start`, and **Health Check Path** `/api/health`.
2. Set `FLAGPILOT_CORS_ORIGINS` to the exact deployed frontend origin, such as `https://your-project.vercel.app`. Do not add a path or trailing slash. Add additional exact origins as a comma-separated list if needed; wildcard origins are not supported.
3. If enabling Live Mode, set only the needed `FLAGSMITH_*_ENVIRONMENT_KEY` values to the Flags API Environment Keys for the corresponding aliases. These keys are public Flagsmith SDK keys, not privileged Management API tokens. Leave them unset to deploy the backend health endpoint without Flagsmith connectivity. `FLAGSMITH_API_URL` defaults to Flagsmith Cloud; use a valid HTTPS API v1 URL for a self-hosted instance.
4. Render supplies `PORT`; the service binds to `HOST=0.0.0.0` as configured in the blueprint. Confirm the deployed `https://<service>.onrender.com/api/health` returns `{"status":"ok","service":"flagpilot-backend"}`.

### Deploy the frontend to Vercel

1. Import the repository into Vercel using the project root as the **Root Directory**. `vercel.json` runs `npm run build:frontend`, serves `dist`, and routes application paths to the SPA entry point. The backend is deployed separately.
2. Add the build-time environment variable `VITE_FLAGPILOT_BACKEND_URL=https://<service>.onrender.com` (origin only, no path or trailing slash). This is a public backend URL, never a secret. Redeploy after changing it because Vite embeds `VITE_*` values into the frontend build.
3. Copy the exact Vercel production origin into the backend's `FLAGPILOT_CORS_ORIGINS` and redeploy the backend. Vercel preview URLs are different origins; add each required preview origin explicitly or use the deployed production URL for the demo.
4. Open the Vercel URL. Demo Mode is immediately available. To use Live Mode, open **Settings → Flagsmith connection**, select the matching local environment alias, and connect to the configured backend. Successful status is shown only after a real backend evaluation succeeds.

The production frontend has no implicit localhost backend URL. If `VITE_FLAGPILOT_BACKEND_URL` is absent, Demo Mode remains available and the Settings form asks for a backend URL before attempting Live Mode. If the hosted backend sleeps or is temporarily unavailable, Live Mode reports the connection error and does not substitute demo flags as live results. Render's free service may cold-start after inactivity, so the first connection or health request can take longer.

### Deployment variables and troubleshooting

| Variable | Where | Purpose |
|---|---|---|
| `VITE_FLAGPILOT_BACKEND_URL` | Vercel build environment | Public HTTPS origin for the FlagPilot backend |
| `HOST` | Render backend | Bind address; use `0.0.0.0` for hosted networking |
| `PORT` | Render backend | Assigned by Render; do not hardcode a production port |
| `TRUST_PROXY_HOPS` | Render backend | Trusted proxy count; use `1` only behind Render's ingress proxy |
| `FLAGPILOT_CORS_ORIGINS` | Render backend | Comma-separated exact browser origins allowed by CORS |
| `FLAGSMITH_API_URL` | Render backend, optional | Flagsmith API v1 URL; defaults to Flagsmith Cloud |
| `FLAGSMITH_DEVELOPMENT_ENVIRONMENT_KEY` | Render backend, optional | Environment Key for the Development alias |
| `FLAGSMITH_STAGING_ENVIRONMENT_KEY` | Render backend, optional | Environment Key for the Staging alias |
| `FLAGSMITH_PRODUCTION_ENVIRONMENT_KEY` | Render backend, optional | Environment Key for the Production alias |

- **CORS/network error:** Verify the frontend URL exactly matches one entry in `FLAGPILOT_CORS_ORIGINS`, including scheme and hostname. Then redeploy the backend.
- **Live connection reports missing configuration:** Verify the selected alias has its matching Environment Key set on Render. The backend health endpoint can be healthy even when no Flagsmith keys are configured.
- **Frontend uses an old backend URL:** Check the Vercel Production environment variable and trigger a new frontend deployment; the URL is read at build time.
- **Health check fails:** Check Render logs for startup/configuration errors and confirm the service uses the Node runtime, `npm start`, and the `/api/health` path.
- **Demo Mode:** Choose Demo Mode in the application; it needs no backend, Flagsmith account, or network connection.

### Backend API and security scope

- **Public health:** `GET /api/health` reports backend availability; it does not verify Flagsmith.
- **Public read-only configuration:** `GET /api/flagsmith/environments` returns only the names of aliases with Environment Keys configured; it never returns keys.
- **Public read-only verification:** `GET /api/flagsmith/environments/:environment/connection` performs an evaluation and returns its label, evaluated flag count, and verification time, not credentials.
- **Public read-only evaluation:** `GET /api/flagsmith/environments/:environment/flags` returns evaluated flag keys, enabled states, and values for that configured alias.
- **Compatibility read-only routes:** `GET /api/flagsmith/connection` and `/api/flagsmith/flags` evaluate the configured default environment.
- **No sensitive or mutating route exists:** no management token is configured or used; there are no create, edit, enable/disable, identity mutation, or rollback endpoints. Non-GET/OPTIONS methods are rejected, unknown routes return 404, query strings are rejected, and GET request bodies are rejected. JSON bodies are capped at 10 KB.
- The backend binds to loopback (`127.0.0.1`) by default; hosted deployments set `HOST=0.0.0.0`. CORS uses exact configured origins, Helmet security headers, and a 60-request/minute in-memory per-IP limit across API routes. Rate-limit responses are JSON; frontend error handling uses a safe message allowlist and never renders arbitrary backend error text. Logs contain only fixed categories and sanitized error codes, not URLs with credentials, request bodies, Flagsmith keys, upstream response bodies, or stack traces.
- In production, no development CORS origins are assumed: if `FLAGPILOT_CORS_ORIGINS` is unset, browser origins are not allowed until exact frontend origins are configured. `TRUST_PROXY_HOPS` defaults to `0`; set it only to the known proxy hop count for the hosting platform (Render uses `1`). Incorrect proxy trust settings can make IP-based rate limiting unreliable.
- **Hackathon demo boundary:** these endpoints are intentionally public and unauthenticated. CORS is a browser policy, not authentication; non-browser clients can call endpoints regardless of CORS. Anyone can query configured public Environment Keys, read the returned evaluated flag values, and consume the in-memory rate limit. Do not include confidential values in Flagsmith flags. This architecture is for a controlled hackathon demonstration, not production multi-tenant use; production requires authentication, authorization, tenant isolation, durable abuse controls, and an appropriate operational security review.
- The backend uses the official SDK's remote Flags API evaluation (`environmentID`, `getAllFlags()`); caching and analytics are disabled. It validates the upstream evaluation response and applies a 10-second per-request timeout. It distinguishes missing environment configuration, invalid API URL configuration/paths, permission responses, rate limiting, timeouts, network failures, and malformed responses. Error messages and logs omit keys and raw upstream response bodies.
- **Important key distinction:** Flagsmith documents the Flags API Environment Key as public and non-secret. Keeping it in `backend/.env` is FlagPilot's routing choice, not a way to make that public key confidential. The app does not use a secret Organisation API Token or perform Management API calls. Flagsmith describes a Server Side SDK Token as a credential for server-side local evaluation; this integration does not enable local evaluation and does not use that token. Do not substitute privileged tokens for an Environment Key.
- `.env` files are ignored by Git. Environment Keys are not returned by the backend API or persisted in frontend browser storage. Because an Environment Key is not a secret, backend routing alone is not an authorization boundary. The backend has no user authentication and is not suitable as a production multi-tenant service.
- The Flagsmith evaluation SDK does not provide descriptions, rollout percentages, targeting rules, risk levels, or deployment health. These remain unavailable in Live Mode rather than being inferred. Rollout simulation, experiments, risk signals, and activity history remain local/demo data and are labeled as such.
- Release Safety Intelligence is available in Demo Mode. It deterministically estimates risk, request health, latency, and engagement from the selected flag, environment, rollout, and recent local changes. Decisions, health checks, and risk transitions are persisted to the local activity log and release timeline. Metrics are illustrative only and are not production telemetry; live Flagsmith evaluations are not subject to simulated rollback or release actions.

Official references:

- [Flagsmith JavaScript SDK](https://docs.flagsmith.com/integrating-with-flagsmith/sdks/client-side-sdks/javascript) — documents `environmentID`, `getAllFlags()`, and the default string return of `getValue()` versus optional JSON parsing.
- [Flags API overview](https://docs.flagsmith.com/integrating-with-flagsmith/flagsmith-api-overview) — distinguishes public Environment Keys from secret Organisation API Tokens.
- [Flags API](https://docs.flagsmith.com/integrating-with-flagsmith/flagsmith-api-overview/flags-api) — describes environment/user evaluation endpoints and read-only flag serving.
- [JavaScript SDK source](https://github.com/Flagsmith/flagsmith-js-client) — official SDK source repository.
- [Management API overview](https://docs.flagsmith.com/integrating-with-flagsmith/flagsmith-api-overview/management-api) — privileged project-management API; not used by FlagPilot.

### Integration validation

Run `npm test` for frontend tests and backend tests using the official SDK with mocked upstream responses. These tests cover successful and empty evaluations, environment-key separation, missing configuration, permission failures, invalid URLs, network errors, timeouts, malformed responses, value fidelity, and HTTP endpoints. They do not use or imply a real Flagsmith connection. Run `npm run build` and `npm run lint` for frontend/backend type/build and lint checks.

Release monitoring calculations and anomaly thresholds use deterministic test data in `tests/releaseMonitoring.test.mjs`; they verify baselines, healthy/warning/critical classification, error/latency/traffic/conversion changes, reproducibility, activity linking, and time windows.

## Release Safety Agent Skill

The reusable [FlagPilot Release Safety Agent Skill](./.github/skills/flagpilot-release-safety/SKILL.md) analyzes structured feature-flag release context and recommends exactly one of `PROCEED`, `HOLD`, `REDUCE ROLLOUT`, or `ROLLBACK`. It can be loaded by an AI agent independently of the FlagPilot UI. The input contract and a machine-readable example are in the skill's `references` and `examples` directories.

In the UI, open **Release Risks**, select a flag, and choose **Analyze selected flag**. The current interface uses a deterministic local rule-based fallback over FlagPilot's simulated demo metrics; no AI model is configured or invoked. The result is explicitly labeled as simulated and local. It does not query Flagsmith, apply a stage, toggle a flag, or roll anything back. In Live Mode the page continues to withhold simulated release-health assessments because the read-only Flagsmith integration does not provide telemetry or risk history.

The skill and local fallback are advisory only. Missing metrics are not considered healthy, baselines are compared only when supplied, thresholds are illustrative rather than universal SLOs, and a human must review any recommendation. Actual flag mutation requires a separate authorized workflow and explicit human confirmation. No secrets should be included in the analysis context.

Run the representative evaluator tests with:

```sh
npm run test:release-safety
```

## Security considerations

- Never put an Organisation API Token, Management API token, or any other privileged credential in frontend code, Vite environment variables, browser storage, fixtures, issue reports, or screenshots.
- The Flags API Environment Key used here is documented by Flagsmith as public/non-secret. It is kept in backend configuration to centralize environment selection; its placement does not make the key confidential.
- The backend is read-only and has no application authentication. For public hackathon hosting, configure exact CORS origins and rely only on public Flags API Environment Keys; understand that CORS does not prevent non-browser clients from calling the API. A production multi-tenant deployment requires a separately designed authentication, authorization, tenant isolation, HTTPS, network egress, and secret-management model.
- The backend accepts its Flagsmith API URL from operator-controlled environment configuration. A deployed service must also constrain outbound destinations and apply deployment-specific SSRF protections.
- Report suspected vulnerabilities privately to the repository maintainer rather than including working secrets or exploit payloads in public issues. This repository currently has no `SECURITY.md` contact and no `LICENSE` file.

## Contributing

Contributions should preserve the Demo/Live data boundary, keep live Flagsmith operations read-only, and label simulated data. For code changes:

1. Open a focused issue or explain the problem and expected behavior in a pull request.
2. Reuse existing domain helpers and UI patterns; add deterministic tests for changed behavior.
3. Run `npm run lint`, `npm run build`, and `npm test`.
4. For Flagsmith-related changes, cite the supported SDK/API documentation and test with mocks. Clearly state whether a real Flagsmith project was used; do not include Environment Keys or other credentials in tests or artifacts.
5. Describe security, accessibility, and Demo/Live implications in the pull request checklist.

Use the provided [bug report](./.github/ISSUE_TEMPLATE/bug_report.md), [feature request](./.github/ISSUE_TEMPLATE/feature_request.md), and [pull request template](./.github/PULL_REQUEST_TEMPLATE.md). Please search existing issues before opening a new request.

**License status:** no license file was present during this repository review, and `package.json` does not declare one. No license has been added or assumed. The repository owner should select and publish a license before describing reuse or contributions as being under an open-source license.

## Flagsmith ecosystem contribution opportunity

This review did not verify an upstream bug or locate an existing issue, so it does not claim one. A small, defensible candidate is a documentation clarification in the official [Flagsmith JavaScript SDK repository](https://github.com/Flagsmith/flagsmith-js-client): add a short Node SSR/backend example that explicitly distinguishes remote Flags API evaluation using `environmentID` and the public Environment Key from server-side local evaluation credentials, and explains that `getAllFlags()` preserves SDK values while `getValue(key, { json: true })` opts into JSON parsing. The current docs separately explain JavaScript SDK use, `getValue` parsing, and API key categories; the proposed contribution would connect those concepts for server-rendered users rather than asserting a product defect. Confirm with maintainers and check for duplicate docs requests before submitting anything upstream.
