// Headless check of the ported rules: plays many cash games (1-5 opponents) and tournaments with every seat
// on autopilot, checking that coins are conserved and the betting stays within its limits.
// Usage: npx tsx tools/simulate.ts [matches] [--original] [--tournaments=N]
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseBet, chooseHolds } from '../src/engine/ai';
import { evaluate } from '../src/engine/hand';
import { type MatchView, type Seat, cashTable, live, newStats, playMatch, settle } from '../src/engine/match';
import { BREAKING_NAMES, type Breaking, DEFAULT_TOURNAMENT, Tournament, payoutTable } from '../src/engine/tournament';
import type { CharacterData } from '../src/engine/types';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'characters');
// --original plays the SWF's own seven characters instead, to compare against the source game.
const ORIGINAL: [string, number[], number[], number, 1 | 2 | 3, 1 | 2 | 3, 1 | 2 | 3, boolean][] = [
  ['sii', [0, 3, 4, 7, 7, 8, 9, 9, 9, 9, 9, 9], [0, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9], 55, 1, 1, 3, false],
  ['morara', [0, 2, 4, 7, 7, 8, 9, 9, 9, 9, 9, 9], [0, 2, 3, 5, 6, 7, 8, 9, 9, 9, 9, 9], 70, 2, 3, 3, false],
  ['giko', [0, 4, 5, 7, 7, 8, 9, 9, 9, 9, 9, 9], [0, 2, 4, 5, 7, 8, 9, 9, 9, 9, 9, 9], 80, 1, 3, 1, false],
  ['shin', [0, 3, 5, 6, 7, 7, 8, 9, 9, 9, 9, 9], [0, 3, 4, 5, 5, 6, 7, 7, 7, 7, 7, 7], 70, 3, 2, 1, true],
  ['fun', [0, 3, 5, 7, 7, 8, 9, 9, 9, 9, 9, 9], [0, 2, 4, 5, 6, 7, 8, 9, 9, 9, 9, 9], 75, 2, 3, 3, false],
  ['zu', [0, 3, 4, 7, 7, 8, 9, 9, 9, 9, 9, 9], [0, 2, 3, 4, 6, 7, 8, 9, 9, 9, 9, 9], 60, 1, 3, 3, false],
  ['syobo', [0, 2, 3, 6, 7, 8, 9, 9, 9, 9, 9, 9], [0, 1, 2, 4, 7, 8, 9, 9, 9, 9, 9, 9], 65, 3, 1, 2, false],
];
const cast: CharacterData[] = process.argv.includes('--original')
  ? ORIGINAL.map(([id, callMax, raiseMax, raiseAvg, changeType, bluffType, reading, randomBetting]) => ({
      id, name: id, fullName: id, look: {} as CharacterData['look'], lines: {} as CharacterData['lines'],
      ai: { callMax, raiseMax, raiseAvg, changeType, bluffType, reading, randomBetting, tell: { when: 'never', chance: 0, reveals: 0 } },
    }))
  : readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => JSON.parse(readFileSync(join(dir, d.name, 'character.json'), 'utf8')));

// The player seat copies a middle-of-the-road AI so matches run unattended.
const autopilot = (cast.find((c) => c.id === 'reimu') ?? cast[0]).ai;
let seatsRef: Seat[] = [];
let ante = 1;
let lastRate = 1;
/** Coins at the table, including what's in the pot. */
let tableTotal = 0;
const total = (seats: Seat[]) => seats.reduce((n, s) => n + s.coins + s.paid, 0);
const fail = (msg: string) => {
  throw new Error(msg);
};
const check = (seats: Seat[], where: string) => {
  if (total(seats) !== tableTotal) fail(`${where}: coins + pot ${total(seats)} != ${tableTotal}`);
  for (const s of seats) if (s.coins < 0) fail(`${where}: seat ${s.index} has ${s.coins} coins`);
  for (const s of seats) if (!s.busted && !s.allIn && s.paid !== s.bet * ante) fail(`${where}: seat ${s.index} paid ${s.paid} for level ${s.bet}`);
};
const rateNow = () => Math.max(...seatsRef.map((s) => s.bet));
/** Seats that were already all in before the current action. */
let allInBefore = new Set<Seat>();
const betChecks = (seat: Seat, raised: boolean) => {
  if (allInBefore.has(seat)) fail(`all-in seat ${seat.index} acted`);
  if (rateNow() > 7) fail(`seat ${seat.index} raised to ${rateNow()}`);
  // Raising takes the full amount; only calling can go all in short.
  if (raised && seat.paid !== seat.bet * ante) fail(`seat ${seat.index} raised to ${seat.bet} without paying for it`);
  for (const s of seatsRef) if (s.allIn && !s.busted && s.coins !== 0 && s.paid >= ante) fail(`seat ${s.index} all in with ${s.coins} left`);
  if (seat.allIn) allInBefore.add(seat);
  if (seat.allIn && !raised) shortCalls++;
};
let shortCalls = 0;

const view: MatchView = {
  async seated() {},
  async roundStart(_r, seats, a) {
    seatsRef = seats;
    ante = a;
    tableTotal = total(seats);
    check(seats, 'round start');
    lastRate = 1;
    allInBefore = new Set(seats.filter((s) => s.allIn));
    for (const s of seats) if (!s.busted && s.allIn !== (s.paid < a || s.coins === 0)) fail(`seat ${s.index} all-in flag wrong`);
  },
  async dealPlayer() {}, async sortPlayer() {},
  async dealOpponents(seats) {
    const cards = seats.filter((s) => !s.busted).flatMap((s) => s.hand);
    if (new Set(cards).size !== cards.length) fail('duplicate card dealt');
  },
  async opponentSwap() {},
  async askHolds(hand) { return chooseHolds(hand, autopilot); },
  async playerSwap(hand) { if (new Set(hand).size !== 5) fail('duplicate card in player hand'); },
  async betRoundStart(seats) {
    const cards = seats.filter((s) => !s.busted).flatMap((s) => s.hand);
    if (new Set(cards).size !== cards.length) fail('duplicate card after the swap');
  },
  async opponentBet(seat, action) {
    check(seatsRef, `bet seat ${seat.index}`);
    const rate = rateNow();
    betChecks(seat, action >= 2);
    if (action >= 2 && rate - lastRate !== action - 1) fail(`seat ${seat.index} action ${action} moved the bet ${lastRate} -> ${rate}`);
    lastRate = rate;
  },
  async askBet(options, seats, rate) {
    const me = seats.find((s) => s.human)!;
    const { action } = chooseBet(autopilot, {
      seat: me.index, score: me.score, rate, maxRate: Math.max(rate, Math.min(7, me.bet + Math.floor(me.coins / ante))), raiser: -1, bet: seats.map((s) => s.bet), dropped: seats.map((s) => s.dropped),
      busted: seats.map((s) => s.busted), allHold: seats.map(() => false), faceDown: seats.map(() => 0), bluffing: false,
    });
    const want = (['drop', 'call', 'raise', 'raise2'] as const)[action];
    return options.includes(want) ? want : options.includes('call') ? 'call' : options[0];
  },
  async playerBet(seat) {
    check(seatsRef, 'player bet');
    betChecks(seat, rateNow() > lastRate);
    lastRate = rateNow();
  },
  async betRoundEnd(seats) {
    const top = Math.max(...seats.filter((x) => !x.dropped && !x.allIn).map((x) => x.bet), 1);
    for (const s of seats) if (!s.dropped && !s.allIn && s.bet !== top) fail('unequal bets at showdown');
    for (const s of seats) if (!s.busted && s.score !== evaluate([...s.hand].sort())) fail('stale score');
  },
  async showdownStart() {}, async reveal() {}, async awaitMatch() {},
  async roundWinner(w) { if (w.some((s) => s.dropped)) fail('a folded seat won'); },
  async payout(_w, won, seats) {
    if (won.reduce((a, b) => a + b, 0) !== seats.reduce((n, s) => n + s.paid, 0)) fail('payout does not match the pot');
    if (seats.reduce((n, s) => n + s.coins, 0) !== tableTotal) fail(`after payout ${total(seats)} coins`);
  },
  async busted() {}, async gameSet() {},
};

// Split pots: a three-way tie with a short all-in and a folded seat.
{
  const mk = (index: number, paid: number, score: number, dropped = false) => ({ index, paid, score, dropped }) as Seat;
  const won = settle([mk(0, 2, 5), mk(1, 6, 5), mk(2, 6, 5), mk(3, 6, 9, true), mk(4, 5, 1)], 0);
  // Main pot (2 x 5 = 10) splits three ways, 4/3/3 with the odd coin to the opener; the side pots (3 x 4 = 12,
  // then 1 x 3 = 3) split between seats 1 and 2, the odd coin to seat 1.
  if (won.join() !== '4,11,10,0,0') fail(`split pot gave ${won}`);
}

const matches = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 3000);
const stats = new Map<string, { games: number; rankSum: number; firsts: number; coins: number }>();
let rounds = 0;
for (let m = 0; m < matches; m++) {
  const pool = [...cast].sort(() => Math.random() - 0.5).slice(0, 1 + (m % 5));
  const result = await playMatch(cashTable(pool), view, { rounds: 10 + (m % 41) });
  rounds += result.rounds;
  if (result.rounds > result.roundLimit) fail('played past the round limit');
  pool.forEach((c, i) => {
    const s = stats.get(c.id) ?? { games: 0, rankSum: 0, firsts: 0, coins: 0 };
    s.games++;
    s.rankSum += result.places[i + 1];
    if (result.places[i + 1] === 1) s.firsts++;
    s.coins += result.coins[i + 1] - 20;
    stats.set(c.id, s);
  });
}
console.log(`${matches} cash games (1-5 opponents, 10-50 rounds), avg ${(rounds / matches).toFixed(1)} rounds, all invariants held, ${shortCalls} short all-in calls\n`);
console.log('character   avg place  1st%   avg coins');
[...stats].sort((a, b) => a[1].rankSum / a[1].games - b[1].rankSum / b[1].games).forEach(([id, s]) =>
  console.log(`${id.padEnd(10)}  ${(s.rankSum / s.games).toFixed(2)}      ${((100 * s.firsts) / s.games).toFixed(0).padStart(3)}%   ${(s.coins / s.games).toFixed(1).padStart(6)}`));

// --- Tournaments.
const tournaments = Number(process.argv.find((a) => a.startsWith('--tournaments='))?.split('=')[1] ?? 60);
const modes = Object.keys(BREAKING_NAMES) as Breaking[];
for (const breaking of modes) {
  let totalRounds = 0;
  let humanRounds = 0;
  for (let k = 0; k < tournaments / modes.length; k++) {
    const opponents = [...cast].sort(() => Math.random() - 0.5).slice(0, Math.min(cast.length, 5 + (k % 12)));
    const tableSize = 3 + (k % 4);
    // Every fifth one the player only watches.
    const spectate = k % 5 === 4;
    const t = new Tournament({ ...DEFAULT_TOURNAMENT, breaking, tableSize, spectate, entrants: opponents.length + (spectate ? 0 : 1) }, opponents);
    if (t.entries.length !== t.config.entrants || !t.human !== spectate) fail('wrong field');
    const chips = t.entries.length * t.config.startStack;
    const pstats = newStats();
    while (!t.done) {
      const mine = t.human && !t.human.place ? t.human.seat : null;
      const table = mine ? t.tables.find((x) => x.seats.includes(mine))! : t.tables[0];
      await t.playRound(table, view, pstats);
      if (t.human && !t.human.place) humanRounds++;
      t.rebalance();
      const inPlay = t.tables.flatMap((x) => x.seats).filter((s) => !s.vacant && !s.busted);
      if (inPlay.length !== Math.max(1, t.alive.length)) fail(`${t.alive.length} alive but ${inPlay.length} seated`);
      if (inPlay.reduce((n, s) => n + s.coins, 0) !== chips) fail('tournament chips not conserved');
      if (t.tables.length > 1 && t.tables.some((x) => live(x.seats).length < 2)) fail('a table was left with one player');
      for (const x of t.tables) if (x.seats.length !== tableSize) fail('table changed size');
      if (breaking === 'balanced') {
        const counts = t.tables.map((x) => live(x.seats).length);
        if (Math.max(...counts) - Math.min(...counts) > 1) fail(`unbalanced tables ${counts}`);
        if (t.tables.length > Math.ceil(Math.max(1, t.alive.length) / tableSize)) fail('a table should have been broken');
      }
      if (t.round > 5000) fail('tournament never ended');
    }
    const places = t.entries.map((e) => e.place).sort((a, b) => a - b);
    if (places.join() !== t.entries.map((_, i) => i + 1).join()) fail(`places ${places}`);
    const pool = t.entries.length * 20;
    if (t.entries.reduce((n, e) => n + e.prize, 0) !== pool) fail('prizes do not add up to the pool');
    totalRounds += t.round;
  }
  console.log(`\n${tournaments / modes.length} tournaments, ${BREAKING_NAMES[breaking]}: avg ${(totalRounds / (tournaments / modes.length)).toFixed(0)} rounds, the player lasted ${(humanRounds / (tournaments / modes.length)).toFixed(0)}`);
}
console.log('\npayouts, 16 entrants at 20%:', payoutTable(16, 20).join(' / '), ' 40 at 15%:', payoutTable(40, 15).join(' / '));
