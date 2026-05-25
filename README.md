# Rift

An isometric pixel-art online RPG. No combat, no NPCs, no violence. Players own personal worlds, explore, gather, craft, build, and solve puzzles together. Save and share worlds with `.rift` files.

All UI uses **"Enter the Rift"** and **"Entering the Rift..."** phrases.

## Stack

- **Backend**: Node 20+, Express, ws (WebSockets), bcryptjs, jsonwebtoken
- **Database**: Neon Serverless Postgres (`@neondatabase/serverless`)
- **Frontend**: HTML / CSS / vanilla JS (ES modules), Canvas2D isometric renderer, procedural pixel-art sprites
- **Deploy**: Render web service

## Local development

1. Install Node 20+ and create a Neon project at https://console.neon.tech.
2. Copy the connection string into `.env`:
   ```
   cp .env.example .env
   # edit .env, set DATABASE_URL and JWT_SECRET
   ```
3. Install and migrate:
   ```
   npm install
   npm run migrate
   ```
4. Start the server:
   ```
   npm run dev
   ```
5. Open http://localhost:3000

The same Node process serves the API, the WebSocket endpoint (`/ws`), and the static frontend.

## Render deployment

`render.yaml` is included. To deploy:

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Set `DATABASE_URL` in the env panel (Neon connection string).
4. Render will run `npm install && npm run migrate` on build and `npm start` to launch.
5. Health check is at `/api/health`.

The frontend is served from the same web service - no separate static site needed.

## Embedding

Drop this snippet on any page:

```html
<script src="https://YOUR-RENDER-DOMAIN/embed.js" data-host="https://YOUR-RENDER-DOMAIN" data-width="100%" data-height="720"></script>
```

It injects a responsive iframe pointing at the game.

## .rift save files

A `.rift` file is a JSON envelope:

```
{
  "magic": "RIFT",
  "version": 1,
  "signature": "<HMAC-SHA256 over payload>",
  "payload": "<base64 of zlib(JSON snapshot)>"
}
```

The decoded snapshot contains:

- `world` - name, seed, created_at
- `state` - terrain overlay, placed objects, puzzles, shrines, unlocks
- `permissions` - list of `{username, role}` (invited players are preserved on import)
- `player` - appearance, last position, inventory

Files are HMAC-signed with `JWT_SECRET` to detect tampering. Only owners can export. On import, the user becomes owner of the resulting world; original invitees are re-applied.

## API

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST | `/api/auth/register` | `{ username, email, password }` |
| POST | `/api/auth/login` | `{ username, password }` -> `{ token, user }` |
| POST | `/api/auth/logout` | bearer |
| POST | `/api/auth/password-reset/request` | `{ email }` |
| POST | `/api/auth/password-reset/confirm`  | `{ token, password }` |
| GET  | `/api/auth/me` | bearer |
| GET  | `/api/worlds` | list owned + shared |
| POST | `/api/worlds` | create |
| GET  | `/api/worlds/:id` | world + state + permissions |
| PUT  | `/api/worlds/:id/state` | save overlay |
| POST | `/api/worlds/:id/invite` | owner only |
| DEL  | `/api/worlds/:id/invite/:userId` | owner only |
| DEL  | `/api/worlds/:id` | owner only |
| GET  | `/api/character` | current character |
| PUT  | `/api/character` | save appearance/position |
| GET  | `/api/inventory` | list |
| POST | `/api/inventory/add` | `{ item_key, quantity }` |
| POST | `/api/inventory/consume` | `{ item_key, quantity }` |
| GET  | `/api/crafting/recipes` | static list |
| GET  | `/api/crafting/` | user's crafted log |
| POST | `/api/crafting/craft` | `{ recipe_key }` |
| GET  | `/api/rift/export/:worldId` | download `.rift` |
| POST | `/api/rift/import` | `{ file: base64, overwrite_world_id? }` |

All authenticated endpoints take `Authorization: Bearer <JWT>`. All DB calls are parameterized.

## WebSocket protocol

Connect: `wss://host/ws?token=<jwt>&world=<id>`

Server -> client:
- `hello` - `{ you: {id, username, role}, players: [...], message }`
- `join` / `leave` - presence
- `move` - position sync
- `place` / `remove` - building
- `gather` - node removed
- `puzzle` / `shrine` - state change
- `chat`, `emote`

Client -> server: same shapes (server broadcasts).

The server is authoritative for membership; world state is event-broadcast and persisted via REST.

## Gameplay loop

1. **Sign in** (or register, or reset password).
2. From "Worlds": **Enter the Rift** on an existing world, **New world**, or **Import .rift**.
3. While loading: **Entering the Rift...**
4. When another player joins: **A traveler is entering the Rift.**
5. Move with arrow keys / WASD. Press Space to interact (gather, toggle puzzle, activate shrine if you have a Rune Key).
6. Open **Inventory**, **Crafting**, **Build**, **Permissions** panels via HUD buttons. In Build, click a tile to place; right-click to pick up.
7. **Export .rift** to share a world snapshot; another player can **Import .rift** to receive it.

## Tech notes

- Procedural pixel art: all sprites and tiles are drawn into offscreen canvases at boot (`public/js/art.js`). No binary art assets required.
- World terrain is deterministic from `seed` (mulberry32 + value noise); only overlays (placed, puzzles, shrines, unlocks) are persisted, keeping `world_state` rows small.
- Movement is tile-stepped with 140 ms cadence and server reconciliation on change. Position is auto-saved every 20 s.

## Project layout

```
rift/
  package.json          # npm scripts and deps
  render.yaml           # Render blueprint
  server/
    index.js            # Express + WS bootstrap
    db.js               # Neon SQL connection
    auth.js             # JWT + bcrypt helpers
    multiplayer.js      # WebSocket sessions
    recipes.js          # Server-side crafting catalog
    migrations/
      001_init.sql      # All tables
      run.js            # Migrator
    routes/
      auth.js  worlds.js  character.js
      inventory.js  crafting.js  rift.js
  public/
    index.html
    css/style.css
    js/
      main.js  ui.js  game.js
      renderer.js  art.js  world.js
      api.js  network.js  items.js
    assets/
      favicon.svg  logo-wordmark.svg
```
