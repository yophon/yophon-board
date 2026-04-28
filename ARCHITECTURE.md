# yophon-board Architecture

This project is intentionally small, but feature work should land in clear layers instead of growing the entry files.

Product terminology uses **projects**. Internally, the current persistence table is still named `boards`; one project maps to one multi-page whiteboard. The `/api/boards/*` routes remain as compatibility aliases, while new frontend work should use `/api/projects/*`.

## Backend

- `src/index.ts`: application composition, routes, and server startup.
- `src/db.ts`: SQLite schema and persistence operations.
- `src/config.ts`: environment-derived configuration and shared runtime constants.
- `src/assets.ts`: uploaded image asset validation, storage, and serving.
- `src/http.ts`: request helpers, cookie helpers, parsers, and public response serializers.
- `src/stroke.ts`: server-side stroke validation and normalization.
- `src/rateLimit.ts`: reusable in-memory sliding-window limiter.
- `src/wsHub.ts`: project-scoped WebSocket client registry and broadcast fan-out.
- `src/staticFiles.ts`: production static asset serving.

Add new backend features by starting from the domain boundary:

- New persisted concept: add schema and data operations in `db.ts`, then expose it through project routes in `index.ts`.
- New request policy: add parsing or cookie helpers in `http.ts`.
- New realtime event: add write behavior in the route, then broadcast through `BoardHub`.
- New validation rule for drawings: keep it in `stroke.ts` so clients and routes stay thin.

The current realtime model is single-process. If the app moves to multiple instances, `BoardHub` and `SlidingWindowRateLimiter` are the replacement points for Redis, pub/sub, or another shared runtime.

## Frontend

- `frontend/src/components/WhiteboardCanvas.vue`: UI wiring, pointer gestures, canvas rendering, and user commands.
- `frontend/src/whiteboard/types.ts`: shared whiteboard domain types.
- `frontend/src/whiteboard/strokeModel.ts`: stroke parsing, simplification, serialization, and saved-row application.
- `frontend/src/whiteboard/pendingStorage.ts`: localStorage-backed unsaved stroke recovery.
- `frontend/src/whiteboard/renderer.ts`: canvas rendering for drawing strokes, image elements, and text elements.
- `frontend/src/whiteboard/geometry.ts`: pure point, segment, rotation, and angle helpers.
- `frontend/src/whiteboard/selection.ts`: element keys, hit-testing, selection bounds, box selection, and transform math.
- `frontend/src/whiteboard/eraser.ts`: pure eraser hit-testing and vector cut logic.
- `frontend/src/whiteboard/textLayout.ts`: text font constants, wrapping, measurement, and style normalization helpers.
- `frontend/src/composables/useApi.ts`: JSON API wrapper.
- `frontend/src/stores/auth.ts`: admin auth state.

Add new frontend features by choosing the smallest stable layer:

- New stroke fields or drawing modes: update `types.ts`, `strokeModel.ts`, backend `stroke.ts`, then the canvas controls.
- New imported assets or element transforms: keep file storage in `assets.ts`; persist only small element metadata and transformed stroke data through the existing drawing save path.
- New offline behavior: extend `pendingStorage.ts`.
- New project/page metadata: keep API calls near the component first; promote to a composable once more than one view needs it.
- New rendering feature such as layers, selections, or imported assets: start in `renderer.ts` or a sibling whiteboard module before adding more state to `WhiteboardCanvas.vue`.
- New text behavior: keep canvas drawing and measurement in `textLayout.ts`/`renderer.ts`; keep only editor state and DOM focus handling in `WhiteboardCanvas.vue`.

## Current Tradeoffs

- There is no test suite yet; type checking and production build are the current guardrails.
- `WhiteboardCanvas.vue` still owns pointer state, editor focus state, persistence calls, and command wiring. Rendering, text layout, geometry, eraser internals, and selection/transform math have been split into whiteboard modules.
- Project reads still create missing records for legacy shared links. If project permissions are added, make project creation an explicit admin action before adding private visibility rules.
