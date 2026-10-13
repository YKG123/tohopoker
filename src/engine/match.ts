// Round flow ported from the SWF main timeline (frames 109-1155), generalized from four seats to any table
// size. All presentation goes through MatchView so the rules can also run headless.
// A cash game is a series of rounds at one table (playMatch); tournaments (tournament.ts) run many tables
// round by round with playRound.
import { chooseBet, chooseHolds, rollTell, suggestHolds, type BetAction } from './ai';
import { type Card, newDeck, shuffle, sortHand } from './cards';
import { evaluate, handName } from './hand';
import type { CharacterData } from './types';

export const START_COINS = 20;
export const TOP_RATE = 7;
export const MAX_SEATS = 6;
export const DEFAULT_ROUNDS = 30;

export interface Seat {
  index: number;
  /** null = the human player (or nobody, for a vacant seat). */
  character: CharacterData | null;
  human: boolean;
  /** Nobody sits here (tournament tables keep their size as players bust or move). */
  vacant: boolean;
  coins: number;
  hand: Card[];
  score: number;
  /** Bet level this round (1-7). Each level costs one ante. */
  bet: number;
  /** Coins put in the pot this round. */
  paid: number;
  /** Couldn't cover the ante: in for what they had, sits out the betting. */
  allIn: boolean;
  dropped: boolean;
  /** Out of this table's play: broke, or a vacant seat. */
  busted: boolean;
  bustRank: number;
  /** Cards kept in the swap; 5 = stood pat. */
  holdCount: number;
  faceDown: number;
  bluffing: boolean;
}

export type PlayerBet = 'raise2' | 'raise' | 'call' | 'drop';

export function newSeat(index: number, character: CharacterData | null, coins: number): Seat {
  return {
    index, character, human: character === null, vacant: false, coins, hand: [], score: 0, bet: 0, paid: 0, allIn: false,
    dropped: false, busted: false, bustRank: 0, holdCount: 0, faceDown: 0, bluffing: false,
  };
}

export function vacantSeat(index: number): Seat {
  return { ...newSeat(index, null, 0), human: false, vacant: true, busted: true, dropped: true };
}

/** The human's running tallies for the records. */
export interface PlayerStats {
  bestHand: number;
  wins: number;
  losses: number;
  drops: number;
  /** How many times the player was dealt each hand category (after swapping). */
  handCounts: number[];
}

export const newStats = (): PlayerStats => ({ bestHand: 0, wins: 0, losses: 0, drops: 0, handCounts: Array(12).fill(0) });

export interface MatchResult extends PlayerStats {
  /** Finishing place (1 = best) per seat. */
  places: number[];
  winner: number;
  /** Coins per seat at the end. */
  coins: number[];
  rounds: number;
  /** The scheduled length (the match can end sooner if only one player is left). */
  roundLimit: number;
}

/** What the end-of-game screen shows. */
export interface GameSummary {
  /** Seat index of the winner at this table. */
  winner: number;
  /** Seats that finished first here (shown cheering). */
  champions: Set<number>;
  /** Two label/value columns of the result board. */
  left: [string, string | number][];
  right: [string, string | number][];
  /** The human's result for the win/lose jingle. */
  won: boolean;
}

export interface Table {
  id: number;
  seats: Seat[];
  /** Seat that opened the last round. */
  father: number;
  round: number;
  ante: number;
}

export interface MatchView {
  /** `joined` just sat down (everyone at the start; later arrivals one at a time). */
  seated(joined: Seat[], seats: Seat[]): Promise<void>;
  roundStart(round: number, seats: Seat[], ante: number): Promise<void>;
  dealPlayer(hand: Card[]): Promise<void>;
  sortPlayer(hand: Card[]): Promise<void>;
  dealOpponents(seats: Seat[]): Promise<void>;
  opponentSwap(seat: Seat, swapped: number, tell: boolean): Promise<void>;
  askHolds(hand: Card[], hint: boolean[]): Promise<boolean[]>;
  playerSwap(hand: Card[], holds: boolean[]): Promise<void>;
  /** Seats that sit in banner rows above the opener wait ("……"). */
  betRoundStart(seats: Seat[], opener: number): Promise<void>;
  opponentBet(seat: Seat, action: BetAction): Promise<void>;
  /** `allIn`: calling takes every coin the player has (the Call button says so). */
  askBet(options: PlayerBet[], seats: Seat[], rate: number, allIn: boolean): Promise<PlayerBet>;
  playerBet(seat: Seat, action: PlayerBet): Promise<void>;
  betRoundEnd(seats: Seat[]): Promise<void>;
  showdownStart(): Promise<void>;
  reveal(seat: Seat): Promise<void>;
  /** Waits for the player to continue after the reveal. */
  awaitMatch(): Promise<void>;
  /** `winners` has more than one seat when tied hands split the pot. */
  roundWinner(winners: Seat[], seats: Seat[], allFolded: boolean): Promise<void>;
  /** `won[i]` is what seat i took from the pot (split pots and side pots included). */
  payout(winners: Seat[], won: number[], seats: Seat[]): Promise<void>;
  /** `out` went broke this round; `places` are their finishing places. */
  busted(seats: Seat[], out: Seat[], places: number[]): Promise<void>;
  gameSet(summary: GameSummary, seats: Seat[]): Promise<void>;
}

/** A view that shows nothing: tables nobody is watching. Never asked for a human's decision. */
export const headlessView: MatchView = {
  async seated() {}, async roundStart() {}, async dealPlayer() {}, async sortPlayer() {}, async dealOpponents() {},
  async opponentSwap() {}, async askHolds(hand) { return suggestHolds(hand); }, async playerSwap() {},
  async betRoundStart() {}, async opponentBet() {}, async askBet() { return 'call'; }, async playerBet() {},
  async betRoundEnd() {}, async showdownStart() {}, async reveal() {}, async awaitMatch() {}, async roundWinner() {},
  async payout() {}, async busted() {}, async gameSet() {},
};

export const live = (seats: Seat[]): Seat[] => seats.filter((s) => !s.busted);

/**
 * Splits the pot. Each layer of contributions goes to the best hand that put in at least that much
 * (so a short stack who was all-in for the ante can only win what they matched); exactly tied hands split
 * a layer evenly, odd coins going to the winners nearest the opener's left.
 */
export function settle(seats: Seat[], father: number): number[] {
  const n = seats.length;
  const won = Array(n).fill(0);
  const order = seats.map((_, i) => seats[(father + i) % n]);
  const levels = [...new Set(seats.map((s) => s.paid).filter((p) => p > 0))].sort((a, b) => a - b);
  let prev = 0;
  for (const level of levels) {
    const payers = order.filter((s) => s.paid >= level);
    let amount = (level - prev) * payers.length;
    prev = level;
    const contenders = payers.filter((s) => !s.dropped);
    // Nobody left in at this level (everyone in it folded): the coins go back to whoever put them in.
    const eligible = contenders.length ? contenders : payers;
    const best = Math.max(...eligible.map((s) => (contenders.length ? s.score : 0)));
    const winners = eligible.filter((s) => (contenders.length ? s.score : 0) === best);
    const share = Math.floor(amount / winners.length);
    for (const w of winners) {
      won[w.index] += share;
      amount -= share;
    }
    for (let i = 0; amount > 0; i++, amount--) won[winners[i].index]++;
  }
  return won;
}

/**
 * One round at a table: ante, deal, swap, bet, showdown, payout. Returns the seats that went broke,
 * after telling the view; finishing places are left to the caller (`placeOf`).
 */
export async function playRound(
  table: Table, view: MatchView, random: () => number, stats: PlayerStats | null,
  placeOf: (out: Seat[]) => number[],
): Promise<Seat[]> {
  const { seats, ante } = table;
  const n = seats.length;
  const next = (i: number) => (i + 1) % n;
  const human = seats.find((s) => s.human && !s.busted);

  // --- Round setup (frame 132): rotate the opener, take the ante.
  table.round++;
  let father = next(table.father);
  while (seats[father].busted) father = next(father);
  table.father = father;
  let raiser = father;
  let rate = 1;
  const allHold = seats.map(() => false);
  for (const s of seats) {
    Object.assign(s, { dropped: s.busted, bet: 0, paid: 0, allIn: false, holdCount: 0, faceDown: 0, bluffing: false, hand: [], score: 0 });
    if (s.busted) continue;
    s.bet = 1;
    s.paid = Math.min(ante, s.coins);
    s.coins -= s.paid;
    s.allIn = s.paid < ante || s.coins === 0;
  }
  await view.roundStart(table.round, seats, ante);

  // --- Deal (frames 145-166). Six seats can swap more cards than the deck holds: then the discards are reshuffled.
  const deck = shuffle(newDeck(), random);
  const discards: Card[] = [];
  const draw = (): Card => {
    if (!deck.length) deck.push(...shuffle(discards.splice(0), random));
    return deck.pop()!;
  };
  for (const s of seats) if (!s.busted) s.hand = Array.from({ length: 5 }, draw);
  if (human) {
    await view.dealPlayer(human.hand);
    sortHand(human.hand);
    await view.sortPlayer(human.hand);
  }
  for (const s of seats) if (!s.busted && !s.human) sortHand(s.hand);
  await view.dealOpponents(seats);

  // --- Card swap, starting with the opener (frames 179-295).
  let turn = father;
  do {
    const s = seats[turn];
    if (!s.busted) {
      if (s.character) {
        const holds = chooseHolds(s.hand, s.character.ai, random);
        s.holdCount = holds.filter(Boolean).length;
        if (s.holdCount < 5) {
          s.hand.forEach((c, i) => !holds[i] && discards.push(c));
          s.hand = sortHand(s.hand.map((c, i) => (holds[i] ? c : draw())));
        } else {
          allHold[turn] = true;
        }
        s.score = evaluate(s.hand);
        const tell = rollTell(s.character.ai, s.score, random);
        if (tell) s.faceDown = s.character.ai.tell.reveals;
        await view.opponentSwap(s, 5 - s.holdCount, tell);
      } else {
        const holds = await view.askHolds(s.hand, suggestHolds(s.hand));
        if (holds.every(Boolean)) allHold[turn] = true;
        s.holdCount = holds.filter(Boolean).length;
        s.hand.forEach((c, i) => !holds[i] && discards.push(c));
        s.hand = s.hand.map((c, i) => (holds[i] ? c : draw()));
        await view.playerSwap(s.hand, holds);
        sortHand(s.hand);
        s.score = evaluate(s.hand);
      }
    }
    turn = next(turn);
  } while (turn !== father);

  // --- Bet round (frames 297-456).
  if (human && stats) {
    stats.handCounts[Math.floor(human.score)]++;
    stats.bestHand = Math.max(stats.bestHand, human.score);
  }
  if (human && human.score >= 5 && Math.floor(random() * 100) + 1 >= 75) human.faceDown = 5; // the player's own tell
  await view.betRoundStart(seats, raiser);

  // Calling more than you have puts you all in, for what you have; side pots sort it out at the showdown.
  const pay = (s: Seat) => {
    const cost = Math.min(s.coins, (rate - s.bet) * ante);
    s.coins -= cost;
    s.paid += cost;
    s.bet = rate;
    if (s.coins === 0) s.allIn = true;
  };
  // The SWF capped everyone's raises at what the poorest seat could pay (its MaxRate). With side pots, a seat
  // can raise as far as it can pay itself, and not at all once nobody is left who could answer.
  const maxRateFor = (s: Seat): number => {
    const answerable = seats.some((x) => x !== s && !x.dropped && !x.allIn);
    return answerable ? Math.min(TOP_RATE, s.bet + Math.floor(s.coins / ante)) : rate;
  };
  turn = raiser;
  do {
    const s = seats[turn];
    if (!s.dropped && !s.allIn) {
      if (s.character) {
        const { action, bluffing } = chooseBet(s.character.ai, {
          seat: turn, score: s.score, rate, maxRate: Math.max(rate, maxRateFor(s)), raiser,
          bet: seats.map((x) => x.bet), dropped: seats.map((x) => x.dropped), busted: seats.map((x) => x.busted),
          allHold, faceDown: seats.map((x) => x.faceDown), bluffing: s.bluffing,
        }, random);
        s.bluffing = bluffing;
        if (action === 0) {
          s.dropped = true;
        } else {
          if (action >= 2) {
            raiser = turn;
            rate += action - 1;
          }
          pay(s);
        }
        await view.opponentBet(s, action);
      } else {
        const maxRate = maxRateFor(s);
        const options: PlayerBet[] =
          rate >= maxRate ? ['call', 'drop']
          : rate + 1 >= maxRate ? ['raise', 'call', 'drop']
          : rate === 1 ? ['raise2', 'raise', 'call']
          : ['raise2', 'raise', 'call', 'drop'];
        const choice = await view.askBet(options, seats, rate, s.coins < (rate - s.bet) * ante);
        if (choice === 'drop') {
          s.dropped = true;
        } else {
          if (choice !== 'call') {
            raiser = turn;
            rate += choice === 'raise2' ? 2 : 1;
          }
          pay(s);
        }
        await view.playerBet(s, choice);
      }
    }
    turn = next(turn);
  } while (turn !== raiser);
  await view.betRoundEnd(seats);

  // --- Showdown (frames 502-643).
  const inPlay = seats.filter((s) => !s.dropped);
  const allFolded = inPlay.length === 1;
  if (!allFolded) {
    await view.showdownStart();
    turn = father;
    do {
      if (!seats[turn].busted) await view.reveal(seats[turn]);
      turn = next(turn);
    } while (turn !== father);
    await view.awaitMatch();
  }
  // Folded seats can never win; exactly tied hands split the pot.
  const best = Math.max(...inPlay.map((s) => s.score));
  const winners = allFolded ? inPlay : inPlay.filter((s) => s.score === best);
  const won = settle(seats, father);
  if (human && stats) {
    if (winners.includes(human)) stats.wins++;
    else if (human.dropped) stats.drops++;
    else stats.losses++;
  }
  await view.roundWinner(winners, seats, allFolded);
  seats.forEach((s, i) => (s.coins += won[i]));
  await view.payout(winners, won, seats);

  // --- Busts (frame 778).
  const out = seats.filter((s) => !s.busted && s.coins < 1);
  if (out.length) {
    for (const s of out) s.busted = true;
    await view.busted(seats, out, placeOf(out));
  }
  return out;
}

export interface MatchOptions {
  /** Rounds before the game ends and the survivors are ranked by coins (10-50). */
  rounds: number;
  random?: () => number;
}

/** A cash-game table: the player in seat 0, then their picks. */
export const cashTable = (opponents: CharacterData[]): Seat[] => [null, ...opponents].map((c, i) => newSeat(i, c, START_COINS));

/** Cash game: the player and their picks at one table, for a set number of rounds or until one player is left. */
export async function playMatch(seats: Seat[], view: MatchView, opts: MatchOptions): Promise<MatchResult> {
  const random = opts.random ?? Math.random;
  const table: Table = { id: 1, seats, father: seats.length - 1, round: 0, ante: 1 };
  const stats = newStats();
  let bustSeq = 0;
  await view.seated(seats.slice(1), seats);

  while (true) {
    await playRound(table, view, random, stats, (out) => {
      bustSeq++;
      out.forEach((s) => (s.bustRank = bustSeq));
      // Everyone who busts together shares the place just below the survivors.
      return out.map(() => live(seats).length + 1);
    });
    if (seats[0].busted || live(seats).length <= 1 || table.round >= opts.rounds) break;
  }

  // --- Final ranking (frame 979): survivors by coins, then busted seats by how late they went out.
  const score = (s: Seat) => (s.busted ? s.bustRank : 1e6 + s.coins);
  const order = [...seats].sort((a, b) => score(b) - score(a) || a.index - b.index);
  const places: number[] = [];
  order.forEach((s, i) => {
    const prev = order[i - 1];
    places[s.index] = prev && score(prev) === score(s) ? places[prev.index] : i + 1;
  });
  const result: MatchResult = {
    ...stats, places, winner: order[0].index, coins: seats.map((s) => s.coins), rounds: table.round, roundLimit: opts.rounds,
  };
  const ord = ordinal(places[0]);
  await view.gameSet({
    winner: result.winner,
    champions: new Set(seats.filter((s) => places[s.index] === 1).map((s) => s.index)),
    left: [['Ranking', ord], ['Round', `${result.rounds}/${opts.rounds}`], ['Coin', seats[0].coins], ['BestHand', `"${handName(stats.bestHand)}"`]],
    right: [['Win', stats.wins], ['Lose', stats.losses], ['Drop', stats.drops]],
    won: places[0] === 1,
  }, seats);
  return result;
}

export const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};
