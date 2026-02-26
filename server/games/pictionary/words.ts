import fs from 'node:fs';
import path from 'node:path';

export type WordEntry = {
  word: string;
  added_on?: string;
  added_by?: string;
};

const WORD_LIST_PATH = path.resolve(import.meta.dirname, 'word-list.json');
const WORDS: WordEntry[] = JSON.parse(fs.readFileSync(WORD_LIST_PATH, 'utf-8'));

export function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)].word;
}

export function getWordEntry(word: string): WordEntry | undefined {
  return WORDS.find(w => w.word.toLowerCase() === word.toLowerCase());
}

export function addWord(word: string, addedBy: string): boolean {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return false;
  if (WORDS.some(w => w.word.toLowerCase() === normalized)) return false;

  const entry: WordEntry = {
    word: normalized,
    added_on: new Date().toISOString(),
    added_by: addedBy,
  };
  WORDS.push(entry);
  fs.writeFileSync(WORD_LIST_PATH, JSON.stringify(WORDS, null, 2) + '\n');
  return true;
}
