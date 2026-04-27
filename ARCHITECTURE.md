# yophon-board Architecture

This project is intentionally small, but feature work should land in clear layers instead of growing the entry files.

## Backend

- `src/index.ts`: application composition, routes, and server startup.
- `src/db.ts`: SQLite schema and persistence operations.
- `src/config.ts`: environment-derived configuration and shared runtime constants.
- `src/http.ts`: request helpers, cookie helpers, parsers, and public response serializers.
- `src/stroke.ts`: server-side stroke validation and normalization.
- `src/rateLimit.ts`: reusable in-memory sliding-window limiter.
- `src/wsHub.ts`: board-scoped WebSocket client registry and broadcast fan-out.
- `src/staticFiles.ts`: production static asset serving.

Add new backend features by starting from the domain boundary:

- New persisted concept: add schema and data operations in `db.ts`, then expose it through `index.ts` routes.
- New request policy: add parsing or cookie helpers in `http.ts`.
- New realtime event: add write behavior in the route, then broadcast through `BoardHub`.
- New validation rule for drawings: keep it in `stroke.ts` so clients and routes stay thin.

The current realtime model is single-process. If the app moves to multiple instances, `BoardHub` and `SlidingWindowRateLimiter` are the replacement points for Redis, pub/sub, or another shared runtime.

## Frontend

- `frontend/src/components/WhiteboardCanvas.vue`: UI wiring, pointer gestures, canvas rendering, and user commands.
- `frontend/src/whiteboard/types.ts`: shared whiteboard domain types.
- `frontend/src/whiteboard/strokeModel.ts`: stroke parsing, simplification, serialization, and saved-row application.
- `frontend/src/whiteboard/pendingStorage.ts`: localStorage-backed unsaved stroke recovery.
- `frontend/src/composables/useApi.ts`: JSON API wrapper.
- `frontend/src/stores/auth.ts`: admin auth state.

Add new frontend features by choosing the smallest stable layer:

- New stroke fields or drawing modes: update `types.ts`, `strokeModel.ts`, backend `stroke.ts`, then the canvas controls.
- New offline behavior: extend `pendingStorage.ts`.
- New board/page metadata: keep API calls near the component first; promote to a composable once more than one view needs it.
- New rendering feature such as layers, selections, or imported assets: introduce a whiteboard module before adding more state to `WhiteboardCanvas.vue`.

## Current Tradeoffs

- There is no test suite yet; type checking and production build are the current guardrails.
- The frontend renderer is still inside `WhiteboardCanvas.vue` because it is tightly coupled to DOM canvas refs and pointer state. Split it next if rendering features grow.
- Public boards are create-on-read. If board permissions are added, make board creation an explicit admin action before adding private visibility rules.
