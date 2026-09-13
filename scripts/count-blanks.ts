// How the stored cards classify for ownership and blank stock.
// Run: npx tsx scripts/count-blanks.ts
import fs from 'node:fs';
import path from 'node:path';
import { configureLibrary } from '../server/games/bwc/storage.js';
import { isBlankCard, isUnowned } from '../server/games/bwc/state.js';
import { MAX_BLANK_CARDS } from '../server/games/bwc/constants.js';

const libPath = path.resolve(import.meta.dirname, '..', 'data', 'bwc', 'cards.json');
const library = configureLibrary(JSON.parse(fs.readFileSync(libPath, 'utf-8')), () => {});
const cards = Array.from(library.values());
const blanks = cards.filter(isBlankCard).length;
console.log(`${cards.length} cards: ${blanks} unfilled blanks, ` +
  `${cards.filter(c => isUnowned(c) && !isBlankCard(c)).length} authored but unowned, ` +
  `${cards.filter(c => !isUnowned(c)).length} owned`);
console.log(`cap is ${MAX_BLANK_CARDS}: the first press would mint ` +
  `${Math.max(0, MAX_BLANK_CARDS - blanks)} and put out ${blanks + Math.max(0, MAX_BLANK_CARDS - blanks)}`);
