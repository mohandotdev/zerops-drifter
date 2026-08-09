# Service Snapshot Specification

## Source

GET /api/rest/public/project/{projectId}/service-stack

## Service Inclusion Rule

Only user services are included.

Services where `isSystem=true` are excluded.

## Identity

- id
- name
- status
- isSystem

## Runtime

- serviceStackTypeInfo.serviceStackTypeName
- serviceStackTypeInfo.serviceStackTypeCategory
- serviceStackTypeInfo.serviceStackTypeVersionName
- serviceStackTypeId
- serviceStackTypeVersionId
- base
- versionNumber

## Startup

- startOnProjectStart

## Autoscaling

### Current

- verticalAutoscaling
  - maxResource
  - minResource
  - minFreeResource
  - cpuMode
  - startCpuCoreCount
  - swapEnabled
- horizontalAutoscaling
  - maxContainerCount
  - minContainerCount

### Custom

- verticalAutoscaling
- horizontalAutoscaling

Both current and custom autoscaling structures are retained
because custom configuration may be null or populated depending
on the service.

## Networking — Candidate

- ports
- requestedPorts
- customPortsEnabled
- subdomainAccess

These are retained as candidate parity dimensions but are not
required for the initial comparison implementation.

## Excluded

- project
- projectId
- userData
- coreService
- timestamps
- generated/internal identifiers
- reloadAvailable
- activeAppVersion
