# yophon-board Architecture

This project is intentionally small, but feature work should land in clear layers instead of growing the entry files.

Product terminology uses **projects**. Internally, the current persistence table is still named `boards`; one project maps to one multi-page whiteboard. The `/api/boards/*` routes remain as compatibility aliases — they are registered from the same handlers as `/api/projects/*` (see `BOARD_API_PREFIXES`), so there is exactly one implementation per operation. New frontend work should use `/api/projects/*`.

## Shared wire types

`shared/types.ts` holds every type serialized over REST or WebSocket (`PublicStrokeRow`, `PublicBoard`, `UploadedAsset`, `BoardWsMessage`). Both `src/` and `frontend/src/` import from it; never redefine a wire shape on one side only.

## Backend

- `src/index.ts`: thin composition root — error handler, plugin registration, `Bun.serve()` with WebSocket upgrade, static fallback, request logging.
- `src/routes/projects.ts`: project/page/stroke/erase/clear routes (registered under both API prefixes).
- `src/routes/assets.ts`: upload + asset serving routes.
- `src/routes/auth.ts`: login/logout/password/permission routes and `/api/admin/stats`.
- `src/db/index.ts`: SQLite init, versioned migrations (`schema_migrations`), seeds; re-exports the per-domain helpers.
- `src/db/boards.ts`, `src/db/strokes.ts`, `src/db/sessions.ts`: per-domain CRUD. Multi-step writes (`createStroke`, `updateStroke`, `deleteStrokes`) run inside transactions; `createStroke` is idempotent on `UNIQUE(board_id, client_id, local_id)`.
- `src/errors.ts`: `AppError(status, userMessage)` — throw it from any layer; the global `onError` turns it into `{ error }` JSON. Unknown errors log and return a generic 500.
- `src/config.ts`: environment-derived configuration and shared runtime constants.
- `src/assets.ts`: uploaded asset validation (mime whitelist + magic-byte check), storage, and serving.
- `src/http.ts`: request helpers, cookie helpers, parsers, and public response serializers (typed by `shared/types.ts`).
- `src/stroke.ts`: server-side stroke validation and normalization.
- `src/rateLimit.ts`: reusable in-memory sliding-window limiter.
- `src/wsHub.ts`: project-scoped WebSocket client registry and broadcast fan-out (messages typed as `BoardWsMessage`).
- `src/staticFiles.ts`: production static asset serving.

Add new backend features by starting from the domain boundary:

- New persisted concept: add schema as a new migration in `src/db/index.ts`, data operations in a `src/db/<domain>.ts`, then expose it through a route module.
- New request policy: add parsing or cookie helpers in `http.ts`.
- New realtime event: add the variant to `BoardWsMessage` in `shared/types.ts`, write in the route, broadcast through `BoardHub`.
- New validation rule for drawings: keep it in `stroke.ts` so clients and routes stay thin.
- New user-facing failure: throw `AppError` — never a bare string-coded `Error`.

The current realtime model is single-process. If the app moves to multiple instances, `BoardHub` and `SlidingWindowRateLimiter` are the replacement points for Redis, pub/sub, or another shared runtime.

## Frontend

`WhiteboardCanvas.vue` is the wiring layer: template, tool state, pointer-event dispatch, and UI commands. The risky state machines live in composables:

- `composables/useWhiteboardPersist.ts`: every API write and its failure handling — stroke creation with backoff retry and a per-page localStorage mirror, PATCH coalescing (a transform made while a save is in flight is queued, never dropped; server echoes never clobber newer local edits), erase queues that retry instead of reverting, and discard bookkeeping so an undone/erased pending stroke is deleted server-side once its POST lands.
- `composables/useWhiteboardSync.ts`: applies server state (WebSocket messages + full/incremental loads) to the board. All conflict policy lives here: elements with unsynced local edits are never clobbered by remote rows; discarded ids are never resurrected.
- `composables/useWhiteboardSelection.ts`: selection state plus the three pointer interactions on it — group transform, mind-map node drag, box select. Gestures snapshot their start state, so Escape cancels losslessly.
- `composables/useWhiteboardHistory.ts`: local undo stack for created elements.
- `composables/useWhiteboardSocket.ts`: WebSocket connect/reconnect lifecycle.
- `composables/useWhiteboardFullscreen.ts`: web/native fullscreen state machine.
- `composables/useWhiteboardViewport.ts`: pan + zoom state, screen↔world conversions.
- `composables/useWhiteboardTextEditor.ts`: inline text editor open/type/style/commit/cancel.
- `composables/useApi.ts`: JSON API wrapper; throws `ApiError(status, message)` with the server-provided error text.
- `whiteboard/*`: pure modules — `types.ts` (domain types; wire types re-exported from `shared/types.ts`), `strokeModel.ts`, `pendingStorage.ts` (per-page unsaved-stroke mirror), `renderer.ts`, `geometry.ts`, `selection.ts`, `eraser.ts`, `textLayout.ts`, `mindmap.ts`, `pdfRenderer.ts`.
- `stores/auth.ts`: admin auth state.

Rendering: all repaints go through a single rAF-coalesced `requestRender()`. While a pen/mask-eraser stroke is in progress the static scene is cached in an offscreen canvas and only the live stroke is drawn per frame; `notifyStrokesChanged()` invalidates that cache. The mini-map repaints at most ~6 fps.

Add new frontend features by choosing the smallest stable layer:

- New stroke fields or drawing modes: update `whiteboard/types.ts`, `strokeModel.ts`, backend `stroke.ts`, then the canvas controls.
- New persistence behavior (retries, offline, conflict policy): `useWhiteboardPersist` / `useWhiteboardSync`, not the component.
- New selection interaction: `useWhiteboardSelection`.
- New rendering feature: start in `renderer.ts` or a sibling whiteboard module; route repaints through `requestRender` / `notifyStrokesChanged`.
- New text behavior: keep canvas drawing and measurement in `textLayout.ts`/`renderer.ts`; keep only editor state and DOM focus handling in the component.

## Tests

`bun test` from the repo root runs both suites:

- `tests/`: backend — stroke validation, db idempotency/transactions/migrations, rate limiter, upload magic-byte checks. Uses `:memory:`/mkdtemp databases, never `data/`.
- `frontend/tests/`: pure whiteboard modules — geometry, eraser cutting, selection/transform math, stroke model parsing, pending-storage page merging, text layout.

Composables and the canvas component are not unit-tested; type checking (`bun run type-check`) and the production build are their guardrails.

## Current Tradeoffs

- WebSocket connections are unauthenticated by design (boards are public). If private boards are added, gate the upgrade in `src/index.ts` and make project creation an explicit admin action before adding visibility rules.
- Project reads still create missing records for legacy shared links.
- The localStorage pending mirror is keyed per board slug; switching boards in the same browser keeps only the most recent board's backlog.
