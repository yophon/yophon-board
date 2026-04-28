# yophon-board

Standalone realtime whiteboard extracted from `yophon-blog`.

## Features

- Multiple projects, each with its own multi-page whiteboard
- Infinite-ish pan and zoom canvas
- Pen, eraser mode switcher, undo, minimap, page navigation
- Image paste, drag-and-drop, file picker insertion, and hand-mode transforms for images and strokes
- Inline text insertion at the next canvas click, plus editable font size, color, bold, italic, and alignment
- HTTP writes with WebSocket fan-out
- SQLite persistence
- Idempotent stroke saves via `(board_id, client_id, local_id)`
- Admin login for creating projects and clearing a project page

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

- `/` opens the default project.
- `/p/:slug` opens or creates a named public project.
- `/b/:slug` is kept as a legacy project route.
- `/api/projects` lists projects.
- `/api/projects/:slug/strokes?page=0` lists strokes.
- `/api/projects/:slug/assets` uploads image assets.
- `/api/projects/:slug/ws` streams project updates.
- `/api/boards/*` remains available as a compatibility API.

## Whiteboard Elements

All whiteboard content is stored through the stroke API as compact JSON:

- Drawing strokes: point arrays with pen or eraser metadata.
- Image elements: uploaded asset URL, bounds, rotation, and MIME metadata.
- Text elements: text content, bounds, rotation, font size, color, bold/italic flags, and alignment.

The hand tool can select drawings, images, and text. Selected elements can be moved, resized, rotated, and box-selected.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for module boundaries and where to add new features.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `3020` | Server port |
| `DB_PATH` | `data/yophon-board.db` | SQLite path |
| `ASSET_DIR` | `data/assets` | Uploaded image asset directory |
| `DEFAULT_BOARD_SLUG` | `main` | Default board slug |
| `DEFAULT_BOARD_TITLE` | `Yophon Board` | Default board title |
| `BOARD_ADMIN_PASSWORD` | unset | Seeds admin password on first DB init |
| `APP_ORIGIN` | unset | Optional CORS origin |
| `COOKIE_SECURE` | auto | Force secure cookies with `true` or `false` |

Set `BOARD_ADMIN_PASSWORD` before first startup. If the database already exists, changing the env var will not reset the stored admin password.
