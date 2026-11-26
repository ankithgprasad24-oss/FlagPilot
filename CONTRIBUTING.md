# Contributing to FlagPilot

Thanks for helping improve FlagPilot. Read the [project overview and architecture](./README.md) before changing code.

## Development checks

Install the frontend and backend dependencies, then run:

```sh
npm run lint
npm run build
npm test
```

FlagPilot is split into a Vite frontend and an Express backend under `backend/`. Keep unit tests deterministic and isolate upstream Flagsmith requests with mocks. Do not claim a real Flagsmith connection unless one was actually verified using a configured environment.

## Contribution principles

- Preserve the separation between local Demo Mode data and verified Live Mode evaluations.
- Keep Flagsmith Live Mode read-only. Do not add Management API operations or privileged tokens without a separately reviewed security design.
- Label generated metrics and activity as simulated; do not imply production telemetry.
- Prefer focused changes using existing helpers and components. Add tests for changed domain behavior.
- Include build, lint, and test results in pull requests. The GitHub Actions workflow runs the same checks.
- Never commit `.env` files, Environment Keys, Organisation API Tokens, or other credentials.

Use the repository's GitHub issue and pull request templates. Search existing upstream Flagsmith documentation/issues before proposing ecosystem changes, and cite the official SDK/API capability relied upon.

## License status

No license file was present when these instructions were added. Do not assume a license grant or redistribute the project on that basis; the repository owner needs to clarify licensing before accepting contributions under an open-source license.
