// Persistent records (the SWF's "pokerdat" shared object), keyed by character id instead of a fixed
// 8-slot array so new characters just appear. Stored in localStorage.
import { DEFAULT_ROUNDS, type MatchResult, START_COINS } from './engine/match';
import { BUY_IN, DEFAULT_TOURNAMENT, type Tournament, type TournamentConfig } from './engine/tournament';

const KEY = 'touhou-poker-face-up/v1';

export interface CharacterRecord {
  /** Cash games played (the Game column adds `tourneys`). */
  games: number;
  /** Net coins over all games (final coins - 20) plus tournament prizes minus buy-ins. */
  coins: number;
  /** Sum of cash-game finishing places; average = rankSum / games. */
  rankSum: number;
  tourneys: number;
  /** Tournaments finished in the money. */
  cashes: number;
  /** Tournaments won. */
  titles: number;
  /** Net tournament winnings (prizes - buy-ins). */
  prize: number;
  /** Best tournament finish (0 = none yet). */
  best: number;
}

export interface CashSettings {
  opponents: number;
  rounds: number;
}

export type TournamentSettings = TournamentConfig;

export interface SaveData {
  player: CharacterRecord;
  characters: Record<string, CharacterRecord>;
  /** How often the player finished 1st..6th in cash games (index 1-6). */
  places: number[];
  wins: number;
  losses: number;
  drops: number;
  handCounts: number[];
  settings: {
    bgm: boolean;
    quality: 'low' | 'medium' | 'high';
    cash: CashSettings;
    /** `entrants` 0 = the whole cast. */
    tournament: TournamentSettings;
  };
}

export const emptyRecord = (): CharacterRecord => ({ games: 0, coins: 0, rankSum: 0, tourneys: 0, cashes: 0, titles: 0, prize: 0, best: 0 });
const defaultSettings = (): SaveData['settings'] => ({
  bgm: true, quality: 'high', cash: { opponents: 3, rounds: DEFAULT_ROUNDS }, tournament: { ...DEFAULT_TOURNAMENT, entrants: 0 },
});
const fresh = (): SaveData => ({
  player: emptyRecord(), characters: {}, places: Array(7).fill(0), wins: 0, losses: 0, drops: 0,
  handCounts: Array(12).fill(0), settings: defaultSettings(),
});

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      // Saves from before tournaments and six-seat tables lack some fields: fill them in.
      const data: SaveData = { ...fresh(), ...JSON.parse(raw) };
      const defaults = defaultSettings();
      data.settings = {
        ...defaults, ...data.settings,
        cash: { ...defaults.cash, ...data.settings.cash },
        tournament: { ...defaults.tournament, ...data.settings.tournament },
      };
      while (data.places.length < 7) data.places.push(0);
      // A brief version also added tournament places to rankSum, counted in `ranked`: take them back out
      // where that's exact (a single tournament, whose place is the best finish).
      const upgrade = (r: Partial<CharacterRecord> & { ranked?: number }): CharacterRecord => {
        const { ranked, ...rest } = r;
        const rec = { ...emptyRecord(), ...rest };
        if (ranked !== undefined && ranked > rec.games && rec.tourneys === 1) rec.rankSum -= rec.best;
        return rec;
      };
      data.player = upgrade(data.player);
      for (const id of Object.keys(data.characters)) data.characters[id] = upgrade(data.characters[id]);
      return data;
    }
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

export function saveSettings(settings: SaveData['settings']): void {
  store({ ...load(), settings });
}

export function resetRecords(): SaveData {
  const data = { ...fresh(), settings: load().settings };
  store(data);
  return data;
}

/** Frame 980: fold a finished cash game into the records. */
export function recordMatch(opponentIds: string[], result: MatchResult): SaveData {
  const data = load();
  const add = (r: CharacterRecord, seat: number) => {
    r.games++;
    r.coins += result.coins[seat] - START_COINS;
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

/** A finished tournament: every entrant's finish, and their prize less the buy-in on their coin record. */
export function recordTournament(t: Tournament, stats: Pick<MatchResult, 'wins' | 'losses' | 'drops' | 'handCounts'>): SaveData {
  const data = load();
  for (const e of t.entries) {
    const r = e.character ? (data.characters[e.character.id] ??= emptyRecord()) : data.player;
    r.tourneys++;
    if (e.prize > 0) r.cashes++;
    if (e.place === 1) r.titles++;
    r.prize += e.prize - BUY_IN;
    r.coins += e.prize - BUY_IN;
    r.best = r.best ? Math.min(r.best, e.place) : e.place;
  }
  data.wins += stats.wins;
  data.losses += stats.losses;
  data.drops += stats.drops;
  stats.handCounts.forEach((n, i) => (data.handCounts[i] += n));
  store(data);
  return data;
}
