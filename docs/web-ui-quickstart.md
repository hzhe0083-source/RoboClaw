# RoboClaw Web UI Quickstart

## Installation

### 1. Install Python dependencies, including Web support

```bash
uv venv
uv sync --extra dev --extra web
```

`run.py` and the Web chat UI do not require the embodied learning stack. Add
`--extra learning` only when you also need LeRobot-backed collection or
training features:

```bash
uv sync --extra dev --extra web --extra learning
```

### 2. Install frontend dependencies

```bash
cd roboclaw-web
npm install
```

## Development Mode

### One-command startup

```bash
uv run run.py
```

This entrypoint will:

- start the backend with `uv run --extra web --locked roboclaw web start`
- run `npm install` automatically if frontend dependencies are missing
- start the `roboclaw-web` frontend development server

Default addresses:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8765`

### Start the backend manually (Terminal 1)

```bash
uv run roboclaw web start
```

The backend will listen on `http://localhost:8765`.

### Start the frontend manually (Terminal 2)

```bash
cd roboclaw-web
npm run dev
```

The frontend will listen on `http://localhost:5173`.

### Open the app

Visit `http://localhost:5173` in your browser.

## Production Mode

### Build the frontend

```bash
cd roboclaw-web
npm run build
```

### Start the server

```bash
roboclaw web start
```

## Feature Status

- `Chat UI`: available and connected to the RoboClaw agent
- `Robot monitor`: in progress
- `Control panel`: in progress
- `Dataset workbench`: planned as the Nexla integration point

## Architecture

```text
┌─────────────────────────────────────┐
│   React Frontend (Port 5173)        │
│   - Chat UI                         │
│   - Monitor (coming soon)           │
│   - Control (coming soon)           │
└──────────────┬──────────────────────┘
               │ WebSocket
┌──────────────▼──────────────────────┐
│   FastAPI Backend (Port 8765)       │
│   - WebSocket server                │
│   - Message routing                 │
└──────────────┬──────────────────────┘
               │ Message Bus
┌──────────────▼──────────────────────┐
│   RoboClaw Agent Runtime            │
└─────────────────────────────────────┘
```

## Troubleshooting

### WebSocket connection fails

Make sure the backend server is running:

```bash
uv run roboclaw web start
```

### Frontend build fails

Clean and reinstall dependencies:

```bash
cd roboclaw-web
rm -rf node_modules package-lock.json
npm install
```

### Port conflicts

Adjust the ports:

- Backend: update the `port` argument passed to `roboclaw web start`
- Frontend: update `server.port` in `vite.config.ts`

## Next Steps

- [ ] Build a real robot monitoring surface
- [ ] Build a real teleoperation/control surface
- [ ] Integrate the Nexla dataset workbench
- [ ] Add authentication and authorization
- [ ] Improve performance and test coverage
