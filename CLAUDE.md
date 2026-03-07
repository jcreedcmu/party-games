# Project Guidelines

## Debugging

When you need to write a quick test or debug script, create a file in `scripts/` (e.g. `scripts/debug-ws.ts`) rather than using inline Node.js one-liners. This keeps debug scripts readable, editable, and rerunnable.

## Checklists

When completing a step of a plan that has a ASCII checkbox next to it,
("[ ]") modify the plan file by "checking the checkbox" ("[x]").

## Style Preferences

- **Functional style**: Prefer types and functions over classes and interfaces. Use `type` instead of `interface` for defining object shapes. Use plain functions (not methods on classes) for behavior.
- Avoid the `interface` keyword in TypeScript.
- Avoid `any` and `unknown` types unless there is a very clear, well-motivated reason. Prefer discriminated unions and type narrowing instead.
