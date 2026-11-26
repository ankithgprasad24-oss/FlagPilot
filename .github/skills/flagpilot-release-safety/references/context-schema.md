# Release context schema

Supply a JSON object with the following shape. Fields marked optional may be omitted when unavailable; do not replace unavailable values with zero.

```json
{
  "flag": {
    "name": "Checkout v2",
    "purpose": "Gradually release the redesigned checkout flow.",
    "key": "checkout_v2",
    "enabled": true,
    "rolloutPercent": 25,
    "targetEnvironment": "Production",
    "configuration": {
      "configuredInEnvironment": true,
      "targetingRuleCount": 1
    }
  },
  "recentChanges": [
    {
      "description": "Rollout advanced from 10% to 25%.",
      "occurredAt": "2026-11-26T14:00:00Z"
    }
  ],
  "metrics": {
    "errorRatePercent": 0.4,
    "latencyMs": 190,
    "conversionRatePercent": 3.2,
    "successfulRequests": 9970,
    "failedRequests": 30
  },
  "baseline": {
    "errorRatePercent": 0.3,
    "latencyMs": 185,
    "conversionRatePercent": 3.1
  },
  "riskAssessment": {
    "level": "Low",
    "score": 18,
    "reasons": ["No material regression was reported."]
  },
  "dataProvenance": "real"
}
```

## Field notes

- `flag.name`, `flag.purpose`, `flag.enabled`, `flag.rolloutPercent`, and `flag.targetEnvironment` describe the release under review.
- `flag.configuration` is relevant environment configuration only. Include configuration state and targeting-rule count when known; omit secret values.
- `recentChanges` is the available change history, not necessarily a complete audit log. Each item may include an ISO-8601 timestamp.
- `metrics` and `baseline` use percentage units for error and conversion rates and milliseconds for latency. Request counts are optional.
- `riskAssessment` is an existing assessment, not a value the skill should fabricate.
- `dataProvenance` must be `real`, `simulated`, `mixed`, or `unknown`. “Real” means the caller supplied data it considers real; the skill itself does not verify it.
