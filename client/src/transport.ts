export type ClientTransport = {
  send: (data: string) => void;
  close: () => void;
};

export type ConnectTransport = (
  url: string,
  handlers: {
    onOpen: () => void;
    onMessage: (data: string) => void;
    onClose: () => void;
  },
) => ClientTransport;
