import { type Character, characters } from './characters';
import { cashTable, live, newStats, ordinal, playMatch, type Seat, type Table } from './engine/match';
import { Tournament, type TournamentConfig } from './engine/tournament';
import { handName } from './engine/hand';
import { player } from './player';
import { recordMatch, recordTournament } from './save';
import { TableView, seatName } from './game/tableView';
import { bustDialog, creditScreen, fade, modeScreen, recordScreen, selectScreen, titleScreen, tournamentResults } from './game/screens';
import { preloadImages } from './ui/portrait';
import { loadUi, setSfxMuted, stopBgm } from './ui/assets';
import { RankTracker, type ScoreRow, installScoreboard } from './ui/scoreboard';
import { createStage, timing } from './ui/stage';
import './style.css';

const stage = createStage(document.getElementById('app')!);

const art = (cast: Character[]) =>
  preloadImages(cast.flatMap((c) => [...Object.values(c.art), ...Object.values(c.companionArt ?? {})]));

async function playCash(opponents: Character[], rounds: number): Promise<void> {
  const seats = cashTable(opponents);
  let table!: TableView;
  // Standings as each round starts (the ante counts as still theirs), for the board's arrows.
  const ranks = new RankTracker();
  const key = (s: Seat) => s.character?.id ?? 'you';
  const track = () => ranks.update(seats.map((s) => [key(s), s.busted ? -1 : s.coins + s.paid]));
  track();
  await fade(stage, async () => {
    await art(opponents);
    table = new TableView(stage, seats, { roundLimit: rounds, onRound: track });
  });
  const removeBoard = installScoreboard(stage, () => ({
    title: 'Cash Game',
    info: [`Round ${table.round || 1} of ${rounds}`],
    rows: [...seats].sort((a, b) => b.coins + b.paid - (a.coins + a.paid)).map((s, i): ScoreRow => ({
      rank: i + 1, character: s.character as Character | null, name: seatName(s), me: s.human,
      value: s.busted ? 'OUT' : String(s.coins), out: s.busted, move: s.busted ? undefined : ranks.move(key(s)),
    })),
  }));
  const result = await playMatch(seats, table, { rounds });
  removeBoard();
  recordMatch(opponents.map((c) => c.id), result);
  await fade(stage, () => table.destroy());
}

/** Spectating speed (x1 = normal), kept between tournaments this session. */
let watchSpeed = 1;

async function playTournament(config: TournamentConfig, field: Character[]): Promise<void> {
  const t = new Tournament(config, field);
  const stats = newStats();
  const multi = t.tables.length > 1;
  const me = t.human;
  let featured: Table = me?.table ?? t.tables[0];
  let spectating = !me;
  let skip = false;
  let view!: TableView;
  const speed = timing.speed;
  const onSkip = () => {
    skip = true;
    fastForward(); // through the round on screen
  };
  // A spectator's pick of table, taken up after the round on screen.
  let wanted: Table | null = null;
  const playing = () => t.tables.filter((x) => live(x.seats).length >= 2).sort((a, b) => a.id - b.id);
  const caption = (table: Table) => `Spectating${multi ? ` Table ${table.id}` : ''}${me ? `  (you finished ${ordinal(me.place)})` : ''}`;
  // Spectators set their own pace; it never carries over to playing.
  const watchPace = () => {
    timing.speed = speed * watchSpeed;
    setSfxMuted(false);
  };
  // Fast-forwarding (to another table, or out of spectating) runs silently.
  const fastForward = () => {
    timing.speed = 1000;
    setSfxMuted(true);
  };
  // Switching tables: the hand on screen finishes at full speed, then the view moves.
  const onSwitch = (dir: -1 | 1): string => {
    const tables = playing();
    const from = tables.indexOf(wanted ?? featured);
    wanted = tables[(from + dir + tables.length) % tables.length] ?? featured;
    if (wanted === featured) {
      wanted = null;
      watchPace();
      return caption(featured);
    }
    fastForward();
    return `${caption(featured)}\nGoing to Table ${wanted.id}...`;
  };
  const onSpeed = (v: number) => {
    watchSpeed = v;
    if (!wanted && !skip) watchPace();
  };
  const open = (table: Table) => {
    view = new TableView(stage, table.seats, spectating
      ? { onSkip, onSwitch: playing().length > 1 ? onSwitch : undefined, caption: caption(table), speed: { value: watchSpeed, onChange: onSpeed } }
      : {});
  };
  await fade(stage, async () => {
    await art(field);
    open(featured);
  });

  // Standings after each round, for the board's arrows (out players rank by finishing place).
  const ranks = new RankTracker();
  const track = () => ranks.update(t.entries.map((e) => [e.character?.id ?? 'you', e.place ? -e.place : e.seat.coins]));
  track();
  const removeBoard = installScoreboard(stage, () => {
    const left = t.alive.length;
    return {
      title: `Tournament  Round ${Math.max(1, t.round)}`,
      info: [`Ante ${t.ante}, up in ${t.roundsToAnteUp}`, `${left || 1} of ${t.entries.length} left, ${t.prizes.length} paid`],
      rows: t.standings().map((e, i): ScoreRow => ({
        rank: e.place || i + 1, character: e.character as Character | null, name: e.character?.name ?? player.name,
        me: !e.character, out: e.place > 0 && left > 0,
        value: e.place && left > 0 ? (e.prize ? `+${e.prize}` : 'OUT') : String(e.seat.coins),
        note: !e.place && multi ? `T${e.table?.id}` : undefined,
        move: e.place ? undefined : ranks.move(e.character?.id ?? 'you'),
      })),
    };
  });

  const others = (table: Table): Seat[] => live(table.seats).filter((s) => !s.human);
  if (spectating) watchPace();
  if (multi) await view.announce(`Table ${featured.id}`);
  await view.seated(others(featured), featured.seats);

  while (!t.done && !skip) {
    const tableOf = new Map(t.alive.map((e) => [e, e.table?.id ?? 0]));
    const out = await t.playRound(featured, view, me && !me.place ? stats : null);
    track();
    // Spectators hear about everyone who goes out, not just at the table on screen.
    if (spectating && !skip) {
      for (const e of [...out].sort((a, b) => b.place - a.place)) {
        if (e.character && tableOf.get(e) !== featured.id) await view.bustedElsewhere(e.character as Character, e.place, tableOf.get(e)!);
      }
    }
    if (t.done || skip) break;
    if (me?.place && !spectating) {
      const prize = me.prize ? ` and won ${me.prize} coins` : '';
      const choice = await bustDialog(stage, `You finished ${ordinal(me.place)} of ${t.entries.length}${prize}.\n${t.alive.length} players are still in.`);
      if (choice === 'skip') {
        skip = true;
        break;
      }
      spectating = true;
    }
    if (spectating) watchPace();
    const moves = t.rebalance();
    // Follow the player; spectators stay at their table until it breaks, then watch the chip leader's.
    const chosen = spectating && wanted !== null && t.tables.includes(wanted);
    const next = !spectating ? me!.table!
      : chosen ? wanted!
      : t.tables.includes(featured) ? featured
      : t.standings()[0].table!;
    wanted = null;
    if (next !== featured || (spectating && view.hasPlayer)) {
      featured = next;
      await fade(stage, () => {
        view.destroy(true);
        open(featured);
      });
      // A new table gets its intro (spectators too, when a break moves them); a table picked with ◀ ▶ just its name.
      if (multi) await view.announce(`Table ${featured.id}`);
      await view.seated(chosen ? [] : others(featured), featured.seats);
    } else {
      const joined = moves.filter((m) => m.to === featured).map((m) => m.entry.seat);
      if (joined.length || moves.some((m) => m.from === featured)) await view.seated(joined, featured.seats);
    }
  }

  if (skip) {
    await fade(stage, async () => {
      view.destroy();
      await t.finish();
    });
  } else {
    if (spectating) watchPace(); // a table switch may have left the last hand fast-forwarding
    const champion = t.entries.find((e) => e.place === 1)!;
    const winnerSeat = featured.seats.indexOf(champion.seat);
    await view.gameSet({
      winner: winnerSeat >= 0 ? winnerSeat : 0,
      champions: new Set([winnerSeat]),
      ...(me ? {
        left: [['Ranking', `${ordinal(me.place)}/${t.entries.length}`], ['Prize', me.prize], ['Round', t.round],
          ['BestHand', `"${handName(stats.bestHand)}"`]],
        right: [['Win', stats.wins], ['Lose', stats.losses], ['Drop', stats.drops]],
      } : {
        // Only watching: the champion's result instead of the player's.
        left: [['Winner', champion.character!.name], ['Prize', champion.prize], ['Round', t.round]],
        right: [['Players', t.entries.length]],
      }),
      won: me?.place === 1,
    }, featured.seats);
    await fade(stage, () => view.destroy());
  }
  timing.speed = speed;
  setSfxMuted(false);
  removeBoard();
  recordTournament(t, stats);
  await tournamentResults(stage, t);
  stopBgm();
}

async function run(): Promise<never> {
  await loadUi();
  while (true) {
    const choice = await titleScreen(stage);
    if (choice === 'credit') {
      await creditScreen(stage);
    } else if (choice === 'record') {
      await recordScreen(stage);
    } else {
      const setup = await modeScreen(stage);
      if (!setup) continue;
      if (setup.mode === 'cash') {
        const opponents = await selectScreen(stage, setup.cash.opponents);
        await playCash(opponents, setup.cash.rounds);
      } else {
        // Pick the field (Auto fills the rest at random); with the whole cast entered there's nothing to pick.
        const others = setup.tournament.entrants - (setup.tournament.spectate ? 0 : 1);
        const field = others < characters.length ? await selectScreen(stage, others, setup.tournament.spectate ? 'player' : 'opponent') : [...characters];
        await playTournament(setup.tournament, field);
      }
    }
  }
}

run();
