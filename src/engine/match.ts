// Round flow ported from the SWF main timeline (frames 109-1155). Seat 0 is the player.
// All presentation goes through MatchView so the rules can also run headless.
import { chooseBet, chooseHolds, rollTell, suggestHolds, type BetAction } from './ai';
import { type Card, newDeck, shuffle, sortHand } from './cards';
import { evaluate } from './hand';
import type { CharacterData } from './types';

export const START_COINS = 20;
export const TOP_RATE = 7;

export interface Seat {
  index: number;
  character: CharacterData | null; // null = the player
  coins: number;
  hand: Card[];
  score: number;
  bet: number;
  dropped: boolean;
  busted: boolean;
  bustRank: number;
  /** Cards kept in the swap; 5 = stood pat. */
  holdCount: number;
  faceDown: number;
  bluffing: boolean;
}

export type PlayerBet = 'raise2' | 'raise' | 'call' | 'drop';

export interface MatchResult {
  /** Finishing place (1-4) per seat. */
  places: number[];
  winner: number;
  /** Coins per seat at the end. */
  coins: number[];
  rounds: number;
  bestHand: number;
  wins: number;
  losses: number;
  drops: number;
  /** How many times the player was dealt each hand category (after swapping). */
  handCounts: number[];
}

export interface MatchView {
  /** `joined` just sat down (everyone at the start; later arrivals one at a time). */
  seated(joined: Seat[], seats: Seat[]): Promise<void>;
  roundStart(round: number, seats: Seat[]): Promise<void>;
  dealPlayer(hand: Card[]): Promise<void>;
  sortPlayer(hand: Card[]): Promise<void>;
  dealOpponents(): Promise<void>;
  opponentSwap(seat: Seat, swapped: number, tell: boolean): Promise<void>;
  askHolds(hand: Card[], hint: boolean[]): Promise<boolean[]>;
  playerSwap(hand: Card[], holds: boolean[]): Promise<void>;
  betRoundStart(): Promise<void>;
  /** An opponent seated before the opener waits ("……"). */
  opponentWaits(seat: Seat): Promise<void>;
  opponentBet(seat: Seat, action: BetAction): Promise<void>;
  askBet(options: PlayerBet[], seats: Seat[], rate: number): Promise<PlayerBet>;
  playerBet(seat: Seat, action: PlayerBet): Promise<void>;
  betRoundEnd(seats: Seat[]): Promise<void>;
  showdownStart(): Promise<void>;
  reveal(seat: Seat): Promise<void>;
  /** Waits for the player to continue after the reveal. */
  awaitMatch(): Promise<void>;
  roundWinner(winner: Seat, seats: Seat[], allFolded: boolean): Promise<void>;
  payout(winner: Seat, pot: number, seats: Seat[]): Promise<void>;
  /** `out` went broke this round; they finish in `place` (shared if several bust together). */
  busted(seats: Seat[], out: Seat[], place: number): Promise<void>;
  gameSet(result: MatchResult, seats: Seat[]): Promise<void>;
}

export async function playMatch(opponents: CharacterData[], view: MatchView, random: () => number = Math.random): Promise<MatchResult> {
  const seats: Seat[] = [null, ...opponents].map((character, index) => ({
    index, character, coins: START_COINS, hand: [], score: 0, bet: 0, dropped: false,
    busted: false, bustRank: 0, holdCount: 0, faceDown: 0, bluffing: false,
  }));
  const player = seats[0];
  const result: MatchResult = {
    places: [], winner: 0, coins: [], rounds: 0, bestHand: 0, wins: 0, losses: 0, drops: 0, handCounts: Array(12).fill(0),
  };
  const next = (i: number) => (i + 1) % 4;
  let father = 3;
  let bustSeq = 0;
  await view.seated(seats.slice(1), seats);

  while (true) {
    // --- Round setup (frame 132): rotate the opener, take the 1-coin ante.
    result.rounds++;
    father = next(father);
    while (seats[father].busted) father = next(father);
    let raiser = father;
    let rate = 1;
    let maxRate = TOP_RATE;
    const allHold = [false, false, false, false];
    for (const s of seats) {
      Object.assign(s, { dropped: s.busted, bet: 0, holdCount: 0, faceDown: 0, bluffing: false, hand: [], score: 0 });
      if (!s.busted) {
        s.bet = 1;
        s.coins -= 1;
        maxRate = Math.min(maxRate, s.coins + 1);
      }
    }
    await view.roundStart(result.rounds, seats);

    // --- Deal (frames 145-166).
    const deck = shuffle(newDeck(), random);
    player.hand = Array.from({ length: 5 }, () => deck.pop()!);
    await view.dealPlayer(player.hand);
    sortHand(player.hand);
    await view.sortPlayer(player.hand);
    for (const s of seats.slice(1)) s.hand = sortHand(Array.from({ length: 5 }, () => deck.pop()!));
    await view.dealOpponents();

    // --- Card swap, starting with the opener (frames 179-295).
    let turn = father;
    do {
      const s = seats[turn];
      if (!s.busted) {
        if (s.character) {
          const holds = chooseHolds(s.hand, s.character.ai, random);
          s.holdCount = holds.filter(Boolean).length;
          if (s.holdCount < 5) {
            s.hand = sortHand(s.hand.map((c, i) => (holds[i] ? c : deck.pop()!)));
          } else {
            allHold[turn] = true;
          }
          s.score = evaluate(s.hand);
          const tell = rollTell(s.character.ai, s.score, random);
          if (tell) s.faceDown = s.character.ai.tell.reveals;
          await view.opponentSwap(s, 5 - s.holdCount, tell);
        } else {
          const holds = await view.askHolds(s.hand, suggestHolds(s.hand));
          if (holds.every(Boolean)) allHold[0] = true;
          s.holdCount = holds.filter(Boolean).length;
          s.hand = s.hand.map((c, i) => (holds[i] ? c : deck.pop()!));
          await view.playerSwap(s.hand, holds);
          sortHand(s.hand);
          s.score = evaluate(s.hand);
        }
      }
      turn = next(turn);
      while (seats[turn].busted && turn !== father) turn = next(turn);
    } while (turn !== father);

    // --- Bet round (frames 297-456).
    result.handCounts[Math.floor(player.score)]++;
    result.bestHand = Math.max(result.bestHand, player.score);
    if (player.score >= 5 && Math.floor(random() * 100) + 1 >= 75) player.faceDown = 5; // the player's own tell
    await view.betRoundStart();

    const pay = (s: Seat) => {
      s.coins -= rate - s.bet;
      s.bet = rate;
    };
    if (raiser !== 0) {
      for (let i = 1; i < raiser; i++) if (!seats[i].dropped) await view.opponentWaits(seats[i]);
    }
    turn = raiser;
    do {
      const s = seats[turn];
      if (!s.dropped) {
        if (s.character) {
          const { action, bluffing } = chooseBet(s.character.ai, {
            seat: turn, score: s.score, rate, maxRate, raiser,
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
          const options: PlayerBet[] =
            rate >= maxRate ? ['call', 'drop']
            : rate + 1 >= maxRate ? ['raise', 'call', 'drop']
            : rate === 1 ? ['raise2', 'raise', 'call']
            : ['raise2', 'raise', 'call', 'drop'];
          const choice = await view.askBet(options, seats, rate);
          if (choice === 'drop') {
            s.dropped = true;
          } else {
            if (choice !== 'call') {
              raiser = 0;
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
    // Folded seats can never win; ties go to the earlier seat (the SWF fell through to seat 3).
    const winner = seats.reduce((best, s) => (!s.dropped && (best.dropped || s.score > best.score) ? s : best), seats[0]);
    const pot = seats.reduce((sum, s) => sum + s.bet, 0);
    if (winner === player) result.wins++;
    else if (player.dropped) result.drops++;
    else result.losses++;
    await view.roundWinner(winner, seats, allFolded);
    winner.coins += pot;
    await view.payout(winner, pot, seats);

    // --- Busts (frame 778).
    const newlyBusted = seats.filter((s) => !s.busted && s.coins < 1);
    if (newlyBusted.length) {
      bustSeq++;
      for (const s of newlyBusted) {
        s.busted = true;
        s.bustRank = bustSeq;
      }
      await view.busted(seats, newlyBusted, seats.filter((s) => !s.busted).length + 1);
    }
    if (player.busted || seats.filter((s) => !s.busted).length <= 1) break;
  }

  // --- Final ranking (frame 979): survivors by coins, then busted seats by how late they went out.
  const score = (s: Seat) => (s.busted ? s.bustRank : 100 + s.coins);
  const order = [...seats].sort((a, b) => score(b) - score(a) || a.index - b.index);
  order.forEach((s, i) => {
    const prev = order[i - 1];
    result.places[s.index] = prev && score(prev) === score(s) ? result.places[prev.index] : i + 1;
  });
  result.winner = order[0].index;
  result.coins = seats.map((s) => s.coins);
  await view.gameSet(result, seats);
  return result;
}
