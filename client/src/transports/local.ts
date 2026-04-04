import type { TransportHandler, Connection } from '../../../server/transport.js';
import type { ClientTransport } from '../transport';

export function createLocalConnection(
  handler: TransportHandler,
  clientHandlers: {
    onOpen: () => void;
    onMessage: (data: string) => void;
    onClose: () => void;
  },
): ClientTransport {
  const conn: Connection = {
    id: 'local',
    send(data) {
      queueMicrotask(() => clientHandlers.onMessage(data));
    },
    close() {
      handler.onDisconnect(conn);
      clientHandlers.onClose();
    },
  };

  handler.onConnect(conn);
  queueMicrotask(() => clientHandlers.onOpen());

  return {
    send(data) {
      handler.onMessage(conn, data);
    },
    close() {
      handler.onDisconnect(conn);
      clientHandlers.onClose();
    },
  };
}
