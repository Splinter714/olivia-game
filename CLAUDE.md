# CLAUDE.md — Kennel Game

Orientation for working in this repo. The owner is non-technical and won't read
the code, so changes must be verified, not just plausible.

## What it is

A browser game being designed with the owner's daughter Olivia — the game concept
is not yet decided; this repo is currently just the skeleton. Mirrors the sibling
"horse game" and "mech game" projects' architecture: **Phaser 3**, **Vite**, plain
JS (ESM, no TypeScript), all art **procedurally generated at runtime** (no asset
files), data-driven entities, state in **localStorage**. Official name is
**Kennel Game**; deploys to GitHub Pages under base `/olivia-game/` — the repo
slug/npm package name stayed as-is on purpose (renaming those would change the
live deploy URL), only the in-game display name changed.

## Commands

- `npm run dev` — dev server at http://localhost:5173 (used by the Claude preview via `.claude/launch.json`)
- `npm run build` — production build; also the fastest check that all modules resolve
- `npm run deploy` — build + publish to gh-pages. **Only on the owner's explicit go, every time.**

**No automated test suite, by deliberate owner decision** (same call as the horse
and mech games, 2026-07-27): verification is `npm run build` staying clean plus the
owner playing it live. Don't propose reintroducing a test suite; don't write test files.

## Architecture

- `src/main.js` — Phaser config; registers scenes.
- `src/scenes/` — Phaser scenes. Currently only a placeholder `BootScene`.

As the game grows, follow the siblings' layout: `src/data/` for pure game data/logic
(no Phaser), `src/art/` for procedural texture generation, `src/audio/` for
procedural sound, `src/scenes/` for Phaser scenes. Scenes share state via Phaser's
registry and the global event emitter.

## Workflow

Work is tracked as GitHub issues with the owner's standard color-label kanban:
`green` / `yellow` / `red` / `blocked` → `ready for playtest` → closed only after
the owner personally playtests and gives an explicit go. Never use closing keywords
(`closes`/`fixes`) in commits or PRs. See `~/.claude/CLAUDE.md` for the full rules.
