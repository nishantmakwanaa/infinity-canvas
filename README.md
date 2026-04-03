# CNVS - Infinite Canvas Workspace

CNVS is a collaborative, page-based infinite canvas for organizing notes, links, todos, media, and sketches in one visual workspace.

It supports:
- Owner routes: `/:username/:canvasName/:pageName`
- Shared routes: `/:username/view/:canvasName/:pageName`
- Legacy token shares: `/view/:token`

The app is built with React + TypeScript + Vite and uses Supabase for auth, persistence, routing helpers, and sharing.

## Core Features

- Infinite canvas with pan/zoom
- Blocks: note, link, todo, media
- Drawing tools: pencil, eraser, text, shape, line, arrow
- Multiple pages inside a canvas group (`canvas-slug/page-x.cnvs`)
- Per-page and per-canvas rename support
- Owner + shared route resolution through Supabase RPC
- Keyboard shortcuts (Alt+Shift based)
- Mobile-specific selector UX (overflow + settings trigger)
- Export/import (`.cnvs`, PNG, SVG)
- Offline-friendly guest snapshot and autosave behavior

## Tech Stack

- Frontend: React 18, TypeScript, Vite 5
- State: Zustand
- Data fetching/cache: TanStack Query
- Backend: Supabase (Auth, Postgres, RLS, RPC)
- Styling/UI: Tailwind CSS, Radix UI, Lucide icons, Sonner
- Testing: Vitest, Testing Library, Playwright

## Project Structure

- `src/pages`: route-level screens (`Index`, `SharedCanvas`, etc.)
- `src/components/canvas`: canvas UI (toolbar, header, sidebar, drawing layer)
- `src/hooks`: auth, realtime, canvas sync, responsive hooks
- `src/store`: Zustand canvas store
- `src/lib`: utilities (naming, export, sizing, i18n)
- `supabase/migrations`: SQL schema, RPC functions, and policies

## Prerequisites

- Node.js 18+
- npm 9+
- A Supabase project

## Environment Variables

Create a `.env` file in the project root:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_ANON_KEY
# Optional OAuth redirect override
VITE_AUTH_REDIRECT_TO=http://localhost:8080/
```

## Install & Run

```bash
npm install
npm run dev
```

Default dev server: `http://localhost:8080`

## Scripts

- `npm run dev`: start Vite dev server
- `npm run dev:restart`: restart-on-change dev command
- `npm run build`: production build
- `npm run build:dev`: build in development mode
- `npm run preview`: preview production build locally
- `npm run lint`: lint project
- `npm run test`: run unit tests once
- `npm run test:watch`: watch mode tests

## Supabase Setup

Apply migration SQL from:

- `supabase/migrations/migration.sql`

This migration includes:
- `canvases` and `shared_canvases` tables
- Route field sync triggers
- Owner and shared route resolver RPC functions
- Row-level security policies

## Routing Model

Canvas names are persisted as:

`<canvas-slug>/<page-slug>`

Examples:
- `sat-23-30/page-1.cnvs`
- `project-alpha/page-3.cnvs`

Display labels are formatted for UI, while routes remain slug-based.

## Keyboard Shortcuts

CNVS uses `Alt + Shift` combinations to avoid default browser conflicts.

Examples:
- `Alt+Shift+Z`: Undo
- `Alt+Shift+Y`: Redo
- `Alt+Shift+C`: Copy selected block(s)
- `Alt+Shift+K`: Cut selected block(s)
- `Alt+Shift+Delete`: Delete selected block(s)

Open in-app shortcut help from the top-right menu.

## Sidebar Delete Mode

Delete mode in the sidebar supports page-level deletion.

- You can delete a specific page from a canvas group.
- You can also select all pages of a canvas group and remove them together.

## Performance Notes

Recent optimizations include:

- Adaptive autosave debounce for slower networks/devices
- Skip-unchanged payload writes to reduce unnecessary Supabase updates
- Vite manual chunk splitting for better long-term caching
- Reduced production build overhead (no sourcemaps, compressed size reporting off)

These changes improve low-bandwidth behavior and responsiveness on lower-end devices.

## Authentication Model

- Routing ownership uses `username` derived from email local-part (stable and unchanged)
- UI profile menu shows OAuth display name (first + last name when available)

This keeps route architecture stable while improving visible profile UX.

## Deployment

1. Set production env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`)
2. Build:

```bash
npm run build
```

3. Deploy `dist/` to your static host (Vercel, Netlify, Cloudflare Pages, etc.)

## License

Private/internal project unless otherwise specified by repository owner.
