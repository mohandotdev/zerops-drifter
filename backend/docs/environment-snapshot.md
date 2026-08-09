# Environment Snapshot Specification

## Source

GET /api/rest/public/client/{clientId}/project

## Purpose

Provides project-level identity and configuration metadata
used to construct a Zerops environment snapshot.

## Project Fields

| Field                        | Include   | Reason                              |
| ---------------------------- | --------- | ----------------------------------- |
| id                           | Yes       | Project identity                    |
| clientId                     | Yes       | Client relationship                 |
| name                         | Yes       | Human-readable environment identity |
| mode                         | Yes       | Project configuration               |
| status                       | Yes       | Project state                       |
| autoStartup                  | Yes       | Potential operational configuration |
| primaryInstanceLocation.id   | Candidate | Environment location                |
| primaryInstanceLocation.name | Candidate | Human-readable location             |

## Excluded Fields

Generated infrastructure identifiers, IP addresses,
URLs, timestamps, access roles, and other metadata are
excluded from the initial parity comparison.

## Example Environments

Production:

- id: XUhhqDkAT2WOEIRNB8OBvw
- name: zerops-drift-production
- mode: LIGHT
- status: ACTIVE

Staging:

- id: elq3Bx61R3OMdSUHH2lm7w
- name: zerops-drift-staging
- mode: LIGHT
- status: ACTIVE
