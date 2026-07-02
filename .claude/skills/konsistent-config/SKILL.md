---
name: konsistent-config
description: >
  Create or modify a konsistent.json configuration file that enforces structural conventions in a TypeScript codebase.
  Use when the user wants to enforce consistent code structure, validate exports/imports across files,
  ensure directories contain required files, enforce naming patterns, add/remove/update convention rules,
  configure case map overrides for acronyms or special casing (kebabToPascalMap, kebabToCamelMap),
  or troubleshoot why konsistent is reporting violations.
  Triggers on: "konsistent", "konsistent.json", "enforce conventions", "structural consistency",
  "consistent exports", "consistent structure", "code conventions config", "add convention",
  "update convention", "fix konsistent errors", "case map", "case override", "acronym casing".
---

# konsistent Configuration

Create or modify a `konsistent.json` file that enforces structural conventions for the project. The `konsistent` CLI checks filesystem structure and TypeScript exports/imports — it is not a style linter.

## Prerequisites

Check if the `konsistent` package is already installed:

- `konsistent` available in root `package.json`
- `node_modules/konsistent` directory exists
- a `konsistent` script exists in `package.json`

If not, the `konsistent` CLI must be installed first. Use the project's package manager. For example, with PNPM:

```bash
pnpm add konsistent --save-dev
```

Then, ensure `package.json` has a `konsistent` script which invokes the `konsistent` CLI. At a minimum:

```
  "scripts": {
    "konsistent": "konsistent"
  }
```

Once the package has been successfully installed, proceed to the primary workflow.

## Workflow

1. Check if `konsistent.json` already exists at the project root.
2. Read `node_modules/konsistent/konsistent.schema.json` to confirm the authoritative shape.
3. Read the relevant docs in `node_modules/konsistent/docs/` (see [References](#references) below) before making changes.
4. If `konsistent.json` exists: read it, then add/remove/update conventions as requested by the user.
5. If `konsistent.json` does not exist: create it at the project root.

Before creating a new config, or if the user has not provided any specific requests for editing an existing config, you must:
- Explore the user's codebase to understand existing structure and naming patterns.
- Refer to `node_modules/konsistent/docs/guides/exploring-codebases.md` for what to look out for.

When modifying an existing config:
- Preserve all conventions not related to the user's request.
- Preserve existing `name`, `description`, and `severity` values unless asked to change them.
- When adding conventions, append to the `conventions` array.
- When the user reports violations, read the existing config and the violating files to determine whether to fix the config or advise fixing the code.

## References

All canonical documentation lives in `node_modules/konsistent/docs/` (published with the package). Read these before authoring config:

- `node_modules/konsistent/docs/reference/configuration.md` — top-level `konsistent.json` shape (version, conventions, severity, excludeFiles).
- `node_modules/konsistent/docs/reference/predicates.md` — every `must` predicate (`haveType`, `haveFiles`, `export`, `exportTypes`, `exportConstants`, `exportFunctions`, `exportInterfaces`, `exportClasses`, `import`, `importTypes`).
- `node_modules/konsistent/docs/reference/path-patterns.md` — globs, placeholders, case transformations (`toPascalCase`, `toCamelCase`, `toFlatCase`, `toNthSegment`, `extract`, …), negation.
- `node_modules/konsistent/docs/reference/constraints.md` — `matches`, `segments` for inline path constraints and `if.placeholderSatisfies`.
- `node_modules/konsistent/docs/reference/conditional-rules.md` — `if` / `for` / `excludeFiles` blocks when `must` is an array.
- `node_modules/konsistent/docs/reference/case-maps.md` — `kebabToPascalMap`, `kebabToCamelMap` for acronyms and special casing.
- `node_modules/konsistent/docs/guides/examples.md` — copy-pasteable common patterns (provider packages, factories, adapters, conditional rules, …).
- `node_modules/konsistent/docs/guides/exploring-codebases.md` — pattern-identification approach before writing rules.

If `node_modules/konsistent/docs/` is not present (e.g. the project doesn't have `konsistent` installed yet), fall back to the published docs at https://github.com/vercel-labs/konsistent/tree/main/docs.

## Guidelines

- Explore the user's project first — understand actual directory structure, naming conventions, and patterns before writing rules.
- Use `severity: "warning"` for conventions that are recommended but not mandatory.
- Use `name` on conventions to give them identifiable IDs (must be kebab-case).
- Use `description` when the convention name alone isn't self-explanatory.
- Prefer templates with case transformations over hardcoded names — this is konsistent's key strength.
- Group related predicates in one convention when they apply to the same path.
- Use separate conventions for the same path when different severities are needed.
- Use path negation to exclude known exceptions rather than listing all included paths.
- Consider conventions between related files as well, not only within a single file. Use the `haveFiles` predicate to ensure a specific other file exists based on the matched file, and use `for.files` to enforce conventions within specific other related files based on the matched file.
- Validate the generated config by running `konsistent validate` via the `package.json` script (e.g. `pnpm konsistent validate`).
- Test the config against the actual codebase by running `konsistent` via the `package.json` script (with no arguments).

**Important reminder:** The objective is NOT to write a `konsistent.json` file that leads to zero errors when running the CLI. That would defeat the purpose. The objective is to create a konsistent.json file that identifies violations to patterns used in the codebase, even if they are not being 100% adhered to.
