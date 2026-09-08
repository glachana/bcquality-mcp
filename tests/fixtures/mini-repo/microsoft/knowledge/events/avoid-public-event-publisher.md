---
bc-version: [26..]
domain: events
keywords: [event, publisher, public, integration]
technologies: [al]
countries: [w1]
application-area: [all]
---

# Avoid a public event publisher

## Description
A `Public` event publisher exposes the publishing object's internals as part of the
extension contract, so any later change to the object becomes a breaking change.

## Best Practice
Publish an `IntegrationEvent` (or a `BusinessEvent` for cross-app contracts) and keep
the publishing object internal.
