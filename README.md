# VIBE CODE WARNING #

THIS REPO IS 100% VIBE CODED FOR FUN, PERSONAL, NON COMMERCIAL USE. I DIDNT WRITE A SINGLE LINE OF THE CODE OR DRAW ANY OF THE ASSETS, CREDITS OF ALL ORIGINAL AUTHORS ARE AVAILABLE IN THE GAME.

AND THIS ENTIRE README WAS WRITTEN BY CLAUDE.


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

## Game modes

**Open the Game** leads to the Game Mode screen (settings are remembered):

- **Cash Game**: the original format. Pick 1-5 opponents (up to six at the table, you included) and a length of
  10-50 rounds. The game ends after that many rounds, or sooner if you go broke or only one player is left. Survivors
  are ranked by coins.
- **Tournament**: everyone pays a 20-coin buy-in and starts with the same chip stack. The field is drawn at random
  from the cast and split across tables, which play their rounds in lockstep. Settings:
  entrants, table size (3-6), starting stack, how often the ante goes up (default every 15 rounds;
  1, 2, 3, 4, 5, 6, 8, 10, 12, 15...), how tables break, and the share of the field that gets paid.
  Every bet level costs one ante, so bets grow with the ante.
  - Table breaking: *Balanced* breaks a table as soon as everyone fits at fewer and keeps tables within one player of each other.
    *Short-handed* only breaks a table once it's down to two. *Final table only* lets tables play down until everyone fits at one.
  - Payouts: every paid place gets at least the buy-in back; the rest of the pool is split so each place gets 60% of the one
    above (16 entrants, 20% paid: 154 / 99 / 67). Prizes minus the buy-in go on everyone's coin record.
  - Set **You** to *Spectate* to watch a whole tournament without entering it (the field is all characters; nothing
    goes on your own record).
  - When you go out you can **Spectate** (watch your table, then the chip leader's once it breaks; ◀ Table ▶ fast-forwards the hand on screen and moves to the next table, a slider sets the spectating speed, and Stop Spectating jumps to the results) or **Skip**
    straight to the results.

Press **Tab** in either mode to show or hide the standings: rank, a strip of each player's face, their stack and table.

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
| `lines` | Greeting, swap (`{n}` = cards, `{s}` = plural s), keep, call, raise, raise2, drop, `allIn` (going all in; falls back to "All in!") and `busted` (the bust cut-in; falls back to drop) |

`../convert_stats.py` turns star ratings into these AI numbers. Its rules are described in
`../AI Stats - Poker Face Up format.txt`. To set a character's face crop, run `npm run dev` and open
`/tools/faces.html`: click between the eyes (or nudge with the arrow keys, `-`/`=` for the box size) and it previews
the select card, Tab scoreboard strip, table figure and banner, then saves into `character.json` (Ctrl+S).
`/tools/banners.html` shows every banner at once (add `?emotion=lose` etc.).

`node tools/check-images.mjs` (with the dev server on port 5199) loads every image and autoplays five cash games (one of each table size),
reporting any image that fails to load.

## Layout

- `src/engine/` holds the rules, with no DOM. `match.ts` is the round flow (any table size) and the cash game,
  `tournament.ts` the tables, antes, breaking and payouts, `ai.ts` the opponent logic, and `hand.ts` hand scoring.
  Comments name the SWF frames each part comes from.
- `src/game/` connects the engine to the screen: `tableView.ts` (the table, timed in original 52fps frames) and `screens.ts`
  (title, game mode, select, record, credit, tournament results). `src/main.ts` runs the cash game and tournament loops.
- `src/ui/scoreboard.ts` is the Tab standings overlay.
- `src/ui/` holds the stage (400×300, zoomed to fit), sprite-frame playback, and the table pieces.
- `public/ui/` contains the original UI art and sounds. Regenerate them with `npm run extract-ui` (needs JPEXS `ffdec`).
- `tools/simulate.ts` runs thousands of headless cash games (1-5 opponents) and tournaments to check the rules
  (coins conserved, bet caps, split pots, table balancing, places and prizes) and compare AIs:
  `npx tsx tools/simulate.ts 3000 --tournaments=60` (add `--original` for the SWF's own cast).
- `tools/import-characters.py` was the one-time importer from `../sprites/` for the first 15, and
  `tools/import-extras.py` for the 52 from the 2017 doc's Extras list (Rumia through Hecatia, plus Lunasa). Their
  expressions were picked from `../extracted/` into `../sprites/` (listed in `../sprites/picks.txt`). Edit the JSON files
  directly now.

## Differences from the SWF

- Seven-character limit removed. The select screen shows 15 per page plus Auto, with page arrows once there are more.
- Records are keyed by character id in localStorage instead of fixed 8-slot arrays. They also track 5th/6th places
  and tournaments (a Tournament page after the Ranking pages). The Ranking pages order everyone by net coins (the
  SWF used average place) and count tournaments as games. Rank is still the average cash-game place.
- One to five opponents instead of three. The original three-seat layout is kept exactly; other sizes spread the same
  pieces across the top and shrink the close-up banners to fit their rows.
- Cash games last a set number of rounds (10-50).
- Exactly tied hands at showdown split the pot (odd coins go to the winners nearest the opener's left). The SWF's check
  fell through to seat 3, even if seat 3 had the worse hand. In practice ties almost never happen, because the
  original scoring breaks ties by suit.
- Six seats can swap more cards than the deck holds; the discards are then reshuffled into the deck.
- A tournament player who can't cover the ante is all in for what they have and sits out the betting; side pots
  make sure they can only win what they matched. The SWF's raise cap (nobody bets past what the poorest seat could pay)
  is otherwise unchanged.
- "Quality" switches image smoothing.
