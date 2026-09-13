// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { configureLibrary, formatLibrary, type SerializedLibrary } from '../games/bwc/storage.js';

function serialized(cards: SerializedLibrary['cards']): SerializedLibrary {
  return { cards };
}

const CARD = {
  ops: [],
  name: 'Dinosaur',
  cardType: 'Animal',
  text: '+5',
  creator: 'Jason',
  createdAt: '2026-04-11T22:13:03.234Z',
};

describe('formatLibrary', () => {
  it('round-trips through JSON.parse', () => {
    const data = serialized({ a: CARD, b: { ...CARD, name: 'Volcano' } });
    expect(JSON.parse(formatLibrary(data))).toEqual(data);
  });

  it('writes one line per card', () => {
    const data = serialized({ a: CARD, b: CARD, c: CARD });
    const lines = formatLibrary(data).trimEnd().split('\n');
    // Opening brace, "cards" opener, one line per card, then two closers.
    expect(lines).toHaveLength(3 + 4);
    expect(lines.filter(l => l.includes('"Dinosaur"'))).toHaveLength(3);
  });

  it('handles an empty library', () => {
    expect(JSON.parse(formatLibrary(serialized({})))).toEqual({ cards: {} });
  });

  it('escapes ids and text rather than emitting raw characters', () => {
    const data = serialized({ 'a"b': { ...CARD, text: 'line\none\t"quoted"' } });
    expect(JSON.parse(formatLibrary(data))).toEqual(data);
    // Still one line for the single card: the newline and tab in its text
    // are escaped rather than breaking the line.
    expect(formatLibrary(data).trimEnd().split('\n')).toHaveLength(1 + 4);
  });

  it('ends with a newline', () => {
    expect(formatLibrary(serialized({ a: CARD })).endsWith('\n')).toBe(true);
  });
});

describe('configureLibrary', () => {
  it('normalizes stored ops and hashes the normalized form', () => {
    const library = configureLibrary(
      serialized({
        a: {
          ...CARD,
          ops: [
            { type: 'draw-start', color: '#000000', size: 5, x: 1.7, y: 2.2 },
            { type: 'draw-move', points: [{ x: 2, y: 2 }, { x: 2, y: 2 }, { x: 8, y: 8 }] },
            { type: 'draw-end' },
          ],
        },
      }),
      () => {},
    );
    const card = library.get('a')!;
    expect(card.ops).toEqual([
      { type: 'draw-start', color: '#000000', size: 5, x: 2, y: 2 },
      { type: 'draw-move', points: [{ x: 8, y: 8 }] },
      { type: 'draw-end' },
    ]);
    expect(card.opsHash).toBeTruthy();
  });

  it('defaults name and cardType for entries written before they existed', () => {
    const entry: Record<string, unknown> = { ...CARD };
    delete entry.name;
    delete entry.cardType;
    const library = configureLibrary(
      serialized({ a: entry as SerializedLibrary['cards'][string] }),
      () => {},
    );
    expect(library.get('a')!.name).toBe('');
    expect(library.get('a')!.cardType).toBe('');
  });

  it('returns an empty library when there is no file', () => {
    expect(configureLibrary(null, () => {}).size).toBe(0);
  });
});
