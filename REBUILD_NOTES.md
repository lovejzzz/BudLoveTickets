# Bud Love Tickets Rebuild Notes

## What changed
- Rebuilt `index.html` into a cleaner kanban app focused on ticket workflow.
- Preserved ticket schema compatibility: `{id,title,desc,status,priority,created}`.
- Preserved status columns: `todo`, `doing`, `done`.
- Preserved create/edit/delete and status movement (drag/drop + ◀ ▶ buttons).
- Kept API contract with `PUT /api/tickets` sending `{ tickets: [...] }`.
- Added local fallback (localStorage backup) if API is unavailable.

## SVG filter ideas from video applied
- **Chromatic title split** (`#rgbSplit`) using channel-separated offset + blend.
- **Card displacement warp** (`#cardWarp`) using `feTurbulence + feDisplacementMap` on hover.
- Built as filter graphs so effects are composable and easy to tune.

## Accessibility & performance
- Effects are subtle and only on key surfaces.
- `prefers-reduced-motion: reduce` disables effect transitions and filters.
- No additional npm dependencies.

## Files changed
- `index.html` (full rebuild)
- `REBUILD_NOTES.md` (this file)

## Known limitation
- Current `/api/tickets.js` blob ID appears invalid in this environment (`Blob not found`), so app may run in local backup mode until blob ID is updated.
