# Think Fast Blast

Think Fast Blast is a responsive browser game that blends fast trivia with
falling-block puzzle pressure. It started as a way to make practice questions
more engaging for a kid who needed help building school confidence, then grew
into a colorful arcade quiz game built for quick rounds, streaks, and replayable
challenge.

Play it here: https://thinkfastblast.netlify.app

## Gameplay

Answer trivia to earn control of falling pieces. Correct answers let you place
blocks strategically, build streaks, and unlock special pieces. Wrong answers
drop heavy stone blocks and push the board closer to disaster.

- Clear a level by reaching 500 points.
- Survive with fewer than three strikes.
- Build streaks to trigger TNT, drill, and lightning power pieces.
- Score through quick answers, color matches, line clears, and special blasts.
- Play with keyboard controls on desktop or touch controls on phones and tablets.

## Features

- 20 trivia levels with escalating themes and difficulty
- Mobile, tablet, and desktop layouts
- Touch, swipe, and keyboard controls
- Combo streaks, special blocks, board hazards, and recovery moments
- Blast Arena AI matches with one full-size human board
- 2-4 player cross-device rooms with shared codes and reconnect snapshots
- Web Audio music and sound effects with persistent volume controls
- Local progress, unlocks, high scores, and run stats
- Netlify-ready Vite production build

## Tech Stack

- React
- Vite
- Tailwind CSS
- Web Audio API
- Supabase Realtime Broadcast and Presence
- Node test runner

## Run Locally

```powershell
npm install
npm run dev
```

Then open the local URL Vite prints, usually `http://localhost:5173`.

## Quality Checks

```powershell
npm run lint
npm test
npm run build
npm audit
```

## Deploy

The project is configured for Netlify:

- Build command: `npm run build`
- Publish directory: `dist`

Production deploys live at:

https://thinkfastblast.netlify.app

## Project Structure

```text
src/App.jsx             Main game component, state, and UI
src/data/constants.js   Board size, scoring, levels, speed, block definitions
src/data/questions.js   Level question banks
src/game/audio.js       Web Audio music and sound effects
src/game/board.js       Board creation, collision, shuffle, rotation helpers
src/game/board.test.js  Core board mechanics tests
src/game/onlineArena.js Cross-device arena board and room helpers
src/game/OnlineArenaView.jsx Online room, presence, and match UI
src/index.css           Tailwind entry, animations, and responsive game styles
```
