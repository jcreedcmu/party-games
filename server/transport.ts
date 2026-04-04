export type ConnectionId = string;

export type Connection = {
  id: ConnectionId;
  send: (data: string) => void;
  close: () => void;
};

export type TransportHandler = {
  onConnect: (conn: Connection) => void;
  onMessage: (conn: Connection, data: string) => void;
  onDisconnect: (conn: Connection) => void;
};
