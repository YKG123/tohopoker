# Touhou Poker Face Up

A browser remake of the Flash game *Poker Face Up* (`../dagobah_poker_face_up_survival.swf`) with a Touhou cast.
The UI is the original's own vector art, sounds and layout, extracted from the SWF. The rules and opponent AI are a
line-by-line port of its ActionScript. Character art is by **dairi & Haruka**, used under their terms
(non-commercial, credited, no redistribution of the raw files; see `../extracted/Terms of Use (English).txt`).

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (works from any folder or static host)
npm run check      # type-check
```

Dev URL flags: `?speed=10` fast-forwards the animations, `?autoplay` plays your seat for you.

## Add a character

Every folder in `src/characters/` that has a `character.json` is playable. It shows up on the select screen,
in the ranking, and in the records automatically.

1. Copy an existing folder, e.g. `src/characters/reimu` → `src/characters/sanae`.
2. Replace `neutral.webp`, `win.webp`, `lose.webp` and `tell.webp` (any .webp/.png/.jpg; the names are set under
   `look.sprites`). Dairi's standing portraits from `../cast/` work as they are.
3. Edit `character.json`:

| Field | What it does |
|---|---|
| `id`, `name`, `fullName`, `order` | Identity and position on the select screen |
| `stats` | Your 1-5 star ratings and comment (shown on the select screen) |
| `look.color` | Banner and icon accent color |
| `look.face` | Face center (`x` of width, `y` of height) and `size` (fraction of height). Used for the table figure, the close-up banner and the select icon |
| `look.companion` | Optional sidekick drawn beside them (Tewi with Reisen) |
| `ai.callMax` / `ai.raiseMax` | Per hand category (0 no pair ... 11 royal flush): the highest bet level they'll call, and the level they keep raising to |
| `ai.raiseAvg` | % chance to take the bolder option each decision |
| `ai.bluffType` | 1 never, 2 stands pat on two pair to fake a made hand, 3 also bet-bluffs a low pair |
| `ai.reading` | 1 oblivious, 2 plays tighter against players who swap nothing, 3 also folds to visible tells |
| `ai.changeType` | Junk hands: 1 swap all, 2 keep the high card, 3 keep the top two |
| `ai.tell` | `when` (noPair, onePair, twoPairOrTrips, straightOrBetter, fullHouseOrBetter, never), `chance` %, and `reveals` (the hand strength readers infer) |
| `ai.randomBetting` | The original Shin's coin-flip betting |
| `lines` | Greeting, swap (`{n}` = cards, `{s}` = plural s), keep, call, raise, raise2, drop, and `busted` (the bust cut-in; falls back to drop) |

`../convert_stats.py` turns star ratings into these AI numbers. Its rules are described in
`../AI Stats - Poker Face Up format.txt`. To check a new character's face crop, open `/tools/banners.html`
in the dev server (add `?emotion=lose` etc.). Aim for the eyes about 40% down the banner. The table figure and
select icon use the same `look.face` box.

`node tools/check-images.mjs` (with the dev server on port 5199) loads every image and autoplays two matches,
reporting any image that fails to load.

## Layout

- `src/engine/` holds the rules, with no DOM. `match.ts` is the round flow, `ai.ts` the opponent logic, and `hand.ts` hand scoring.
  Comments name the SWF frames each part comes from.
- `src/game/` connects the engine to the screen: `tableView.ts` (the table, timed in original 52fps frames) and `screens.ts`
  (title, select, record, credit).
- `src/ui/` holds the stage (400×300, zoomed to fit), sprite-frame playback, and the table pieces.
- `public/ui/` contains the original UI art and sounds. Regenerate them with `npm run extract-ui` (needs JPEXS `ffdec`).
- `tools/simulate.ts` runs thousands of headless matches to check the rules and compare AIs:
  `npx tsx tools/simulate.ts 3000` (add `--original` for the SWF's own cast).
- `tools/import-characters.py` was the one-time importer from `../sprites/`. Edit the JSON files directly now.

## Differences from the SWF

- Seven-character limit removed. The select screen shows 15 per page plus Auto, with page arrows once there are more.
- Records are keyed by character id in localStorage instead of fixed 8-slot arrays.
- An exact tie at showdown goes to the earlier seat. The SWF's check fell through to seat 3 even if seat 3
  had the worse hand.
- "Quality" switches image smoothing.
