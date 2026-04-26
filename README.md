# yophon-board

Standalone realtime whiteboard extracted from `yophon-blog`.

## Features

- Infinite-ish pan and zoom canvas
- Pen, eraser, undo, minimap, page navigation
- HTTP writes with WebSocket fan-out
- SQLite persistence
- Idempotent stroke saves via `(board_id, client_id, local_id)`
- Admin login for clearing a board page

## Run

```bash
bun install
cd frontend && bun install
```

Development:

```bash
# terminal 1
BOARD_ADMIN_PASSWORD=change-me bun run dev

# terminal 2
cd frontend && bun run dev
```

Production:

```bash
cp .env.example .env
bun run build
bun run start
```

The default production server listens on `http://127.0.0.1:3020`.

## Routes

- `/` opens the default board.
- `/b/:slug` opens or creates a named public board.
- `/api/boards/:slug/strokes?page=0` lists strokes.
- `/api/boards/:slug/ws` streams board updates.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `3020` | Server port |
| `DB_PATH` | `data/yophon-board.db` | SQLite path |
| `DEFAULT_BOARD_SLUG` | `main` | Default board slug |
| `DEFAULT_BOARD_TITLE` | `Yophon Board` | Default board title |
| `BOARD_ADMIN_PASSWORD` | unset | Seeds admin password on first DB init |
| `APP_ORIGIN` | unset | Optional CORS origin |
| `COOKIE_SECURE` | auto | Force secure cookies with `true` or `false` |

Set `BOARD_ADMIN_PASSWORD` before first startup. If the database already exists, changing the env var will not reset the stored admin password.
