import type { Express } from 'express';
import { getOpsByHash } from './ops-store.js';

// A year, which is as long as `max-age` is defined to mean anything.
const IMMUTABLE = 'public, max-age=31536000, immutable';

export function registerBwcRoutes(app: Express): void {
  // The hash is what resolves the art; the card id is in the path to keep
  // the URL legible in logs and devtools. Since the hash names the content,
  // an edit produces a different URL and a cached response can never be
  // stale.
  app.get('/api/bwc/card/:cardId/:opsHash', (req, res) => {
    const ops = getOpsByHash(req.params.opsHash);
    if (!ops) {
      // Deliberately uncached: a hash unknown now may be known later, once
      // the client's state catches up with a card it has not heard about.
      res.status(404).json({ error: 'unknown ops hash' });
      return;
    }
    res.set('Cache-Control', IMMUTABLE);
    res.json({ ops });
  });
}
