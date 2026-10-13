// Multi-table tournament: everyone buys in, starts with the same stack, and plays until one player has all the
// chips. Tables play their rounds in lockstep; the ante goes up every few rounds; tables are broken and
// balanced between rounds; finishing places pay out on an exponential curve.
import { type MatchView, type PlayerStats, type Seat, type Table, headlessView, live, newSeat, playRound, vacantSeat } from './match';
import type { CharacterData } from './types';

/** How tables are merged as players bust. */
export type Breaking = 'balanced' | 'shorthanded' | 'final';

export interface TournamentConfig {
  /** Total players, including the human unless they're only watching. */
  entrants: number;
  /** Watch the whole tournament instead of playing in it. */
  spectate?: boolean;
  /** Seats per table (3-6). */
  tableSize: number;
  startStack: number;
  /** Rounds per ante level. */
  anteEvery: number;
  breaking: Breaking;
  /** Share of the field that gets paid, in percent. */
  paidPercent: number;
}

/** Coins it costs to enter; the prize pool is every entrant's buy-in. */
export const BUY_IN = 20;

export const DEFAULT_TOURNAMENT: Omit<TournamentConfig, 'entrants'> = {
  tableSize: 6, startStack: 50, anteEvery: 15, breaking: 'balanced', paidPercent: 20,
};

export const BREAKING_NAMES: Record<Breaking, string> = {
  balanced: 'Balanced',
  shorthanded: 'Short-handed',
  final: 'Final table only',
};

const ANTES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100];
export const anteAt = (level: number): number =>
  level < ANTES.length ? ANTES[level] : ANTES[ANTES.length - 1] * 2 ** (level - ANTES.length + 1);

export const paidPlaces = (entrants: number, percent: number): number =>
  Math.min(entrants, Math.max(1, Math.round((entrants * percent) / 100)));

/**
 * Prize per finishing place (index 0 = 1st). Every paid place gets at least the buy-in back where the pool
 * allows; the rest is split on a geometric curve, each place getting 60% of the one above, as real
 * tournaments roughly do.
 */
export function payoutTable(entrants: number, percent: number, buyIn = BUY_IN): number[] {
  const pool = entrants * buyIn;
  const paid = paidPlaces(entrants, percent);
  const minCash = Math.min(buyIn, Math.floor(pool / 2 / paid));
  const rest = pool - minCash * paid;
  const weights = Array.from({ length: paid }, (_, i) => 0.6 ** i);
  const sum = weights.reduce((a, b) => a + b, 0);
  const prizes = weights.map((w) => minCash + Math.floor((rest * w) / sum));
  prizes[0] += pool - prizes.reduce((a, b) => a + b, 0);
  return prizes;
}

export interface Entry {
  seat: Seat;
  character: CharacterData | null;
  table: Table | null;
  /** Finishing place, 0 while still playing. */
  place: number;
  prize: number;
  bustRound: number;
}

export interface Move {
  entry: Entry;
  from: Table;
  to: Table;
}

export class Tournament {
  readonly entries: Entry[];
  tables: Table[] = [];
  round = 0;
  readonly prizes: number[];

  constructor(readonly config: TournamentConfig, opponents: CharacterData[], private random: () => number = Math.random) {
    const people = config.spectate ? opponents : [null, ...opponents];
    this.entries = people.map((c) => ({ seat: newSeat(0, c, config.startStack), character: c, table: null, place: 0, prize: 0, bustRound: 0 }));
    this.prizes = payoutTable(this.entries.length, config.paidPercent);
    // Deal everyone to tables in turn, then into random seats at each.
    const shuffled = this.shuffle([...this.entries]);
    const count = Math.ceil(shuffled.length / config.tableSize);
    for (let id = 1; id <= count; id++) {
      const seats = Array.from({ length: config.tableSize }, (_, i) => vacantSeat(i));
      const table: Table = { id, seats, father: Math.floor(random() * config.tableSize), round: 0, ante: 1 };
      const group = shuffled.filter((_, i) => i % count === id - 1);
      const spots = this.shuffle(seats.map((_, i) => i)).slice(0, group.length);
      group.forEach((e, i) => this.sit(e, table, spots[i]));
      this.tables.push(table);
    }
  }

  private shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private sit(e: Entry, table: Table, index: number): void {
    e.seat.index = index;
    table.seats[index] = e.seat;
    e.table = table;
  }

  /** The player's entry; undefined when they're only watching. */
  get human(): Entry | undefined {
    return this.entries.find((e) => !e.character);
  }

  get level(): number {
    return Math.floor(this.round / this.config.anteEvery);
  }

  /** The ante for the next round. */
  get ante(): number {
    return anteAt(this.level);
  }

  /** Rounds left at the current ante, counting the next one. */
  get roundsToAnteUp(): number {
    return this.config.anteEvery - (this.round % this.config.anteEvery);
  }

  get alive(): Entry[] {
    return this.entries.filter((e) => !e.place);
  }

  get done(): boolean {
    return this.alive.length <= 1;
  }

  entryOf(seat: Seat): Entry | undefined {
    return this.entries.find((e) => e.seat === seat);
  }

  /** Live players by stack, then the busted by finishing place. */
  standings(): Entry[] {
    return [...this.entries].sort((a, b) => {
      if (!a.place !== !b.place) return a.place ? 1 : -1;
      return a.place ? a.place - b.place : b.seat.coins - a.seat.coins;
    });
  }

  /**
   * Plays one round at every table with two or more players. `featured` is played through `view` (the
   * human's table, or the one being spectated), the rest headless. Returns everyone who went out.
   */
  async playRound(featured: Table | null, view: MatchView, stats: PlayerStats | null): Promise<Entry[]> {
    const ante = this.ante;
    this.round++;
    const startCoins = new Map(this.alive.map((e) => [e, e.seat.coins]));
    const aliveBefore = this.alive.length;
    const out: Seat[] = [];
    let placed: Entry[] | null = null;
    // Players who go out in the same round are ranked by the stack they started it with.
    const assign = (extra: Seat[]): Entry[] => {
      const busted = [...out, ...extra].map((s) => this.entryOf(s)!);
      busted.sort((a, b) => startCoins.get(b)! - startCoins.get(a)!);
      busted.forEach((e, i) => {
        e.place = aliveBefore - busted.length + 1 + i;
        e.prize = this.prizes[e.place - 1] ?? 0;
        e.bustRound = this.round;
      });
      // The last one standing.
      if (aliveBefore - busted.length === 1) {
        const champ = this.alive[0];
        champ.place = 1;
        champ.prize = this.prizes[0];
      }
      return busted;
    };

    const playing = this.tables.filter((t) => live(t.seats).length >= 2);
    for (const t of playing) {
      t.ante = ante;
      t.round = this.round - 1; // tables count the tournament's rounds
    }
    // Unwatched tables first, so the watched one can show the places of everyone who went out this round.
    for (const t of playing) {
      if (t !== featured) out.push(...(await playRound(t, headlessView, this.random, null, () => [])));
    }
    if (featured && playing.includes(featured)) {
      await playRound(featured, view, this.random, stats, (mine) => {
        placed = assign(mine);
        return mine.map((s) => this.entryOf(s)!.place);
      });
    }
    placed ??= assign([]);
    for (const e of placed) e.table = null;
    return placed;
  }

  /** Breaks and balances tables between rounds, per the config. */
  rebalance(): Move[] {
    const moves: Move[] = [];
    const size = this.config.tableSize;
    const count = (t: Table) => live(t.seats).length;
    // Players who went broke leave their seats.
    for (const t of this.tables) t.seats.forEach((s, i) => s.busted && !s.vacant && (t.seats[i] = vacantSeat(i)));
    this.tables = this.tables.filter((t) => count(t) > 0);
    const alive = this.alive.length;
    if (alive <= 1) return moves;
    const minTables = Math.ceil(alive / size);

    const move = (e: Entry, to: Table) => {
      const from = e.table!;
      const spots = to.seats.filter((s) => s.vacant).map((s) => s.index);
      from.seats[e.seat.index] = vacantSeat(e.seat.index);
      this.sit(e, to, spots[Math.floor(this.random() * spots.length)]);
      moves.push({ entry: e, from, to });
    };
    const smallest = (except?: Table) =>
      this.tables.filter((t) => t !== except && count(t) < size).sort((a, b) => count(a) - count(b) || a.id - b.id)[0];
    const largest = () => [...this.tables].sort((a, b) => count(b) - count(a) || a.id - b.id)[0];
    const entriesAt = (t: Table) => live(t.seats).map((s) => this.entryOf(s)!);
    // Who moves when balancing: an opponent if possible, so the player isn't shuffled around needlessly.
    const mover = (t: Table) => {
      const at = entriesAt(t);
      const ai = at.filter((e) => e.character);
      const pool = ai.length ? ai : at;
      return pool[Math.floor(this.random() * pool.length)];
    };
    const breakTable = (t: Table) => {
      for (const e of entriesAt(t)) move(e, smallest(t));
      this.tables = this.tables.filter((x) => x !== t);
    };
    const shortest = () => [...this.tables].sort((a, b) => count(a) - count(b) || b.id - a.id)[0];

    const { breaking } = this.config;
    while (this.tables.length > minTables) {
      const t = shortest();
      const allowed = breaking === 'balanced' || minTables === 1 || (breaking === 'shorthanded' && count(t) <= 2);
      if (!allowed) break;
      breakTable(t);
    }
    if (breaking === 'balanced') {
      while (count(largest()) - count(shortest()) >= 2) move(mover(largest()), shortest());
    }
    // Nobody can play alone: in any mode, a lone player gets company.
    while (this.tables.length > 1 && count(shortest()) < 2) {
      const t = shortest();
      if (this.tables.length > minTables) breakTable(t);
      else if (count(largest()) > 2) move(mover(largest()), t);
      else break; // can't happen with three or more seats per table
    }
    return moves;
  }

  /** Plays the rest of the tournament with nobody watching. */
  async finish(): Promise<void> {
    while (!this.done) {
      await this.playRound(null, headlessView, null);
      this.rebalance();
    }
  }
}
