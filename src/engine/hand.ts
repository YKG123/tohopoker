import { type Card, JOKER, cardValue, rank, suit } from './cards';

// Hand score ("YakuE" in the SWF): integer part is the category, decimals break ties.
export const HAND_NAMES = [
  'No Pair', 'One Pair', 'Two Pair', 'Three Card', 'Straight', 'Flush',
  'Full House', 'Four Card', 'Error', 'Straight Flush', 'Five Card', 'Royal Flush',
];
export const HandRank = {
  NoPair: 0, OnePair: 1, TwoPair: 2, ThreeCard: 3, Straight: 4, Flush: 5,
  FullHouse: 6, FourCard: 7, StraightFlush: 9, FiveCard: 10, RoyalFlush: 11,
} as const;

export const handName = (score: number): string => HAND_NAMES[Math.floor(score)] ?? HAND_NAMES[0];

// Counts ordered matching pairs among the first n cards: one pair = 2, two pair = 4,
// trips = 6, full house = 8, quads = 12. Also returns the best paired card value.
function pairStats(hand: Card[], n: number): { k: number; best: number } {
  let k = 0;
  let best = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && rank(hand[i]) === rank(hand[j])) {
        k++;
        best = Math.max(best, cardValue(hand[i]));
      }
    }
  }
  return { k, best };
}

const isFlush = (cards: Card[]): boolean => cards.every((c) => suit(c) === suit(cards[0]));

/** Port of the SWF's hand evaluator (frames 181/294). `hand` must be sorted. */
export function evaluate(hand: Card[]): number {
  const joker = hand[4] === JOKER;
  const { k, best } = pairStats(hand, 4 + (joker ? 0 : 1));
  switch (k) {
    case 2: return joker ? HandRank.ThreeCard : 1 + best / 100;
    case 4: return joker ? HandRank.FullHouse : 2 + best / 100;
    case 6: return joker ? HandRank.FourCard : 3 + best / 100;
    case 8: return 6 + rank(hand[2]) / 100;
    case 12: return joker ? HandRank.FiveCard : 7 + best / 100;
  }

  let score = 0;
  if (!joker) {
    let top = cardValue(hand[4]);
    if (isFlush(hand)) score = HandRank.Flush;
    if (rank(hand[4]) - rank(hand[0]) === 4) {
      score += 4;
    } else if (rank(hand[4]) === 14 && rank(hand[3]) === 5) {
      score += 4; // A-2-3-4-5
      top = cardValue(hand[3]);
    }
    if (score === HandRank.StraightFlush && rank(hand[0]) === 10) score = HandRank.RoyalFlush;
    return score + top / 100;
  }

  // Joker hands: four real cards, the joker fills the gap.
  const real = hand.slice(0, 4);
  if (isFlush(real)) score = HandRank.Flush;
  const span = rank(real[3]) - rank(real[0]);
  if (span <= 4 || (rank(real[3]) === 14 && rank(real[2]) <= 5)) score += 4;
  if (score === HandRank.StraightFlush && rank(real[0]) >= 10) score = HandRank.RoyalFlush;
  return score === 0 ? HandRank.OnePair : score;
}
