# Environment File Specification

## Source

GET /api/rest/public/project/{projectId}/env-file

## Query Parameters

- overrideEnvIsolation=no
- userOnly=false

## Response

The endpoint returns an object containing an envFile string.

The envFile contains newline-separated KEY=VALUE entries.

## Observed Variables

### User-defined

- PARITY_TEST
- PROJECT_PARITY_TEST

### Zerops-generated / system

- PROJECT_apiCdnUrl
- PROJECT_envIsolation
- PROJECT_envType
- PROJECT_sshIsolation
- PROJECT_staticCdnUrl
- PROJECT_storageCdnUrl
- PROJECT_zeropsSubdomainHost
- PROJECT_zeropsSubdomainString
- apiCdnUrl
- envIsolation
- envType
- sshIsolation
- staticCdnUrl
- storageCdnUrl
- zeropsSubdomainHost
- zeropsSubdomainString

## Important Observations

1. The response is an env-file string rather than structured variables.
2. User-defined variables are returned.
3. PROJECT\_ prefixed variables are also returned.
4. Some values are duplicated across project/service scopes.
5. Some Zerops-generated values are environment-specific.
6. Generated environment identity values should not automatically be treated as drift.
7. The application will need an env-file parser before comparison.
8. `userOnly=true` should be investigated later to determine whether it provides a cleaner user-defined configuration surface.

## Initial Comparison Policy

User-defined configuration:
COMPARE

Environment-specific generated values:
IGNORE or classify using explicit rules

Unknown variables:
COMPARE until explicitly classified

## userOnly=true

The endpoint was tested with:

GET /api/rest/public/project/{projectId}/env-file?overrideEnvIsolation=no&userOnly=true

Observed response:

PARITY_TEST="true"
envType="staging"

### Observation

userOnly=true significantly reduces the environment payload compared
with userOnly=false.

It removes the Zerops-generated variables such as:

- PROJECT_apiCdnUrl
- PROJECT_zeropsSubdomainHost
- PROJECT_zeropsSubdomainString
- apiCdnUrl
- zeropsSubdomainHost
- zeropsSubdomainString

However, envType remains present.

### Initial decision

Use userOnly=true as the primary source for user-relevant
environment parity comparison.

Do not assume every returned variable is manually created by the user.
Variables such as envType require explicit classification rules.
