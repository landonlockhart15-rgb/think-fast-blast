# Think Fast Blast

Think Fast Blast is a local React/Vite game that mixes quiz questions with falling
block gameplay. Correct answers give controllable blocks. Wrong answers drop
stone blocks. Fruit bombs, color matches, and line clears add points.

## Run Locally

```powershell
npm install
npm run dev
```

Then open the local URL Vite prints, usually `http://localhost:5173`.

## Build

```powershell
npm run build
```

The production site is generated in `dist/`.

## Deploy To Netlify

Use these settings:

- Build command: `npm run build`
- Publish directory: `dist`

You can deploy by dragging the `dist` folder into Netlify, or by connecting a
GitHub repo and using the settings above.

## Project Structure

```text
src/App.jsx             Main game component and UI
src/data/constants.js   Board size, scoring, speed, block definitions
src/data/questions.js   Level question banks
src/game/board.js       Board creation, collision, shuffle, rotation helpers
src/index.css           Tailwind entry plus background animations
```

## Gameplay Notes

- Reach 500 points to clear a level.
- Three wrong answers ends the run.
- After several correct answers, a turn can drop two blocks.
- Stone blocks do not color-match; clear them with full lines or fruit blasts.
