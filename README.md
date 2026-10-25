# Multiplayer Game — Quiz Battle

A responsive 2–8 player trivia game designed for Netlify hosting. The static frontend calls `/.netlify/functions/game`; room state and score calculation live in a Netlify Function using Netlify Blobs with strong consistency.

## Included
- Room creation and six-character room codes
- Host-only game start and round advance
- 2–8 players, 10 mixed-trivia questions, 15-second rounds
- Server-calculated base points and speed bonus
- Server-side validation for room membership, host permissions, answer count, timer, and answer choices
- Polling-based room synchronization (approximately once per second)
- Responsive game-show UI

## Deploy
1. Deploy this project to Netlify with Functions enabled. Netlify Blobs requires a Netlify site/runtime context; a local static file or ChatGPT preview cannot run the backend.
2. Confirm the function is deployed at `/.netlify/functions/game` and the site has Blobs available.
3. Open the public URL in two different browsers/devices, create a room, join with its code, and test a complete 10-question game.

## Important validation note
The static frontend has a local syntax/sanity check, but the Netlify function has not been integration-tested against a live Netlify Blobs deployment in this environment. Before treating this as production-ready, test concurrent joins/answers, expired rooms, function cold starts, and Netlify Blobs lock recovery. The current room-lock implementation uses a short stale-lock timeout and should be reviewed under load.
