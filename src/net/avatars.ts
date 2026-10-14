// Online players sit at the table as the original Poker Face Up opponents (SP_*_R in the SWF), under their
// own names. Each becomes a Character like the cast, so the table, banners and scoreboard draw them unchanged.
import type { Character } from '../characters';
import type { CharacterAI, CharacterLines, Emotion, FaceBox } from '../engine/types';

export interface Avatar {
  id: string;
  name: string;
  color: string;
  /** Between the eyes, on frame 1; the box is the head (they're mostly head). */
  face: FaceBox;
  /** As big at the table as in the SWF: there the sprite's full height stood where a 40px face does here. */
  figureScale: number;
}

const HEAD = 0.36;
/** Placed by the eyes like the cast, they'd sit too high (they're mostly head): down to the rail, as in the SWF. */
const DROP = 0.7;
export const AVATARS: Avatar[] = [
  { id: 'giko', name: 'Giko', color: '#4fa8e8', face: { x: 0.6, y: 0.38, size: HEAD }, figureScale: (HEAD * 151.85) / 40 },
  { id: 'sii', name: 'Shii', color: '#f27aa8', face: { x: 0.54, y: 0.4, size: HEAD }, figureScale: (HEAD * 139.8) / 40 },
  { id: 'morara', name: 'Morara', color: '#e8b820', face: { x: 0.45, y: 0.41, size: HEAD }, figureScale: (HEAD * 145.05) / 40 },
  { id: 'shin', name: 'Shin', color: '#c8a870', face: { x: 0.57, y: 0.43, size: HEAD }, figureScale: (HEAD * 144.8) / 40 },
  { id: 'fun', name: 'Fun', color: '#8c8c8c', face: { x: 0.47, y: 0.41, size: HEAD }, figureScale: (HEAD * 148.9) / 40 },
  { id: 'zu', name: 'Zu', color: '#3a8ac8', face: { x: 0.48, y: 0.45, size: HEAD }, figureScale: (HEAD * 149.65) / 40 },
  { id: 'syobo', name: 'Shobon', color: '#e89850', face: { x: 0.53, y: 0.44, size: HEAD }, figureScale: (HEAD * 120.2) / 40 },
];

export const avatarById = (id: string): Avatar => AVATARS.find((a) => a.id === id) ?? AVATARS[0];

/** Sprite frames: 1 normal, 3 holding cards, 5 dropped, 7 won. */
const FRAMES: Record<Emotion, number> = { neutral: 1, tell: 3, lose: 5, win: 7 };

const LINES: CharacterLines = {
  greeting: "Hi! Let's play.",
  swap: '{n} card{s}, please.',
  keep: "I'll keep these.",
  call: 'Call.',
  raise: 'Raise.',
  raise2: 'Raise by two!',
  drop: 'Fold.',
  allIn: 'All in!',
  busted: "I'm out...",
};

/** Plays the seat while its person is away: steady, middle-of-the-road. */
const STAND_IN: CharacterAI = {
  callMax: [0, 3, 4, 6, 7, 8, 9, 9, 9, 9, 9, 9],
  raiseMax: [0, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9],
  raiseAvg: 55, bluffType: 1, reading: 2, changeType: 3,
  tell: { when: 'never', chance: 0, reveals: 0 }, randomBetting: false,
};

/** The URL of a UI asset, as loadUi keeps it (same path every client resolves). */
const frameUrl = (avatar: string, frame: number) => `${import.meta.env.BASE_URL}ui/avatar-${avatar}-${frame}.svg`;

export function avatarArt(id: string): Record<Emotion, string> {
  const a = avatarById(id);
  return Object.fromEntries(Object.entries(FRAMES).map(([e, f]) => [e, frameUrl(a.id, f)])) as Record<Emotion, string>;
}

/** A person's seat: their avatar and name. `key` keeps it apart from anyone else with the same avatar. */
export function avatarCharacter(avatar: string, name: string, key: string): Character {
  const a = avatarById(avatar);
  const art = avatarArt(a.id);
  return {
    id: `player:${key}`,
    name,
    fullName: `${name} (${a.name})`,
    look: { color: a.color, face: a.face, figureScale: a.figureScale, figureDrop: DROP, sprites: { neutral: '', tell: '', lose: '', win: '' } },
    ai: STAND_IN,
    lines: LINES,
    art,
  };
}
