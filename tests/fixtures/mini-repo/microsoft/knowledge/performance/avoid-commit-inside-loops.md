---
bc-version: [26, 27, 28]
domain: performance
keywords: [commit, loop, transaction]
technologies: [al]
countries: [w1]
application-area: [all]
---

# Avoid Commit inside loops

## Description
Issuing `Commit` inside a loop fragments transactions and pressures the log.

## Best Practice
Hoist the `Commit` after the loop, or remove it entirely if the caller commits.
