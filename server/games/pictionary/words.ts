export type WordEntry = {
  word: string;
  added_on?: string;
  added_by?: string;
};

let WORDS: WordEntry[] = [];
let persistFn: ((words: WordEntry[]) => boolean) | null = null;

export function configureWords(
  words: WordEntry[],
  persist?: (words: WordEntry[]) => boolean,
): void {
  WORDS = words;
  persistFn = persist ?? null;
}

export function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)].word;
}

export function pickWords(n: number): string[] {
  const shuffled = [...WORDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n).map(w => w.word);
}

export function getWordEntry(word: string): WordEntry | undefined {
  return WORDS.find(w => w.word.toLowerCase() === word.toLowerCase());
}

export type AddWordResult = 'added' | 'empty' | 'duplicate' | 'persist-failed';

export function addWord(word: string, addedBy: string): AddWordResult {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return 'empty';
  if (WORDS.some(w => w.word.toLowerCase() === normalized)) return 'duplicate';

  const entry: WordEntry = {
    word: normalized,
    added_on: new Date().toISOString(),
    added_by: addedBy,
  };
  WORDS.push(entry);
  if (persistFn && !persistFn(WORDS)) {
    WORDS.pop();
    return 'persist-failed';
  }
  return 'added';
}
