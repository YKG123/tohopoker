// What goes over the wire between the host (who runs the game) and everyone else (who watch their own
// view of it and answer when asked). Seats travel as snapshots from the receiver's side: their own cards,
// everyone else's only once shown down.
import { type Character, characterById } from '../characters';
import type { Card } from '../engine/cards';
import { type GameSummary, type PlayerBet, type Seat, newSeat, vacantSeat } from '../engine/match';
import { avatarCharacter } from './avatars';

/** Who someone is online: kept in their browser, so coming back after a drop gets them their seat back. */
export interface Profile {
  key: string;
  name: string;
  avatar: string;
}

export interface NetSettings {
  rounds: number;
  /** Seconds per decision; 0 = no limit. */
  decisionTime: number;
  /** AI opponents the host will pick when the game starts. */
  ais: number;
}

export interface LobbyPlayer {
  name: string;
  avatar: string;
  host: boolean;
  /** Dropped out mid-game (the AI is playing their seat). */
  away: boolean;
}

/** Whose seat: a cast member, a person (by profile), the receiver themselves, or nobody. */
export type Who = { ai: string } | { player: Profile } | 'me' | null;

export interface WireSeat {
  who: Who;
  coins: number;
  bet: number;
  paid: number;
  allIn: boolean;
  dropped: boolean;
  busted: boolean;
  holdCount: number;
  /** Only the receiver's own cards, or cards already shown down. */
  hand?: Card[];
  score?: number;
}

export type WireSummary = Omit<GameSummary, 'champions'> & { champions: number[] };

/** A MatchView call replayed on the receiver's table; seat arguments are seat indices. */
export type ViewEvent =
  | { m: 'seated'; joined: number[] }
  | { m: 'roundStart'; round: number; ante: number }
  | { m: 'dealPlayer'; hand: Card[] }
  | { m: 'dealOpponents' }
  | { m: 'opponentSwap'; seat: number; swapped: number; tell: boolean }
  | { m: 'playerSwap'; hand: Card[]; holds: boolean[] }
  | { m: 'betRoundStart'; opener: number }
  | { m: 'opponentBet'; seat: number; action: 0 | 1 | 2 | 3 }
  | { m: 'playerBet'; seat: number; action: PlayerBet }
  | { m: 'betRoundEnd' }
  | { m: 'showdownStart' }
  | { m: 'reveal'; seat: number }
  | { m: 'awaitMatch' }
  | { m: 'roundWinner'; winners: number[]; allFolded: boolean }
  | { m: 'payout'; winners: number[]; won: number[] }
  | { m: 'busted'; out: number[]; places: number[] }
  | { m: 'gameSet'; summary: WireSummary }
  | { m: 'think'; seat: number; seconds: number };

export type Ask =
  | { kind: 'holds'; hint: boolean[] }
  | { kind: 'bet'; options: PlayerBet[]; rate: number; allIn: boolean };

export type HostMsg =
  | { t: 'lobby'; code: string; players: LobbyPlayer[]; settings: NetSettings; playing: boolean }
  /** A table to sit down at: the game starting, or a returning player picking their seat back up. */
  | { t: 'start'; seats: WireSeat[]; rounds: number; decisionTime: number }
  | { t: 'ev'; ev: ViewEvent; seats: WireSeat[] }
  | { t: 'ask'; id: number; ask: Ask; seats: WireSeat[] }
  /** Back in the lobby after a game. */
  | { t: 'end' }
  /** Mid-game return: they get their seat back when the next hand starts. */
  | { t: 'wait'; text: string }
  | { t: 'bye'; reason: string };

export type ClientMsg = { t: 'hello'; profile: Profile } | { t: 'answer'; id: number; value: boolean[] | PlayerBet };

// --- Seats --------------------------------------------------------------------------------------
/** `who(seat)` names the occupant from the receiver's side; `shown` seats' cards are public. */
export function encodeSeats(seats: Seat[], who: (s: Seat) => Who, mine: number, shown: Set<number>): WireSeat[] {
  return seats.map((s) => {
    const open = s.index === mine || shown.has(s.index);
    return {
      who: s.vacant ? null : who(s),
      coins: s.coins, bet: s.bet, paid: s.paid, allIn: s.allIn, dropped: s.dropped, busted: s.busted, holdCount: s.holdCount,
      ...(open ? { hand: [...s.hand], score: s.score } : {}),
    };
  });
}

/**
 * Keeps a receiver's copy of the table. Seat objects and characters stay the same objects between
 * snapshots (the table view tells seats apart by identity).
 */
export class SeatMirror {
  seats: Seat[] = [];
  private people = new Map<string, Character>();

  private character(who: Who): Character | null {
    if (!who || who === 'me') return null;
    if ('ai' in who) return characterById(who.ai) ?? null;
    const { key, name, avatar } = who.player;
    const id = `${key}/${avatar}/${name}`;
    let c = this.people.get(id);
    if (!c) this.people.set(id, (c = avatarCharacter(avatar, name, key)));
    return c;
  }

  apply(wire: WireSeat[]): Seat[] {
    if (wire.length !== this.seats.length) this.seats = wire.map((w, i) => (w.who ? newSeat(i, null, 0) : vacantSeat(i)));
    wire.forEach((w, i) => {
      const s = this.seats[i];
      const character = this.character(w.who);
      Object.assign(s, {
        character, human: w.who === 'me', vacant: !w.who,
        coins: w.coins, bet: w.bet, paid: w.paid, allIn: w.allIn, dropped: w.dropped, busted: w.busted, holdCount: w.holdCount,
      });
      if (w.hand) s.hand = w.hand;
      if (w.score !== undefined) s.score = w.score;
    });
    return this.seats;
  }
}
