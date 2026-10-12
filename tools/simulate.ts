// Headless check of the ported rules: plays many matches with every seat on autopilot.
// Usage: npx tsx tools/simulate.ts [matches]
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseBet, chooseHolds } from '../src/engine/ai';
import { evaluate } from '../src/engine/hand';
import { type MatchView, type Seat, playMatch } from '../src/engine/match';
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
// Raise cap checks: the bet level may never pass what the poorest live seat can pay (the SWF's MaxRate).
let maxRate = 7;
let startCoins: number[] = [];
let lastRate = 1;
const total = (seats: Seat[]) => seats.reduce((n, s) => n + s.coins, 0);
const fail = (msg: string) => {
  throw new Error(msg);
};
const check = (seats: Seat[], where: string) => {
  // Coins in hand plus coins already bet this round always add up to the 80 dealt out.
  const pot = seats.reduce((n, s) => n + s.bet, 0);
  if (total(seats) + pot !== 80 && where !== 'after-payout') fail(`${where}: coins ${total(seats)} + pot ${pot} != 80`);
  for (const s of seats) if (s.coins < 0) fail(`${where}: seat ${s.index} has ${s.coins} coins`);
};

const view: MatchView = {
  async seated() {},
  async roundStart(_r, seats) {
    seatsRef = seats;
    check(seats, 'round start');
    maxRate = Math.min(7, ...seats.filter((s) => !s.busted).map((s) => s.coins + 1));
    startCoins = seats.map((s) => s.coins);
    lastRate = 1;
  },
  async dealPlayer() {}, async sortPlayer() {}, async dealOpponents() {},
  async opponentSwap() {},
  async askHolds(hand) { return chooseHolds(hand, autopilot); },
  async playerSwap(hand) { if (new Set(hand).size !== 5) fail('duplicate card in player hand'); },
  async betRoundStart() {}, async opponentWaits() {},
  async opponentBet(seat, action) {
    check(seatsRef, `bet seat ${seat.index}`);
    const rate = Math.max(...seatsRef.map((s) => s.bet));
    if (rate > maxRate) fail(`seat ${seat.index} raised to ${rate} but the cap was ${maxRate}`);
    if (action === 3 && startCoins[seat.index] <= 1) fail(`seat ${seat.index} raised 2 with ${startCoins[seat.index]} coin(s) left`);
    if (action >= 2 && rate - lastRate !== action - 1) fail(`seat ${seat.index} action ${action} moved the bet ${lastRate} -> ${rate}`);
    for (const s of seatsRef) if (!s.busted && s.coins + s.bet < rate) fail(`seat ${s.index} cannot afford the bet ${rate}`);
    lastRate = rate;
  },
  async askBet(options, seats, rate) {
    const me = seats[0];
    const maxRate = Math.min(7, ...seats.filter((s) => !s.busted).map((s) => s.coins + s.bet));
    const { action } = chooseBet(autopilot, {
      seat: 0, score: me.score, rate, maxRate, raiser: -1, bet: seats.map((s) => s.bet), dropped: seats.map((s) => s.dropped),
      busted: seats.map((s) => s.busted), allHold: [false, false, false, false], faceDown: [0, 0, 0, 0], bluffing: false,
    });
    const want = (['drop', 'call', 'raise', 'raise2'] as const)[action];
    return options.includes(want) ? want : options.includes('call') ? 'call' : options[0];
  },
  async playerBet(seat, action) {
    check(seatsRef, 'player bet');
    const rate = Math.max(...seatsRef.map((s) => s.bet));
    if (rate > maxRate) fail(`player raised to ${rate} but the cap was ${maxRate}`);
    if (action === 'raise2' && startCoins[seat.index] <= 1) fail('player raised 2 with 1 coin left');
    lastRate = rate;
  },
  async betRoundEnd(seats) {
    for (const s of seats) if (!s.dropped && s.bet !== Math.max(...seats.filter((x) => !x.dropped).map((x) => x.bet))) fail('unequal bets at showdown');
    for (const s of seats) if (!s.busted && s.score !== evaluate([...s.hand].sort())) fail('stale score');
  },
  async showdownStart() {}, async reveal() {}, async awaitMatch() {},
  async roundWinner(w) { if (w.dropped) fail('a folded seat won'); },
  async payout(_w, _pot, seats) { if (total(seats) !== 80) fail(`after payout ${total(seats)} coins`); },
  async busted() {}, async gameSet() {},
};

const matches = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 3000);
const stats = new Map<string, { games: number; rankSum: number; firsts: number; coins: number }>();
let rounds = 0;
for (let m = 0; m < matches; m++) {
  const pool = [...cast].sort(() => Math.random() - 0.5).slice(0, 3);
  const result = await playMatch(pool, view);
  rounds += result.rounds;
  pool.forEach((c, i) => {
    const s = stats.get(c.id) ?? { games: 0, rankSum: 0, firsts: 0, coins: 0 };
    s.games++;
    s.rankSum += result.places[i + 1];
    if (result.places[i + 1] === 1) s.firsts++;
    s.coins += result.coins[i + 1] - 20;
    stats.set(c.id, s);
  });
}
console.log(`${matches} matches, avg ${(rounds / matches).toFixed(1)} rounds, all invariants held\n`);
console.log('character   avg place  1st%   avg coins');
[...stats].sort((a, b) => a[1].rankSum / a[1].games - b[1].rankSum / b[1].games).forEach(([id, s]) =>
  console.log(`${id.padEnd(10)}  ${(s.rankSum / s.games).toFixed(2)}      ${((100 * s.firsts) / s.games).toFixed(0).padStart(3)}%   ${(s.coins / s.games).toFixed(1).padStart(6)}`));
