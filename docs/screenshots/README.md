# Product screenshot guide

This folder is reserved for genuine FlagPilot UI captures. No product screenshots are included yet; do not treat the decorative `src/assets/hero.png` as an application screenshot.

## Recommended captures

Capture these screens from a running build after choosing the corresponding state:

1. `overview-demo.png` — Overview with the Demo Mode label and a selected, clearly simulated release scenario.
2. `feature-flag-detail.png` — a local flag detail view showing its configuration and environment comparison.
3. `release-monitoring-error-scenario.png` — monitoring for the elevated-error demo scenario, with the simulated-data label and chart context visible.
4. `release-safety-analysis.png` — the advisory recommendation, risk signals, and missing-information section.
5. `agent-skill-settings.png` — the skill-assisted analysis or the Settings connection status. If showing Live Mode, capture only after an actual Flagsmith evaluation succeeds.

## Capture and add

- Use the production build or a clean local development session at a readable desktop viewport; capture a separate mobile view if it helps demonstrate responsive behavior.
- Keep the environment and data-source labels visible. Do not crop simulated metrics so they appear live.
- Do not include real Environment Keys, tokens, private user data, browser developer tools, or unverified connection claims.
- Save optimized PNG or WebP files in this directory and add them to the README with descriptive alt text, for example:

  ```markdown
  ![FlagPilot monitoring view showing a simulated error-rate increase](./docs/screenshots/release-monitoring-error-scenario.png)
  ```

- Prefer a small set of high-signal images over a large gallery. Check legibility and mobile rendering after adding them.
