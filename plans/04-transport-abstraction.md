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

### Server-side types

```ts
// server/transport.ts

type ConnectionId = string;

type Connection = {
  id: ConnectionId;
  send: (msg: ServerMessage) => void;
};

type TransportEvents = {
  onConnection: (conn: Connection, onMessage: (msg: ClientMessage) => void, onClose: () => void) => void;
};

type ServerTransport = {
  start: (events: TransportEvents) => void;
  close: () => void;
  getConnection: (id: ConnectionId) => Connection | undefined;
};
```

### Client-side types

```ts
// client/src/transport.ts

type ClientTransport = {
  connect: () => void;
  send: (msg: ClientMessage) => void;
  onMessage: (handler: (msg: ServerMessage) => void) => void;
  onOpen: (handler: () => void) => void;
  onClose: (handler: () => void) => void;
  close: () => void;
};

type ClientTransportFactory = (url: string) => ClientTransport;
```

### Implementations

- `server/transports/websocket.ts` — wraps `ws` library
- `client/src/transports/websocket.ts` — wraps browser `WebSocket`
- (future) `client/src/transports/webrtc.ts` — wraps `RTCDataChannel`

### P2P Architecture

For peer-to-peer, the "host" peer runs the game state machine in-browser. This
is feasible because the state functions are pure — no Node.js dependencies.
The host peer uses a `WebRTCServerTransport` that listens for data channel
connections instead of WebSocket connections.

```
Host browser:
  [Game State Machine] ←→ [WebRTCServerTransport] ←→ data channels

Guest browsers:
  [Client UI] ←→ [WebRTCClientTransport] ←→ data channel to host
```

Signaling (how peers find each other) is out of scope for this plan — it could
use a lightweight signaling server, or manual offer/answer exchange.

## Steps

- [ ] **1. Define transport types.** Create `server/transport.ts` and
  `client/src/transport.ts` with the types above.

- [ ] **2. Implement WebSocket server transport.** Extract the ws-specific code
  from `server.ts` into `server/transports/websocket.ts`. This becomes a
  function `createWebSocketTransport(httpServer): ServerTransport`.

- [ ] **3. Refactor `server.ts`.** Replace direct ws usage with
  `ServerTransport` calls. The `clients` map changes from
  `Map<WebSocket, PlayerId>` to `Map<ConnectionId, PlayerId>`.

- [ ] **4. Implement WebSocket client transport.** Extract ws-specific code from
  `useSocket.ts` into `client/src/transports/websocket.ts`.

- [ ] **5. Refactor `useSocket.ts`.** Accept a `ClientTransport` (or factory)
  instead of constructing `WebSocket` directly. The hook's API to components
  doesn't change.

- [ ] **6. Type-check and test.** Existing tests should pass unchanged since
  behavior is identical.

- [ ] **7. (Future) Implement WebRTC transport.** This is a separate effort
  once the abstraction is proven.

## Risks

- Over-abstraction if WebRTC never materializes. The abstraction is thin enough
  (~20 lines of types) that it's not a big cost, but don't gold-plate it.
- P2P requires running server logic in the browser, which means the server
  game modules need to be bundleable for the browser. Currently they have no
  Node.js deps (except `words.ts` which uses `fs`), so this is mostly feasible
  but `words.ts` would need an alternative loading strategy.
- Signaling for WebRTC is a whole separate problem.

## Open Questions

- Should the transport abstraction also handle the relay pattern (forwarding
  draw ops to specific peers), or should that stay in the game logic layer?
  Leaning toward keeping it in the game layer — the transport just delivers
  messages point-to-point, and the game/server decides who to send to.
