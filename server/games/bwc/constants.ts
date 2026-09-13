// Shared logical dimensions for BWC surfaces and cards.
// Used by both client and server.

export const TABLE_LOGICAL = 900;
export const HAND_LOGICAL_W = TABLE_LOGICAL;
export const HAND_LOGICAL_H = TABLE_LOGICAL / 6;  // = 150
export const CARD_W = 100;
export const CARD_H = 140;

// The library holds at most this many unfilled blank cards at once. The
// blank-deck button refills the stock to this number rather than minting a
// fresh batch on every press, so blanks left over from an earlier game are
// reused instead of accumulating.
export const MAX_BLANK_CARDS = 10;
