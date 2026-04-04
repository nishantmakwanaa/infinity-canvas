# CNVS - Infinite Canvas Workspace

CNVS is a collaborative, page-based infinite canvas for organizing notes, links, todos, media, and sketches in one visual workspace.
It is positioned as an alternative and competitor to tldraw.com for teams that want persistent, permissioned, page-aware canvases backed by Supabase.

It supports:
- Tokenized page API routes ending in `.page`
- Owner and share links through compact URL-safe tokens
- Public share permission modes: `viewer` and `editor`

The app is built with React + TypeScript + Vite and uses Supabase for auth, persistence, routing helpers, and sharing.

## Core Features

- Infinite canvas with pan/zoom
- Blocks: note, link, todo, media
- Drawing tools: pencil, eraser, text, shape, line, arrow
- Multiple pages inside a canvas group (`canvas-slug/page-x.cnvs`)
- Per-page and per-canvas rename support
- Owner + shared route resolution through Supabase RPC
- Share popover in header (menu-style, not centered modal)
- Publish as viewer/editor for signed-in users with link
- On-demand branded auth dialog for guests (logo, app name, description, Google sign-in)
- Edit-share links are hard-gated until login (no background canvas access before auth)
- Live collaborator presence list (users icon near share)
- Per-collaborator eye toggle to show/hide incoming live changes
- Realtime collaboration snapshots over Supabase Realtime channels
- Keyboard shortcuts (Alt+Shift based)
- Mobile-specific selector UX (overflow + settings trigger)
- Export/import (`.cnvs`, PNG, SVG)
- Offline-friendly guest snapshot and autosave behavior

## Product Positioning (SEO Copy)

CNVS is a collaborative infinite whiteboard app for individuals and teams who need a practical alternative to tldraw.com.

- Build persistent knowledge canvases (not just temporary sketches)
- Organize work into page-based canvas groups
- Share with viewer/editor permissions
- Collaborate live with presence and activity controls
- Mix notes, links, todos, media, and freehand drawing in one workspace

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
# Optional: only set if you want dedicated Socket.IO transport.
VITE_SOCKET_SERVER_URL=http://localhost:3400
# Optional OAuth redirect override
VITE_AUTH_REDIRECT_TO=http://localhost:8080/
```

## Install & Run

```bash
npm install
npm run dev
```

Optional dedicated socket transport (local):

```bash
npm run socket:dev
```

Default dev server: `http://localhost:8080`

## Scripts

- `npm run dev`: start Vite dev server
- `npm run dev:all`: start Socket.IO server + Vite together (single local command)
- `npm run socket:dev`: start Socket.IO collaboration server
- `npm run dev:restart`: restart-on-change dev command
- `npm run build`: production build
- `npm run build:dev`: build in development mode
- `npm run preview`: preview production build locally
- `npm run lint`: lint project
- `npm run test`: run unit tests once
- `npm run test:watch`: watch mode tests
- `npm run loadtest`: run all core load scenarios (RPC open-page + draw burst + autosave flush)
- `npm run loadtest:open`: run resolver/open-page load scenario only
- `npm run loadtest:draw`: run drawing write burst scenario only
- `npm run loadtest:autosave`: run autosave flush write scenario only

## Performance Telemetry

Lightweight client telemetry is now built in for production diagnostics:

- Render commit timing markers (`render_commit`)
- Dropped-frame markers from RAF loop (`dropped_frame`)
- Autosave flush telemetry (`autosave_flush_success`, `autosave_flush_error`, `autosave_flush_batch`)

Telemetry is stored in-memory at `window.__cnvsPerf.events`.

Optional console logging:

```js
localStorage.setItem('cnvs_perf_console', '1')
```

Disable verbose logging:

```js
localStorage.removeItem('cnvs_perf_console')
```

## Live Collaboration

CNVS now supports live, multi-user collaboration for shared canvases.

- Share button opens an anchored menu similar to the top-right 3-dot menu.
- Owners can publish access mode:
	- `Anyone can view`: link opens read-only mode.
	- `Anyone can edit`: signed-in users with link can edit live.
- When editor mode is enabled, a users icon appears near the share button.
- Clicking users icon opens a live collaborators menu:
	- Active users list with avatar/name/tool.
	- Eye-on: include that user live updates.
	- Eye-off: ignore that user live updates (focus on your own changes).

Realtime behavior:

- Transport fallback: if `VITE_SOCKET_SERVER_URL` is unset, app uses Supabase Realtime (single-host friendly for Vercel).
- Socket.IO websocket transport for cursor, viewport, and snapshot sync when configured.
- Presence heartbeat + tool/pan/zoom metadata sync.
- Client-side cursor interpolation (timestamp lerp) for smoother motion on unstable networks.
- Throttled canvas snapshot broadcast for low-latency collaboration.
- Snapshot request/response on join so late joiners receive latest canvas state immediately.
- Automatic Socket.IO reconnect with backoff.
- Strict server-side cap of 20 concurrent editors per editable shared canvas.
- Shared editor users can persist updates through Supabase RLS policy.

Socket server:

- File: `socket-server/server.mjs`
- Default port: `3400` (`SOCKET_PORT` overrides)
- CORS: `SOCKET_CORS_ORIGIN` (comma-separated origins or `*`)

## Load Test Configuration

Load tests are designed for pre-release throughput checks on a dedicated test canvas.

Required env vars:

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
LOADTEST_USER_TOKEN=<userToken from URL>
LOADTEST_CANVAS_TOKEN=<canvasToken from URL>
LOADTEST_PAGE_TOKEN=<pageToken from URL>
```

For mutation scenarios (`draw`, `autosave`, or `all`):

```bash
LOADTEST_ALLOW_MUTATIONS=1
LOADTEST_CANVAS_ID=<test-canvas-uuid>
# Optional: extra owner filter
LOADTEST_OWNER_USER_ID=<owner-user-uuid>
```

Optional tuning:

```bash
LOADTEST_ITERATIONS=240
LOADTEST_CONCURRENCY=16
LOADTEST_DRAW_POINTS=24
LOADTEST_AUTOSAVE_BURST=10
```

## Supabase Setup

Apply migration SQL from:

- `supabase/migrations/migration.sql`

This migration includes:
- `canvases` and `shared_canvases` tables
- `canvas_editor_sessions` table for editor slot tracking
- Route field sync triggers
- Owner and shared route resolver RPC functions
- Share permission RPC (`upsert_canvas_share`)
- Editor-slot RPCs (`claim_editor_slot`, `release_editor_slot`) with hard limit enforcement
- Share editor/viewer access control (`shared_canvases.access_level`)
- Shared editor update policy for collaborative persistence
- Auth hardening for direct table reads (anon select revoked from `canvases` and `shared_canvases`)
- Compact token decode + high-volume lookup indexes
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
- Guests opening the app home route can use guest canvas directly; clicking `Sign in to share` opens the CNVS auth dialog
- Guests opening edit-share links (`se` token routes) are blocked on the auth dialog until login
- Edit permissions for shared links still require access resolution through `open_page_api_link`

This keeps route architecture stable while improving visible profile UX.

## Deployment

1. Set production env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`)
2. Build:

```bash
npm run build
```

3. Deploy `dist/` to your static host (Vercel, Netlify, Cloudflare Pages, etc.)

Important for tokenized routes and shared links:

- This project must use SPA fallback rewrites so deep links (for example `/:pageToken?...`) serve `index.html`.
- Included in repo:
	- `vercel.json` rewrite config for Vercel
	- `public/_redirects` for Netlify/Cloudflare-style static hosts

## License

Private/internal project unless otherwise specified by repository owner.
