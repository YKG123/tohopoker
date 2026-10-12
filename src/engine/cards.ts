// Cards use the SWF's own encoding so the ported rules stay line-for-line comparable:
// two-digit rank ("02".."14", 14 = ace) + suit letter a-d, and "jjj" for the joker.
// Plain string sort orders a hand by rank with the joker last, which the evaluator relies on.
export type Card = string;

export const JOKER: Card = 'jjj';
const RANKS = ['14', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'];
const SUITS = ['a', 'b', 'c', 'd'];

export const rank = (c: Card): number => parseInt(c.slice(0, 2), 10);
export const suit = (c: Card): string => c.charAt(2);

// Rank plus a suit tiebreak (a 0.3 ... d 0), as the SWF computes it.
export const cardValue = (c: Card): number => rank(c) + (100 - c.charCodeAt(2)) / 10;

export function newDeck(): Card[] {
  return [...SUITS.flatMap((s) => RANKS.map((r) => r + s)), JOKER];
}

// Same shuffle as the SWF: swap each position with a random one.
export function shuffle(deck: Card[], random: () => number = Math.random): Card[] {
  for (let i = 0; i < deck.length; i++) {
    const j = Math.floor(random() * deck.length);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export const sortHand = (hand: Card[]): Card[] => hand.sort();
