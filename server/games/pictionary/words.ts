import WORD_LIST from './word-list.json' with { type: 'json' };

type WordEntry = {
  word: string;
  added_on?: string;
  added_by?: string;
};

const WORDS: WordEntry[] = WORD_LIST;

export function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)].word;
}
