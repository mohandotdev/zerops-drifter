# Parity Radar

Semantic configuration drift detection for Zerops environments.

Parity Radar compares two live Zerops environments, typically staging and production, and turns raw configuration differences into clear, severity-ranked findings.

## What it does

- Connects to the Zerops API through a backend service
- Collects environment and service configuration from two projects
- Builds a canonical snapshot for each environment
- Applies semantic drift rules to highlight meaningful differences
- Presents the results in a React-based UI

## Example

A staging and production environment may look similar at first but drift in areas such as:

- runtime version
- environment variables
- resource and autoscaling settings
- startup configuration
- networking configuration

Parity Radar surfaces the differences that matter, instead of leaving them as a noisy raw diff.

## Architecture

- Backend: Node.js + Express
  - Discovers Zerops projects
  - Collects environment and service configuration
  - Builds a normalized snapshot model for each environment
  - Applies semantic drift rules to generate findings
  - Exposes comparison endpoints to the frontend
- Frontend: React + TypeScript
  - Loads available projects
  - Lets users select a staging and production environment
  - Calls the backend comparison API
  - Displays findings, summaries, and details in a clear UI
- Deployment: Zerops monorepo setup via the root zerops.yaml file

## Running locally

### Backend

```bash
cd backend
npm install
npm run dev
```

The backend runs on port 3001 and exposes the comparison API endpoints.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Security

The Zerops API token is handled by the backend only. The frontend never receives it.

## Current scope

This version focuses on configuration-level drift detection. It does not attempt to infer application runtime behavior, traffic, logs, or database state.
