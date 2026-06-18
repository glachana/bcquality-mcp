---
bc-version: [all]
domain: performance
keywords: [isempty, acme-override]
technologies: [al]
countries: [w1]
application-area: [all]
---

# Use IsEmpty (Acme Corp override)

## Description
Custom-layer example showing how an organization can override the Microsoft rule
with its own internal standard. This file is part of the fixtures used by the
test suite to verify layer precedence (custom > community > microsoft).

## Best Practice
Always prefer IsEmpty over FindFirst when only checking existence.
