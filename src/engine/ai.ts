// Port of the SWF's opponent AI: card swapping (frame 179), betting (frame 388) and tells (banner frame 42).
import { type Card, JOKER, rank, suit } from './cards';
import { HandRank } from './hand';
import type { CharacterAI, TellTrigger } from './types';

type Random = () => number;
/** int(Math.random() * n) + 1, as the SWF rolls dice. */
const roll = (n: number, random: Random): number => Math.floor(random() * n) + 1;

/** Which cards to hold (true = keep). `hand` must be sorted. */
export function chooseHolds(hand: Card[], ai: CharacterAI, random: Random = Math.random): boolean[] {
  const hold = [false, false, false, false, false];
  const joker = hand[4] === JOKER;
  const n = joker ? 4 : 5;
  if (joker) hold[4] = true;

  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && rank(hand[i]) === rank(hand[j])) {
        k++;
        hold[i] = hold[j] = true;
      }
    }
  }
  if (!joker && ai.bluffType >= 2 && k === 4 && ai.raiseAvg - 30 >= roll(200, random)) {
    hold.fill(true); // pat bluff: stand on two pair to fake a made hand
  }
  if (k !== 0) return hold;

  // No pair: count same-suit pairs (5 suited = 20, 4 = 12, 3 = 6) and chase draws.
  let flushSuit = '';
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && suit(hand[i]) === suit(hand[j])) {
        k++;
        flushSuit = suit(hand[i]);
      }
    }
  }
  const r = (i: number) => rank(hand[i]);
  const keep = (...idx: number[]) => idx.forEach((i) => (hold[i] = true));
  const keepSuit = () => hand.forEach((c, i) => suit(c) === flushSuit && (hold[i] = true));

  if (!joker) {
    if (k >= 20 || r(4) - r(0) <= 4 || (r(4) === 14 && r(3) === 5)) {
      keep(0, 1, 2, 3, 4); // made flush or straight
    } else if (k >= 12) {
      keepSuit(); // four to a flush
    } else if (r(4) - r(1) <= 3) {
      keep(1, 2, 3, 4);
    } else if (r(3) - r(0) <= 3) {
      keep(0, 1, 2, 3);
    } else if (r(4) - r(1) <= 4) {
      keep(1, 2, 3, 4);
    } else if (r(3) - r(0) <= 4) {
      keep(0, 1, 2, 3);
    } else if (r(4) === 14 && r(2) <= 5) {
      keep(0, 1, 2, 4); // wheel draw
    } else if (k >= 6) {
      keepSuit(); // three to a flush
    } else if (ai.changeType === 2) {
      keep(4);
    } else if (ai.changeType === 3) {
      keep(3, 4);
    }
    return hold;
  }

  // Joker hands: four real cards.
  if (k >= 12 || r(3) - r(0) <= 4 || (r(3) === 14 && r(2) <= 5)) {
    keep(0, 1, 2, 3);
  } else if (k >= 6) {
    keepSuit();
  } else if (r(3) - r(1) <= 4) {
    keep(1, 2, 3);
  } else if (r(2) - r(0) <= 4) {
    keep(0, 1, 2);
  } else if (r(3) === 14 && r(1) <= 5) {
    keep(0, 1, 3);
  } else {
    keep(3);
  }
  return hold;
}

/** The player's auto-hold hint (frame 266): pairs, plus made straights and flushes. */
export function suggestHolds(hand: Card[]): boolean[] {
  const ai: CharacterAI = {
    callMax: [], raiseMax: [], raiseAvg: 0, bluffType: 1, reading: 1, changeType: 1,
    tell: { when: 'never', chance: 0, reveals: 0 }, randomBetting: false,
  };
  const holds = chooseHolds(hand, ai);
  // The hint only keeps pairs and made hands, never draws.
  const made = holds.every(Boolean) || hand.some((c, i) => hand.some((d, j) => i !== j && rank(c) === rank(d)));
  return made ? holds : holds.map((h, i) => h && hand[i] === JOKER);
}

export function tellTriggers(when: TellTrigger, score: number): boolean {
  switch (when) {
    case 'noPair': return score < 1;
    case 'onePair': return Math.floor(score) === 1;
    case 'twoPairOrTrips': return score >= 2 && score < 4;
    case 'straightOrBetter': return score >= 4;
    case 'fullHouseOrBetter': return score >= 6;
    case 'never': return false;
  }
}

export function rollTell(ai: CharacterAI, score: number, random: Random = Math.random): boolean {
  return tellTriggers(ai.tell.when, score) && roll(100, random) <= ai.tell.chance;
}

/** Table state the betting AI reads, one entry per seat. */
export interface BetView {
  seat: number;
  score: number;
  rate: number;
  maxRate: number;
  raiser: number;
  bet: number[];
  /** Folded, broke or vacant. */
  dropped: boolean[];
  /** Broke or vacant. */
  busted: boolean[];
  /** Seats that stood pat (swapped nothing). */
  allHold: boolean[];
  /** Hand strength revealed by each seat's tell (0 = nothing seen). */
  faceDown: number[];
  /** Whether this seat already committed to a bet-raise bluff this round. */
  bluffing: boolean;
}

export type BetAction = 0 | 1 | 2 | 3; // drop, call, raise 1, raise 2

/** Returns the action plus whether the seat starts bluffing this round. */
export function chooseBet(ai: CharacterAI, v: BetView, random: Random = Math.random): { action: BetAction; bluffing: boolean } {
  // Seats missing from a four-handed game (the SWF counted busted players, out of four seats). Bigger tables
  // play like a full four-handed one.
  const short = Math.max(0, 4 - v.busted.filter((b) => !b).length);
  let bluffing = v.bluffing;
  let L: number;

  if (!ai.randomBetting) {
    const K = ai.raiseAvg >= roll(100, random) ? 0 : -1;
    let hosei = 0;
    if (ai.reading >= 2 && v.allHold.some((pat, i) => pat && i !== v.seat)) hosei = -2;
    if (ai.bluffType === 3 && hosei === 0 && v.raiser !== v.seat && !bluffing && v.rate === 1
        && v.score > 1.11 && v.score < 2 && ai.raiseAvg - 20 >= roll(100, random)) {
      bluffing = true;
    }
    const idx = Math.max(0, Math.floor(v.score - 0.01));
    const raiseAt = ai.raiseMax[idx] + hosei;
    L = 0;
    if (!(v.bet[v.seat] === 1 && v.seat === v.raiser)) {
      if (!(ai.callMax[idx] + hosei + short < v.rate && v.bet[v.seat] < 4)) {
        if (v.rate >= 7) L = 1;
        else if (v.rate + 1 >= raiseAt) L = v.rate >= raiseAt ? 1 : 2 + K;
        else L = v.rate !== 6 ? 3 + K : 2 + K;
      }
    } else if (v.rate + 1 >= raiseAt) {
      L = v.rate >= raiseAt ? 1 : 2 + K;
    } else {
      L = 3 + K * 2;
    }
    if (bluffing) L = v.rate < 3 ? 3 : v.rate < 4 ? 2 : 1;
    if (L === 0 && ai.reading >= 2 && v.score > 1.1 && v.dropped.filter((d) => !d).length === 2) L = 1; // heads-up
    if (v.score < 1.09 - short * 0.04) L = 0;
    if (ai.reading === 3 && v.faceDown.some((seen, i) => i !== v.seat && v.score < seen)) L = 0;
  } else {
    const idx = Math.max(0, Math.floor(v.score - 0.1));
    const limit = ai.callMax[idx] + short;
    if (limit >= v.rate + 1) {
      L = 1;
      const top = ai.raiseMax[Math.floor(v.score)] ?? 9;
      if (top >= roll(7, random)) L++;
      if (top >= roll(7, random)) L++;
    } else {
      L = limit >= v.rate || v.bet[v.seat] >= 3 ? 1 : 0;
    }
  }

  if (v.rate >= 7 && L >= 2) L = 1;
  if (v.rate >= 6 && L >= 3) L = 2;
  if (v.rate === 1 && L === 0) L = 1; // the opening level costs nothing extra to stay in
  if (L === 3 && v.rate + 2 > v.maxRate) L = 2;
  if (L === 2 && v.rate + 1 > v.maxRate) L = 1;
  return { action: L as BetAction, bluffing };
}

export { HandRank };
