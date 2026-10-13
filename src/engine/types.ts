// Shape of src/characters/<id>/character.json. Everything the game knows about a character lives there.

export type Emotion = 'neutral' | 'win' | 'lose' | 'tell';

/** When the poker face slips during the card swap (checked against the hand after swapping). */
export type TellTrigger = 'noPair' | 'onePair' | 'twoPairOrTrips' | 'straightOrBetter' | 'fullHouseOrBetter' | 'never';

export interface FaceBox {
  /** Face center and box size, as fractions of the sprite (x of width, y and size of height). */
  x: number;
  y: number;
  size: number;
}

export interface CharacterLook {
  /** Banner and select-icon accent color. */
  color: string;
  face: FaceBox;
  sprites: Record<Emotion, string>;
  /** A sidekick drawn beside the character at the table (e.g. Tewi with Reisen). */
  companion?: { name: string; face: FaceBox; sprites: Record<Emotion, string> };
}

export interface CharacterAI {
  /** Highest bet level (1-7) the character calls with, indexed by hand category 0-11. */
  callMax: number[];
  /** The character keeps raising while the bet is below this, indexed by hand category. */
  raiseMax: number[];
  /** % chance per decision to take the bolder option; also scales bluffing. */
  raiseAvg: number;
  /** 1 never bluffs, 2 pat bluff (keeps all five on two pair), 3 pat + bet bluff. */
  bluffType: 1 | 2 | 3;
  /** 1 oblivious, 2 plays tighter against pat hands, 3 also folds to visible tells. */
  reading: 1 | 2 | 3;
  /** What to keep from a junk hand: 1 nothing, 2 the high card, 3 the top two. */
  changeType: 1 | 2 | 3;
  tell: { when: TellTrigger; chance: number; reveals: number };
  /** Shin's mode from the original: coin-flip calls and raises, ignores most of the above. */
  randomBetting: boolean;
}

export interface CharacterLines {
  greeting: string;
  /** "{n}" is replaced by the number of cards swapped, "{s}" by "s" unless it's 1. */
  swap: string;
  keep: string;
  call: string;
  raise: string;
  raise2: string;
  drop: string;
  /** Said when they put in their last coin; falls back to "All in!". */
  allIn?: string;
  /** Said in the cut-in when they go broke; falls back to `drop`. */
  busted?: string;
}

export interface CharacterData {
  id: string;
  name: string;
  fullName: string;
  /** Position on the select screen (lower first). */
  order?: number;
  stats?: { strictness: number; aggression: number; unpredictability: number; comment?: string };
  look: CharacterLook;
  ai: CharacterAI;
  lines: CharacterLines;
}
