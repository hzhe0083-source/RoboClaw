# RoboClaw Web UI

The RoboClaw Web UI provides a visual interface for chat, monitoring, control,
and future dataset/workbench flows.

## Features

- `Chat UI`: real-time conversation with the RoboClaw agent
- `Robot monitor`: planned
- `Control panel`: planned
- `Dataset workbench`: planned

## Development

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm run dev
```

Open `http://localhost:5173`.

### Build for production

```bash
npm run build
```

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- React Router
- WebSocket

## Structure

```text
src/
├── features/          # Feature areas
│   ├── chat/          # Chat UI
│   ├── control/       # Control panel
│   ├── monitor/       # Monitoring panel
│   └── workbench/     # Dataset workbench
├── shared/            # Shared code
│   ├── components/    # Shared components
│   ├── api/           # API clients
│   └── utils/         # Utilities
└── assets/            # Static assets
```

## Backend Communication

The Web UI talks to the RoboClaw backend over WebSocket and HTTP:

- WebSocket endpoint: `ws://localhost:8765/ws`
- REST API: `http://localhost:8765/api/*`

Make sure the backend Web channel is running:

```bash
uv run roboclaw web start
```
