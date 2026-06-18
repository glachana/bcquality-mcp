---
bc-version: [all]
domain: performance
keywords: [isempty, existence-check, findfirst, count]
technologies: [al]
countries: [w1]
application-area: [all]
---

# Use IsEmpty for existence checks

## Description
`Record.IsEmpty()` is the cheapest way to check whether a record exists given a filter.

## Best Practice
Use `IsEmpty()` over `FindFirst()` or `Count` when only the boolean answer is needed.

## Anti Pattern
Calling `FindFirst()` and discarding the record just to detect existence wastes I/O.
