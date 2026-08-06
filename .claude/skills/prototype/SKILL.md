---
name: prototype
description: Create three isolated, product-native UI variants behind a visual picker, then wait for a human to choose before integrating one. Use only when explicitly invoked for UI exploration.
disable-model-invocation: true
---

# Prototype UI Variants

Use this skill to explore one UI decision without turning the first generated design into production code. The default output is three genuinely different, working variants shown one at a time in realistic context.

This workflow is adapted for Inbox Zero from Emil Kowalski's MIT-licensed [`prototype` skill](https://github.com/emilkowalski/skills/tree/de33dbed000212b54400a33767d1e4d03654db2a/skills/prototype).

## Non-negotiable rules

1. Read `AGENTS.md`, `.claude/skills/ui-components/SKILL.md`, and the nearest relevant code before designing.
2. Explore one component, interaction, or bounded screen section per run. Narrow broader requests to the highest-leverage decision.
3. Keep exploration out of production paths. Create an isolated route under `apps/web/app/prototypes/<slug>/` that production code does not import.
4. Reuse the existing Tailwind tokens, typography, icons, and Shadcn components. Do not hand-roll a control that already exists in `apps/web/components/ui/`.
5. Do not add a package, change product behavior, connect real user data, or mutate production data for a prototype.
6. Build three meaningfully different directions by default. Color or copy changes alone do not make a new direction.
7. Stop after presenting the variants. Production integration requires the user's explicit selection.
8. When a direction is promoted, re-check it against project conventions and delete the prototype route unless the user explicitly asks to keep it.

## Workflow

### 1. Scope the decision

Restate the brief in one sentence: what is being designed, where it would live, and what it must help the user do. Use realistic but synthetic Inbox Zero-shaped content; never place customer data, email content, or production screenshots in the prototype.

### 2. Recon the product

Inspect the production surface and record:

- the components and layout shell it already uses;
- spacing, radii, colors, typography, and responsive breakpoints;
- loading, empty, error, hover, focus, disabled, and reduced-motion conventions;
- the frequency and importance of the interaction.

Prefer extending established patterns over introducing a second design system. If the production surface has no coherent pattern, state that constraint rather than inventing a hidden dependency.

### 3. Name three directions

Before coding, provide a short table:

| Direction | Axis | Why it is meaningfully different | Tradeoff |
| --- | --- | --- | --- |
| Quiet | density and hierarchy | prioritizes repeated daily use | less visually distinctive |
| Guided | progressive disclosure | explains the next action | uses more vertical space |
| Direct | interaction model | puts the primary action inline | exposes more controls |

Names and axes should fit the actual brief. Each direction must be defensible on its own and preserve the same required functionality.

### 4. Build an isolated picker

Create one file per variant plus a small harness in `apps/web/app/prototypes/<slug>/`. Render exactly one variant at full size in realistic surrounding context.

The picker must:

- display the direction names, not `A/B/C`;
- switch instantly by click, number keys `1`–`3`, and left/right arrows;
- store the selected direction in a query parameter so a review link is stable;
- expose clear focus states, `aria-current`, and an accessible label;
- avoid covering the UI under review;
- remain visually neutral and separate from the candidate designs.

Switching variants should not animate. Motion inside a variant must have a purpose, respect `prefers-reduced-motion`, and avoid delaying high-frequency actions.

### 5. Verify before handoff

Follow `AGENTS.md` for commands; do not start a dev server or build unless the user explicitly asks. With an existing local or cloud environment, use the browser tooling to inspect every direction at desktop and mobile widths.

At minimum verify:

- every variant renders without console errors;
- interactive controls work with pointer and keyboard;
- content does not overflow at mobile width or browser zoom;
- focus, loading, empty, error, disabled, and reduced-motion states are represented when relevant;
- the implementation uses the existing Shadcn primitives and project typography instead of mockup-only CSS substitutes.

Run `git diff --check` and a proportionate lint or test command for touched code.

### 6. Present and stop

Report the route, switching controls, verification performed, and this decision table:

| Direction | Best when | Cost |
| --- | --- | --- |
| Name | specific product condition | honest tradeoff |

Do not recommend a winner unless asked. If asked, ground the recommendation in product frequency, accessibility, clarity, and maintenance cost rather than novelty.

### 7. Promote only after selection

After the user chooses:

1. integrate that direction into the real surface using existing components and file structure;
2. remove prototype-only styles, synthetic data, and picker code from the production implementation;
3. run the relevant tests and browser checks;
4. delete `apps/web/app/prototypes/<slug>/` unless retention was explicitly requested;
5. summarize what changed and what signal should determine whether the production UI is successful.
