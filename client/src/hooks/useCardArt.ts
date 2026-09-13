import { useEffect, useState } from 'react';
import { getArtUrl, requestArt, subscribeArt, PRIORITY_VISIBLE } from '../card-art';

// Returns the object URL for a card's art, or undefined while it is still
// being fetched and rendered. Asking for it is what queues the render.
export function useCardArt(cardId: string, opsHash: string, priority = PRIORITY_VISIBLE): string | undefined {
  const [url, setUrl] = useState(() => getArtUrl(opsHash));

  useEffect(() => {
    setUrl(getArtUrl(opsHash));
    const unsubscribe = subscribeArt(opsHash, () => setUrl(getArtUrl(opsHash)));
    requestArt(cardId, opsHash, priority);
    return unsubscribe;
  }, [cardId, opsHash, priority]);

  return url;
}
