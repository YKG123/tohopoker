// Persistent records (the SWF's "pokerdat" shared object), keyed by character id instead of a fixed
// 8-slot array so new characters just appear. Stored in localStorage.
import type { MatchResult } from './engine/match';

const KEY = 'touhou-poker-face-up/v1';

export interface CharacterRecord {
  games: number;
  /** Net coins over all games (final coins - 20). */
  coins: number;
  /** Sum of finishing places; average = rankSum / games. */
  rankSum: number;
}

export interface SaveData {
  player: CharacterRecord;
  characters: Record<string, CharacterRecord>;
  /** How often the player finished 1st..4th (index 1-4). */
  places: number[];
  wins: number;
  losses: number;
  drops: number;
  handCounts: number[];
  settings: { bgm: boolean; quality: 'low' | 'medium' | 'high' };
}

const emptyRecord = (): CharacterRecord => ({ games: 0, coins: 0, rankSum: 0 });
const fresh = (): SaveData => ({
  player: emptyRecord(), characters: {}, places: [0, 0, 0, 0, 0], wins: 0, losses: 0, drops: 0,
  handCounts: Array(12).fill(0), settings: { bgm: true, quality: 'high' },
});

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    // Private mode or corrupt data: play without saving.
  }
  return fresh();
}

export function store(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Ignore: records just won't persist.
  }
}

export function resetRecords(): SaveData {
  const data = { ...fresh(), settings: load().settings };
  store(data);
  return data;
}

/** Frame 980: fold a finished match into the records. */
export function recordMatch(opponentIds: string[], result: MatchResult): SaveData {
  const data = load();
  const add = (r: CharacterRecord, seat: number) => {
    r.games++;
    r.coins += result.coins[seat] - 20;
    r.rankSum += result.places[seat];
  };
  add(data.player, 0);
  opponentIds.forEach((id, i) => add((data.characters[id] ??= emptyRecord()), i + 1));
  data.places[result.places[0]]++;
  data.wins += result.wins;
  data.losses += result.losses;
  data.drops += result.drops;
  result.handCounts.forEach((n, i) => (data.handCounts[i] += n));
  store(data);
  return data;
}
