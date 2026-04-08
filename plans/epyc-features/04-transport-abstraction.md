# Plan 04: Transport Abstraction (WebSocket / WebRTC)

**Depends on:** Plan 02 (Game Module) recommended but not strictly required.

## Motivation

To support WebRTC data channels for peer-to-peer play (or other transports in
the future), abstract the transport layer so the game logic doesn't care how
messages are delivered.

Currently ws-specific APIs appear in exactly two places:
- `server/server.ts` — `WebSocketServer`, `ws.send()`, `ws.readyState`, etc.
- `client/src/hooks/useSocket.ts` — `new WebSocket(...)`, `.send()`, etc.

## Design

### Server-side types (`server/transport.ts`)

```ts
type ConnectionId = string;

type Connection = {
  id: ConnectionId;
  send: (data: string) => void;
};

type TransportHandler = {
  onConnect: (conn: Connection) => void;
  onMessage: (conn: Connection, data: string) => void;
  onDisconnect: (conn: Connection) => void;
};
```

### Client-side types (`client/src/transport.ts`)

```ts
type ClientTransport = {
  send: (data: string) => void;
  close: () => void;
};

type ConnectTransport = (
  url: string,
  handlers: { onOpen, onMessage, onClose },
) => ClientTransport;
```

### Implementations

- `server/transports/websocket.ts` — `attachWebSocketTransport(httpServer, handler)`
- `client/src/transports/websocket.ts` — `connectWebSocket(url, handlers)`

### P2P Architecture (future)

For peer-to-peer, the "host" peer runs the game state machine in-browser. This
is feasible because the state functions are pure — no Node.js dependencies.
The host peer uses a `WebRTCServerTransport` that listens for data channel
connections instead of WebSocket connections.

## Steps

- [x] **1. Define transport types.** Created `server/transport.ts` and
  `client/src/transport.ts` with Connection, TransportHandler, ClientTransport,
  and ConnectTransport types.

- [x] **2. Implement WebSocket server transport.** Extracted ws-specific code
  into `server/transports/websocket.ts`. Creates Connection objects with
  auto-incrementing IDs and wires ws events to TransportHandler callbacks.

- [x] **3. Refactor `server.ts`.** Replaced `Map<WebSocket, PlayerId>` with
  `Map<ConnectionId, { conn, playerId }>`. No WebSocket imports remain in
  server.ts — all ws-specific code is in the transport module.

- [x] **4. Implement WebSocket client transport.** Created
  `client/src/transports/websocket.ts` wrapping browser `WebSocket` into the
  `ConnectTransport` interface.

- [x] **5. Refactor `useSocket.ts`.** Replaced direct `WebSocket` usage with
  `connectWebSocket` from the transport module. Hook API unchanged.

- [x] **6. Type-check and test.** All passing (82 unit + 10 E2E).

- [ ] **7. (Future) Implement WebRTC transport.** Separate effort once the
  abstraction is proven.

## Risks

- Over-abstraction if WebRTC never materializes. The abstraction is thin enough
  (~20 lines of types) that it's not a big cost.
- P2P requires running server logic in the browser, which means the server
  game modules need to be bundleable for the browser. Currently they have no
  Node.js deps (except `words.ts` which uses `fs`), so this is mostly feasible
  but `words.ts` would need an alternative loading strategy.
- Signaling for WebRTC is a whole separate problem.
