[Roadster Rush](../README.md) / Development / Developer guide

# Developer guide

**Run the game, verify a build and connect a race server.**

The frontend renders the game in the browser. A separate Node.js process manages private multiplayer rooms and race state. Solo racing and Practice can run independently of that process.

## Run locally

Use **Node.js 22.12 or newer**; Node 24 is recommended. Install the locked dependencies with Bun, then start the frontend:

```sh
bun install --frozen-lockfile
npm run dev -- --host 127.0.0.1 --port 5173
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). If Bun is not installed, the equivalent installation command is:

```sh
npm exec --yes --package=bun -- bun install --frozen-lockfile
```

For local multiplayer, run this in a second terminal:

```sh
npm run server
```

The race server uses port **2567** by default. The development frontend proxies `/race/ws` to it. To use another backend port, set `PORT` for the server and `RACE_SERVER_PROXY_TARGET=ws://127.0.0.1:YOUR_PORT` for the frontend.

On macOS, `Start Roadster Rush.command` starts the frontend and installs dependencies if needed. Keep its terminal open while playing; start the race server separately for multiplayer.

## Build and verify

```sh
npm test
npm run typecheck
npm run build
npm run preview -- --host 127.0.0.1 --port 5175
```

With the frontend and race server running, `npm run test:race` drives two clients through a complete multiplayer race. Set `RACE_TEST_URL` and `RACE_TEST_SERVER_URL` if using different addresses, or `RACE_TEST_TRACK=starport` to test Starport Circuit.

Automated checks cover gameplay, controls, track progress, barriers, power-ups, multiplayer and application integration. They do not replace hands-on checks of frame rate, controller support and internet latency.

## Online multiplayer

The persistent Node.js race server is deployed separately from the website. Configure these values for your own deployment:

| Setting                                             | Where          | Purpose                                                            |
| :-------------------------------------------------- | :------------- | :----------------------------------------------------------------- |
| `VITE_RACE_SERVER_URL=wss://YOUR_RACE_HOST/race/ws` | Frontend build | Secure connection to the race server.                              |
| `HOST=0.0.0.0`                                      | Race server    | Listen for connections through the hosting environment.            |
| `PORT`                                              | Race server    | Use the port assigned by your host.                                |
| `ALLOWED_ORIGINS`                                   | Race server    | Comma-separated list of exact frontend origins allowed to connect. |

Deploy `server/` together with `shared/`. The backend has its own dependency manifest:

```sh
npm ci --prefix server --omit=dev
HOST=0.0.0.0 PORT=2567 npm run server
```

Enable secure WebSocket forwarding for `/race/ws` at the hosting layer. `/health` is the server health endpoint. A backend container definition is also provided at `server/Dockerfile`.

Rooms live in a single server process’s memory; a database is not needed for the current room-based racing. The configured limits of **25 rooms / 100 connections** are safeguards, not a measured hosting capacity. Load-test before choosing a public player limit.

## Project map

```text
src/
  App.jsx             Menus, lobby, HUD and results
  game/               Three.js world, car, controls, cameras and race engine
  routes/             Application entry and routing
  styles.css          Game interface
  home.css            Home screen and circuit selection
  party.css           Power-up interface
shared/               Physics, circuits, barriers, pickups and driver names
server/               Multiplayer rooms and authoritative race simulation
public/models/        Custom Roadster model
tests/                Gameplay and multiplayer checks
design-concepts/      Visual development references
```

The game uses **React, Three.js and JavaScript**, with a Node.js WebSocket backend. Browser rendering and the race simulation are separate, and shared rules keep local and online driving consistent.

## Documentation structure

The repository README is the handbook’s landing page. The player chapters live in `docs/guide/`, and the release overview lives in `docs/releases/`.

[`SUMMARY.md`](../SUMMARY.md) defines the reading order. [`.gitbook.yaml`](../.gitbook.yaml) points GitBook at the landing page and navigation file for a future Git Sync import. The guides also use ordinary Markdown links so they can be read directly in the repository. No GitBook site is published by these files.

Keep the `README.md`, `SUMMARY.md`, `.gitbook.yaml` and `docs/` files together when copying the handbook. The cover image is stored locally in `docs/images/roadster-rush-cover.png`.

---

[← v0.5.0 & what’s next](releases/v0.5.0.md) · **[Return to Roadster Rush →](../README.md)**
