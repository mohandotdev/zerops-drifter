# Drift Rules Specification

## 1. Purpose

Define how Parity Radar classifies differences between two Zerops
environments.

The comparison happens after both environments have been normalized
into a canonical EnvironmentSnapshot.

The drift engine must distinguish between:

1. Expected differences
2. Meaningful configuration differences
3. Potentially dangerous differences
4. Unknown/unclassified differences

A structural difference alone must not automatically be treated as
a problem.

---

## 2. Comparison Pipeline

Zerops API
↓
Environment Snapshot
↓
Normalization
↓
Structural Diff
↓
Drift Rules
↓
Drift Findings

The structural diff identifies what changed.

The drift rules determine whether that change matters.

---

## 3. Severity Model

### CRITICAL

A difference that can prevent the application from starting,
connecting to required infrastructure, or operating safely.

Examples:

- Required secret/configuration missing
- Required service missing
- Critical runtime incompatibility

### HIGH

A difference that can materially change application behavior
between environments.

Examples:

- Runtime version mismatch
- Important service missing
- Significant resource/scaling configuration difference

### MEDIUM

A difference that can affect performance, capacity, or operational
behavior but does not necessarily break the application.

Examples:

- Memory limit difference
- CPU limit difference
- Autoscaling limit difference

### LOW

A difference that is potentially useful to know but is unlikely
to cause immediate behavioral problems.

Examples:

- Non-critical environment variable value difference
- Minor configuration difference

### INFO

A difference that is intentionally retained for visibility but
should not be treated as a problem.

---

## 4. Expected Differences

The following differences are not considered drift.

### Project identity

Ignore:

- project.id
- clientId
- generated project identifiers

Reason:

Staging and production are intentionally separate Zerops projects.

### Service identity

Ignore:

- service.id
- projectId

Reason:

Service identifiers are unique to each Zerops project.

### Generated infrastructure values

Ignore initially:

- zeropsSubdomainHost
- zeropsSubdomainString
- public IP addresses
- generated infrastructure URLs

Reason:

These values are environment-specific by design.

### Timestamps

Ignore:

- created
- lastUpdate

Reason:

Different environments naturally have different creation/update times.

### System services

Ignore services where:

isSystem = true

Example:

core

Reason:

These are Zerops-managed system services rather than application
services controlled by the developer.

---

## 5. Environment Variable Rules

Primary source:

GET /project/{projectId}/env-file
with:

userOnly=true

### 5.1 Missing variable

If a variable exists in one environment but not the other:

Default severity: HIGH

Example:

STAGING:
DATABASE_URL=...

PRODUCTION:
missing

Finding:

Required configuration exists in staging but is missing from
production.

---

### 5.2 Variable value mismatch

If the same variable exists in both environments but values differ:

Default severity: LOW

The rule engine may promote the severity when the variable is known
to affect application behavior.

Example:

LOG_LEVEL
staging = debug
production = info

Classification:

LOW

---

### 5.3 Environment identity variables

Variables representing the environment itself should not normally
be treated as drift.

Example:

envType
staging = staging
production = production

Classification:

EXPECTED

---

### 5.4 Secret values

Secret values must never be exposed in findings.

If a sensitive variable differs:

Show:

DATABASE_PASSWORD
staging: configured
production: missing

Do NOT show:

DATABASE_PASSWORD
staging: actual-secret-value

The engine should compare secret presence/state rather than exposing
secret contents.

---

## 6. Service Rules

Services are matched by hostname/name.

Example:

STAGING:

- nodejs
- worker

PRODUCTION:

- nodejs

### 6.1 Service missing

If a user service exists in one environment but not the other:

Default severity: HIGH

Example:

worker exists in staging but is missing from production.

---

### 6.2 System services

Services where:

isSystem = true

must be excluded from application parity comparison.

---

## 7. Runtime Rules

Compare:

- serviceStackTypeId
- serviceStackTypeVersionId
- serviceStackTypeVersionName
- base
- versionNumber

### Runtime version mismatch

Default severity: HIGH

Example:

STAGING:
Node.js 24

PRODUCTION:
Node.js 22

Reason:

Different runtime versions can produce different application behavior,
dependency compatibility, or runtime characteristics.

---

## 8. Resource Rules

Compare resource configuration for corresponding services.

### CPU

Compare:

- min CPU
- max CPU
- start CPU

Default severity:

MEDIUM

---

### Memory

Compare:

- minimum memory
- maximum memory

Default severity:

MEDIUM

---

### Disk

Compare:

- minimum disk
- maximum disk

Default severity:

LOW / MEDIUM

The final severity depends on the magnitude and context of the
difference.

---

### CPU mode

Compare:

- SHARED
- DEDICATED

Default severity:

MEDIUM

Reason:

CPU allocation behavior differs between environments.

---

### Swap

Compare:

- swapEnabled

Default severity:

LOW / MEDIUM

---

## 9. Autoscaling Rules

Compare:

### Horizontal autoscaling

- minContainerCount
- maxContainerCount

### Vertical autoscaling

- minResource
- maxResource
- minFreeResource

### 9.1 Maximum container difference

Example:

STAGING:
maxContainers = 5

PRODUCTION:
maxContainers = 2

Default severity:

MEDIUM

Finding:

Production has a lower horizontal scaling ceiling than staging.

---

### 9.2 Minimum container difference

Example:

STAGING:
minContainers = 2

PRODUCTION:
minContainers = 1

Default severity:

LOW / MEDIUM

---

### 9.3 Autoscaling disabled/configuration absent

If autoscaling configuration exists in one environment but not the
other:

Default severity:

MEDIUM

The finding should explain the behavioral difference rather than
claim that one configuration is incorrect.

---

## 10. Networking Rules

Candidate comparison fields:

- ports
- requestedPorts
- customPortsEnabled
- subdomainAccess

These are included in the normalized snapshot but are not required
for the first version of the drift engine.

Initial severity:

LOW / MEDIUM

Reason:

Networking differences may be intentional depending on the role of
the environment.

---

## 11. Startup Rules

Compare:

startOnProjectStart

Default severity:

LOW

Example:

STAGING:
true

PRODUCTION:
false

Finding:

Service startup behavior differs between environments.

---

## 12. Unknown Differences

If a difference does not match a known rule:

Do NOT silently discard it.

Classify it as:

INFO / UNCLASSIFIED

Example:

Unknown field:
someFutureZeropsConfiguration

The finding should contain:

- field
- staging value/state
- production value/state
- classification: UNCLASSIFIED

This allows new Zerops API capabilities to be discovered without
requiring immediate rule implementation.

---

## 13. Drift Finding Structure

Every meaningful finding should contain:

- category
- service
- field
- staging state/value
- production state/value
- severity
- classification
- explanation

Example:

{
category: "runtime",
service: "nodejs",
field: "versionNumber",
staging: "v24.16.0",
production: "v22.22.3",
severity: "HIGH",
classification: "DRIFT",
explanation: "Runtime versions differ between environments."
}

Sensitive values must be redacted.

---

## 14. Important Principle

The engine must not assume:

"different = wrong"

Instead:

"different → evaluate → classify"

Some differences are:

EXPECTED
↓
ignore

Some are:

MEANINGFUL
↓
report

Some are:

DANGEROUS
↓
report with high severity

Some are:

UNKNOWN
↓
report as unclassified
