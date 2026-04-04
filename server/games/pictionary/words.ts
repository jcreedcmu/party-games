export type WordEntry = {
  word: string;
  added_on?: string;
  added_by?: string;
};

export type WordStats = {
  presented: number;
  chosen: number;
  guessExposures: number;
  guessSuccesses: number;
  guessFailures: number;
};

let WORDS: WordEntry[] = [];
let persistFn: ((words: WordEntry[]) => boolean) | null = null;
let STATS: Map<string, WordStats> = new Map();
let persistStatsFn: ((stats: Record<string, WordStats>) => void) | null = null;

export function configureWords(
  words: WordEntry[],
  persist?: (words: WordEntry[]) => boolean,
): void {
  WORDS = words;
  persistFn = persist ?? null;
}

export function configureStats(
  stats: Record<string, WordStats>,
  persist: (stats: Record<string, WordStats>) => void,
): void {
  STATS = new Map(Object.entries(stats));
  persistStatsFn = persist;
}

function getStats(word: string): WordStats {
  const key = word.toLowerCase();
  let s = STATS.get(key);
  if (!s) {
    s = { presented: 0, chosen: 0, guessExposures: 0, guessSuccesses: 0, guessFailures: 0 };
    STATS.set(key, s);
  }
  return s;
}

function saveStats() {
  if (persistStatsFn) {
    persistStatsFn(Object.fromEntries(STATS));
  }
}

export function recordPresented(words: string[]): void {
  for (const w of words) {
    getStats(w).presented++;
  }
  saveStats();
}

export function recordChosen(word: string): void {
  getStats(word).chosen++;
  saveStats();
}

export function recordGuessOutcome(word: string, correct: boolean): void {
  const s = getStats(word);
  s.guessExposures++;
  if (correct) s.guessSuccesses++;
  else s.guessFailures++;
  saveStats();
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

export type AddWordResult = 'added' | 'empty' | 'invalid' | 'duplicate' | 'persist-failed';

const VALID_WORD = /^[a-z '-]+$/;

export function addWord(word: string, addedBy: string): AddWordResult {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return 'empty';
  if (!VALID_WORD.test(normalized)) return 'invalid';
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
