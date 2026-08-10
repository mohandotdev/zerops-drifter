# Parity Radar

### Semantic configuration drift detection for Zerops environments

**Parity Radar compares two live Zerops environments and turns configuration differences into meaningful, severity-ranked findings.**

Instead of showing a noisy raw JSON diff, it asks a more useful question:

> **Is this difference an actual drift problem, or an expected difference between environments?**

---

## Why Parity Radar?

Staging and production can start from the same infrastructure model and gradually diverge.

A runtime can be upgraded in one environment. An environment variable can be added to staging but never promoted. Resource or networking settings can change independently.

These differences may remain invisible until production behaves differently from what was tested in staging.

Parity Radar is built around this problem:

```text
        Zerops API
            │
      ┌─────┴─────┐
      ▼           ▼
   Staging     Production
      │           │
      └─────┬─────┘
            ▼
   Canonical snapshots
            │
            ▼
    Configuration diff
            │
            ▼
    Semantic drift rules
            │
            ▼
      Findings + severity
            │
            ▼
       Parity Radar UI
```

The important distinction is that **Parity Radar does not treat every difference as a problem**.

For example:

- Different environment identity → **Expected**
- Node.js runtime mismatch → **High / Drift**
- Missing environment variable → **High / Drift**
- Unknown configuration difference → **Unclassified**

---

## What it does

1. **Discovers Zerops projects** through the Zerops API.
2. **Selects two environments**, typically staging and production.
3. **Collects live configuration** for each environment.
4. **Normalizes the configuration** into a comparable snapshot.
5. **Compares the snapshots** instead of comparing arbitrary API responses.
6. **Groups low-level changes into semantic findings** where appropriate.
7. **Classifies differences** as `DRIFT`, `EXPECTED`, or `UNCLASSIFIED`.
8. **Assigns severity** so important differences are easier to identify.
9. **Explains why the difference matters** and exposes technical details when needed.

---

## Example

Suppose the environments contain:

| Configuration | Staging | Production | Result |
|---|---|---|---|
| Node.js version | `v24.16.0` | `v22.22.3` | **HIGH — Drift** |
| `PARITY_TEST` | `true` | Missing | **HIGH — Drift** |
| Environment type | `staging` | `production` | **INFO — Expected** |

Instead of presenting several low-level JSON changes, Parity Radar produces findings such as:

```text
HIGH · Runtime
Node.js runtime

Staging       v24.16.0
Production    v22.22.3

Runtime configuration differs between staging
and production for nodejs.
```

and:

```text
HIGH · Environment variable
PARITY_TEST

Staging       true
Production    Missing

Variable PARITY_TEST exists in staging
but is missing from production.
```

Technical details remain available when a deeper inspection is required.

---

## Architecture

Parity Radar is intentionally split into a frontend and backend.

```text
Developer
    │
    ▼
React + TypeScript Frontend
    │
    │ REST API
    ▼
Node.js + Express Backend
    │
    │ live configuration
    ▼
Zerops API
    │
    ├── Staging project
    └── Production project
            │
            ▼
     Canonical snapshots
            │
            ▼
     Semantic diff engine
            │
            ▼
   Findings + severity + classification
            │
            ▼
        Frontend UI
```

### Frontend

**React + TypeScript**

Responsible for:

- discovering available projects
- selecting staging and production
- presenting the comparison workflow
- showing scan progress
- displaying severity-ranked findings
- showing environment values side-by-side
- exposing technical details on demand

### Backend

**Node.js + Express**

Responsible for:

- communicating with the Zerops API
- retrieving project and service configuration
- creating canonical environment snapshots
- comparing staging and production
- applying semantic drift rules
- classifying and ranking findings
- keeping the Zerops API token away from the browser

### Zerops

Zerops is not simply the hosting platform for Parity Radar.

The product depends on Zerops' project and environment model as its source of live configuration state. The comparison is performed against real Zerops environments rather than manually maintained configuration files.

---

## Semantic drift model

The core idea is to separate **raw changes** from **meaningful findings**.

```text
Raw API configuration
        │
        ▼
Canonical snapshot
        │
        ▼
Low-level changes
        │
        ▼
Semantic grouping
        │
        ▼
Classification
        │
        ├── DRIFT
        ├── EXPECTED
        └── UNCLASSIFIED
        │
        ▼
Severity
        │
        ▼
Human-readable finding
```

### Current finding categories

- **Runtime** — groups related runtime fields into a single runtime finding.
- **Environment variable** — detects missing, extra, or changed variables.
- **Environment identity** — recognizes intentional staging/production identity differences.
- **Capacity** — covers resource and autoscaling configuration.
- **Startup** — detects startup configuration differences.
- **Networking** — detects networking configuration differences.
- **Unknown** — preserves changes that do not yet have a dedicated semantic rule.

### Severity

Current severity levels are:

- `CRITICAL`
- `HIGH`
- `MEDIUM`
- `LOW`
- `INFO`

---

## API surface

The frontend communicates with the custom Express backend rather than calling the Zerops API directly.

```text
GET /api/projects

GET /api/compare?stagingId=<id>&productionId=<id>
```

This keeps the Zerops API credential on the server side and gives the frontend a purpose-built comparison API.

---

## Security

The Zerops API token is handled by the backend only.

The frontend does **not** receive the Zerops API token and does not communicate directly with the authenticated Zerops API.

Runtime configuration should be supplied through environment variables or the deployment platform's secret/environment-variable mechanism rather than committed credentials.

---

## Running locally

### Prerequisites

- Node.js 22+
- A Zerops API access token
- Two Zerops projects/environments that can be compared

### Backend

```bash
cd backend
npm install
npm run dev
```

The backend runs on port `3001` by default.

Configure the backend with the Zerops API settings required by the application, including the API URL, client ID, project IDs, port, and CORS origin.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Configure the frontend API base URL when the backend is running on a different origin:

```text
VITE_API_BASE_URL=http://localhost:3001
```

---

## Deployment

Parity Radar is deployed as a Zerops application with separate frontend and backend services.

The repository uses a root-level `zerops.yaml` to define the build and runtime configuration for both services.

```text
zerops-drifter/
├── frontend/
├── backend/
├── zerops.yaml
└── README.md
```

The frontend is built as a TanStack Start application and deployed from its generated application output.

The backend is built and run as the Express service.

---

## Project scope

The current version focuses on **configuration-level drift**.

It does not attempt to determine:

- application runtime behavior
- request traffic differences
- log-based incidents
- database contents or schema drift
- application-level correctness
- whether a configuration difference has already caused an incident

The goal is narrower and deliberate:

> **Make configuration drift between two live Zerops environments visible, understandable, and actionable.**

---

## Why this is Zerops-specific

Parity Radar is built around the existence of two real Zerops environments that can be inspected through the Zerops API.

Its value comes from comparing actual Zerops project and service configuration rather than comparing two manually maintained files.

If the Zerops environment model and API were removed, the core product would no longer work as designed; it would collapse into a generic configuration comparison tool.

---

## Design principles

### 1. Semantic differences over raw diffs

A low-level API diff is an implementation detail.

Users need to know what the difference means.

### 2. Explain the difference

A finding should answer:

- What changed?
- Between which environments?
- How important is it?
- Why should I care?
- What are the underlying technical values?

### 3. Expected differences are not incidents

Staging and production are supposed to have different identities.

Parity does not mean that every value must be identical.

### 4. Keep unknown changes visible

Not every configuration field has a semantic rule yet.

Unknown changes are surfaced as `UNCLASSIFIED` rather than silently ignored.

---

## Future direction

Possible extensions include:

- historical drift tracking
- drift snapshots over time
- CI/CD parity gates
- pull-request drift reports
- scheduled comparisons
- configurable severity policies
- additional Zerops configuration rules
- drift acknowledgement and suppression
- environment parity history

---

## Project status

**Working prototype / challenge project**

Parity Radar was built as a solo project for **The Zerops Challenge** and deployed to Zerops as a live frontend + backend application.

The project demonstrates a complete flow from:

```text
Live Zerops configuration
        ↓
Backend collection
        ↓
Snapshot normalization
        ↓
Semantic comparison
        ↓
Drift classification
        ↓
Frontend visualization
```

---

## AI-assisted development

AI tools were used as engineering assistants during development.

- **ChatGPT** — architecture discussions, technical research, debugging, implementation guidance, code review, UI/UX iteration, documentation, and deployment troubleshooting.
- **Lovable** — initial frontend prototyping and UI exploration; the resulting application was subsequently adapted, integrated, debugged, and deployed as part of the project implementation.

The architecture, product concept, semantic drift model, implementation decisions, testing, debugging, and final integration were developed and validated by the author.

---

## License

This repository was created as a challenge project. See the repository for the current licensing and source-availability terms.
