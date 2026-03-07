import type { ConnectTransport } from '../transport';

export const connectWebSocket: ConnectTransport = (url, { onOpen, onMessage, onClose }) => {
  const ws = new WebSocket(url);
  ws.onopen = onOpen;
  ws.onmessage = (e) => onMessage(e.data);
  ws.onclose = onClose;
  return {
    send(data) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    },
    close() {
      ws.close();
    },
  };
};
