# Parity Radar

Semantic configuration drift detection for Zerops environments.

## Problem

Staging and production can be created from the same infrastructure primitives
while gradually diverging in runtime and environment configuration.

Raw configuration diffs produce noise.

Parity Radar turns those differences into meaningful findings.

## What It Does

Zerops Project
↓
Environment Snapshot
↓
Normalization
↓
Configuration Diff
↓
Semantic Drift Rules
↓
Actionable Findings

## Example

Staging:
Node.js v24.16.0
PARITY_TEST=true

Production:
Node.js v22.22.3
PARITY_TEST=missing

Parity Radar reports:

HIGH — Runtime drift
HIGH — Missing environment variable
EXPECTED — Environment identity difference

## Why Zerops

Parity Radar uses Zerops as the source of truth for environment
and service configuration.

It consumes Zerops project, environment, and service-stack APIs
rather than relying on manually maintained configuration files.

## Architecture

[diagram]

## Supported Drift Rules

- Runtime version drift
- Environment variable presence/value drift
- Environment identity classification
- Resource/autoscaling drift
- Startup configuration drift
- Networking configuration drift
- Unknown/unclassified changes

## Running Locally

### Backend

...

### Frontend

...

## Security

The Zerops API token is stored only on the backend.
The frontend never receives the token.

## Limitations

Current version focuses on configuration-level drift.
It does not inspect application runtime behavior, traffic,
logs, or application-level correctness.

## Future Work

- More semantic drift rules
- Historical drift tracking
- CI/CD integration
- Pull-request drift reports
- Scheduled comparisons
