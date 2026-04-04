# Release Notes

### April 4, 2026

### Gameplay

- **Multiple rounds**: Pictionary now plays 3 full rounds before ending, so every player draws multiple times. Turn order is shuffled once at game start and stays consistent across rounds.
- **Mid-game joins**: New players can join an ongoing Pictionary game. They participate as guessers immediately and get added to the draw rotation at the next round boundary.
- **Turn reveal phase**: A 5-second "reveal" screen now appears between turns, showing the word, who drew it, and how many people guessed correctly.
- **Longer turns**: Drawing time increased to 105 seconds (was 75s). The grace "extra drawing time" period after everyone guesses is now 20 seconds (was 10s).
- **Auto-start on leave**: If all remaining players are ready and someone leaves or is kicked, the game starts automatically.
- **Eyedropper tool**: Pick up any color from the canvas (shortcut: `O`). Automatically switches back to the pen after use.
- **Incremental hints**: Three hint letters are now revealed progressively at 1/4, 1/2, and 3/4 of the turn duration.
- **Word length counts**: Blanks now show letter counts, e.g. `___(3)` for "cat" or `_(1)-___(3)` for "t-rex". Multi-word phrases and hyphenated words each show per-segment counts.
- **Fuzzy matching**: Guesses now tolerate adjacent letter transpositions (e.g. "elehpant" matches "elephant"). Hyphens and apostrophes are normalized for matching.
- **Sound**: A chime plays for all players when anyone guesses correctly.

### Word List

- **Word statistics tracking**: The server now records per-word stats (times presented, chosen, guessed successfully/failed) in `word-stats.json`.
- **Weighted word selection**: Random word selection favors words that haven't been chosen as often.
- **Add words during play**: A persistent "Add a Word" panel appears alongside the game board during active play, not just in the lobby.

### Misc

- **Boot/kick players**: A boot button in the lobby lets any player kick another.
- **WebSocket heartbeat**: Network connections probably shouldn't just die from inactivity anymore.
- **Postgame replay**: Play/Stop buttons available in postgame to show animation of drawing.
- **CI**: Tests now run on CI.
- **Preview tool**: `make preview` generates a static HTML preview of all UI states for CSS iteration. Copies all public assets automatically.
