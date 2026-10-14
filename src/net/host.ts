// The host's side of an online game. The host's browser runs the match like a cash game, with each person's
// seat played from their own browser: every table event is relayed to them from their side of the table,
// and their swap and bet come back as answers. Anyone who drops out is played by the AI until they're back.
import type { Character } from '../characters';
import type { BetAction } from '../engine/ai';
import type { Card } from '../engine/cards';
import { handName } from '../engine/hand';
import {
  BET_ACTION, type GameSummary, MAX_SEATS, type MatchView, type PlayerBet, START_COINS, type Seat, type SeatControl, type Table,
  finalPlaces, live, newSeat, ordinal, playRound,
} from '../engine/match';
import { fade } from '../game/screens';
import { TableView, seatName } from '../game/tableView';
import { preloadImages } from '../ui/portrait';
import { RankTracker, type ScoreRow, installScoreboard } from '../ui/scoreboard';
import { avatarById, avatarCharacter } from './avatars';
import { type Ask, type ClientMsg, type HostMsg, type LobbyPlayer, type NetSettings, type Profile, type ViewEvent, type Who, encodeSeats } from './protocol';
import type { Link } from './room';

interface Player {
  profile: Profile;
  peer: string | null;
  /** Their seat in the game being played, or -1. */
  seat: number;
  /** Connected and following the table: they decide for their seat. */
  live: boolean;
  /** Back after dropping out: they pick their seat up when the next hand starts. */
  rejoin: boolean;
}

const ACTION_BET: Record<BetAction, PlayerBet> = { 0: 'drop', 1: 'call', 2: 'raise', 3: 'raise2' };
/** Beyond a person's own clock: covers lag before the host gives up and lets the AI answer. */
const ASK_SLACK = 15;

const tidyName = (name: unknown): string => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 12) || 'Guest';

export class HostSession {
  players: Player[] = [];
  playing = false;
  /** Lobby changed (someone came or went). */
  onChange: () => void = () => undefined;
  /** Decisions waiting on an answer, by id. */
  private asks = new Map<number, { player: Player; resolve: (v: unknown) => void }>();
  private nextAsk = 1;

  constructor(readonly me: Profile, public settings: NetSettings, readonly link: Link<ClientMsg, HostMsg>, readonly code: string) {
    link.onMessage = (msg, peer) => this.receive(msg, peer);
    link.onLeave = (peer) => this.left(peer);
  }

  /** Seats left for people: the table holds six, the host's included. */
  get room(): number {
    return MAX_SEATS - 1 - this.players.length;
  }

  private receive(msg: ClientMsg, peer: string): void {
    if (msg?.t === 'hello' && msg.profile && typeof msg.profile.key === 'string') {
      const profile: Profile = { key: msg.profile.key.slice(0, 64), name: tidyName(msg.profile.name), avatar: avatarById(String(msg.profile.avatar)).id };
      let player = this.players.find((p) => p.profile.key === profile.key);
      if (player) {
        // A hello from someone already here means they reloaded or reconnected, maybe before their old
        // connection was noticed dropping: mid-game, the AI covers their seat until the next hand.
        this.cancelAsks(player);
        player.peer = peer;
        if (!this.playing || player.seat < 0) player.profile = profile;
        if (this.playing && player.seat >= 0) {
          player.live = false;
          player.rejoin = true;
          this.send(player, { t: 'wait', text: "Welcome back! You'll take your seat again when the next hand starts." });
        }
      } else if (this.playing) {
        this.link.send({ t: 'bye', reason: 'A game is already under way.\nTry again when it ends.' }, peer);
        return;
      } else if (this.room <= 0) {
        this.link.send({ t: 'bye', reason: 'The room is full.' }, peer);
        return;
      } else {
        player = { profile, peer, seat: -1, live: false, rejoin: false };
        this.players.push(player);
      }
      this.lobbyChanged();
    } else if (msg?.t === 'answer') {
      const ask = this.asks.get(msg.id);
      if (ask && ask.player.peer === peer) ask.resolve(msg.value);
    }
  }

  private left(peer: string): void {
    const player = this.players.find((p) => p.peer === peer);
    if (!player) return;
    player.peer = null;
    player.live = false;
    player.rejoin = false;
    this.cancelAsks(player);
    // In the lobby they're simply gone; mid-game their seat waits for them (the AI plays it meanwhile).
    if (!this.playing || player.seat < 0) this.players = this.players.filter((p) => p !== player);
    this.lobbyChanged();
  }

  /** Everyone in the room, the host first. */
  lobbyPlayers(): LobbyPlayer[] {
    return [
      { name: this.me.name, avatar: this.me.avatar, host: true, away: false },
      ...this.players.map((p) => ({ name: p.profile.name, avatar: p.profile.avatar, host: false, away: !p.peer })),
    ];
  }

  private cancelAsks(player: Player): void {
    for (const ask of [...this.asks.values()]) if (ask.player === player) ask.resolve(null);
  }

  lobbyChanged(): void {
    const msg: HostMsg = { t: 'lobby', code: this.code, playing: this.playing, settings: this.settings, players: this.lobbyPlayers() };
    for (const p of this.players) this.send(p, msg);
    this.onChange();
  }

  send(player: Player, msg: HostMsg): void {
    if (player.peer) this.link.send(msg, player.peer);
  }

  /** Asks a player for a decision; null if they're gone or never answer. */
  ask(player: Player, ask: Ask, seats: ReturnType<typeof encodeSeats>): Promise<unknown> {
    if (!player.peer || !player.live) return Promise.resolve(null);
    const id = this.nextAsk++;
    return new Promise((resolve) => {
      let timer = 0;
      const done = (v: unknown) => {
        window.clearTimeout(timer);
        this.asks.delete(id);
        resolve(v);
      };
      this.asks.set(id, { player, resolve: done });
      const t = this.settings.decisionTime;
      if (t) timer = window.setTimeout(() => done(null), (t + ASK_SLACK) * 1000);
      this.send(player, { t: 'ask', id, ask, seats });
    });
  }

  close(): void {
    for (const p of this.players) this.send(p, { t: 'bye', reason: 'The host closed the room.' });
    // Give the goodbyes a moment to go out before the connections drop.
    window.setTimeout(() => this.link.close(), 300);
  }
}

/** Per seat, for each person's result board. */
interface SeatStats {
  bestHand: number;
  wins: number;
  losses: number;
  drops: number;
}

/**
 * The host's MatchView: plays everything on the host's own table and relays it to every player from
 * their side (their own swaps and bets come back to them as the player's, the host's go out as an opponent's).
 */
class NetView implements MatchView {
  /** Seats whose cards have been shown down this round. */
  private shown = new Set<number>();
  readonly stats: SeatStats[];

  constructor(readonly local: TableView, private session: HostSession, readonly seats: Seat[], private hostSeat: number,
    private rounds: number, private table: Table) {
    this.stats = seats.map(() => ({ bestHand: 0, wins: 0, losses: 0, drops: 0 }));
  }

  playerAt(index: number): Player | undefined {
    return this.session.players.find((p) => p.seat === index);
  }

  /** Who sits in a seat, as `viewer` sees it. */
  private who(viewer: number) {
    return (s: Seat): Who => {
      if (s.index === viewer) return 'me';
      if (s.index === this.hostSeat) return { player: this.session.me };
      const p = this.playerAt(s.index);
      if (p) return { player: p.profile };
      return s.character ? { ai: s.character.id } : null;
    };
  }

  snapshot(p: Player) {
    return encodeSeats(this.seats, this.who(p.seat), p.seat, this.shown);
  }

  private viewers(): Player[] {
    return this.session.players.filter((p) => p.live && p.peer);
  }

  /** Sends each player their version of an event (null: nothing for them). */
  private emit(ev: ViewEvent | ((p: Player) => ViewEvent | null)): void {
    for (const p of this.viewers()) {
      const e = typeof ev === 'function' ? ev(p) : ev;
      if (e) this.session.send(p, { t: 'ev', ev: e, seats: this.snapshot(p) });
    }
  }

  /** Someone is deciding: everyone else sees whose turn it is and their clock. */
  think(seat: Seat): void {
    const seconds = this.session.settings.decisionTime;
    this.emit((p) => (p.seat === seat.index ? null : { m: 'think', seat: seat.index, seconds }));
    if (seat.index !== this.hostSeat) this.local.thinking(seatName(seat), seconds);
  }

  /** Seat a returning player again: the table as it stands, then the hand from the start. */
  private resync(): void {
    for (const p of this.session.players) {
      if (!p.rejoin || !p.peer || p.seat < 0) continue;
      p.rejoin = false;
      p.live = true;
      this.session.send(p, { t: 'start', seats: this.snapshot(p), rounds: this.rounds, decisionTime: this.session.settings.decisionTime });
    }
    this.session.lobbyChanged();
  }

  async seated(joined: Seat[], seats: Seat[]): Promise<void> {
    this.emit({ m: 'seated', joined: joined.map((s) => s.index) });
    await this.local.seated(joined, seats);
  }

  async roundStart(round: number, seats: Seat[], ante: number): Promise<void> {
    this.shown.clear();
    this.resync();
    this.emit({ m: 'roundStart', round, ante });
    await this.local.roundStart(round, seats, ante);
  }

  dealPlayer(hand: Card[]): Promise<void> {
    return this.local.dealPlayer(hand);
  }

  sortPlayer(hand: Card[]): Promise<void> {
    return this.local.sortPlayer(hand);
  }

  async dealOpponents(seats: Seat[]): Promise<void> {
    this.emit((p) => (seats[p.seat].busted ? null : { m: 'dealPlayer', hand: [...seats[p.seat].hand] }));
    this.emit({ m: 'dealOpponents' });
    await this.local.dealOpponents(seats);
  }

  async opponentSwap(seat: Seat, swapped: number, tell: boolean): Promise<void> {
    this.emit((p) => (p.seat === seat.index
      ? { m: 'playerSwap', hand: [...seat.hand], holds: seat.holds ?? [true, true, true, true, true] }
      : { m: 'opponentSwap', seat: seat.index, swapped, tell }));
    this.local.stopThinking();
    await this.local.opponentSwap(seat, swapped, tell);
  }

  askHolds(hand: Card[], hint: boolean[]): Promise<boolean[]> {
    this.think(this.seats[this.hostSeat]);
    return this.local.askHolds(hand, hint);
  }

  async playerSwap(hand: Card[], holds: boolean[]): Promise<void> {
    this.emit({ m: 'opponentSwap', seat: this.hostSeat, swapped: holds.filter((h) => !h).length, tell: false });
    await this.local.playerSwap(hand, holds);
  }

  async betRoundStart(seats: Seat[], opener: number): Promise<void> {
    for (const s of live(seats)) this.stats[s.index].bestHand = Math.max(this.stats[s.index].bestHand, s.score);
    this.emit({ m: 'betRoundStart', opener });
    await this.local.betRoundStart(seats, opener);
  }

  async opponentBet(seat: Seat, action: BetAction): Promise<void> {
    this.emit((p) => (p.seat === seat.index
      ? { m: 'playerBet', seat: seat.index, action: ACTION_BET[action] }
      : { m: 'opponentBet', seat: seat.index, action }));
    this.local.stopThinking();
    await this.local.opponentBet(seat, action);
  }

  askBet(options: PlayerBet[], seats: Seat[], rate: number, allIn: boolean): Promise<PlayerBet> {
    this.think(this.seats[this.hostSeat]);
    return this.local.askBet(options, seats, rate, allIn);
  }

  async playerBet(seat: Seat, action: PlayerBet): Promise<void> {
    this.emit({ m: 'opponentBet', seat: seat.index, action: BET_ACTION[action] });
    await this.local.playerBet(seat, action);
  }

  async betRoundEnd(seats: Seat[]): Promise<void> {
    this.emit({ m: 'betRoundEnd' });
    await this.local.betRoundEnd(seats);
  }

  async showdownStart(): Promise<void> {
    this.emit({ m: 'showdownStart' });
    await this.local.showdownStart();
  }

  async reveal(seat: Seat): Promise<void> {
    if (!seat.dropped) this.shown.add(seat.index);
    this.emit({ m: 'reveal', seat: seat.index });
    await this.local.reveal(seat);
  }

  async awaitMatch(): Promise<void> {
    this.emit({ m: 'awaitMatch' });
    await this.local.awaitMatch();
  }

  async roundWinner(winners: Seat[], seats: Seat[], allFolded: boolean): Promise<void> {
    for (const s of live(seats)) {
      const st = this.stats[s.index];
      if (winners.includes(s)) st.wins++;
      else if (s.dropped) st.drops++;
      else st.losses++;
    }
    this.emit({ m: 'roundWinner', winners: winners.map((s) => s.index), allFolded });
    await this.local.roundWinner(winners, seats, allFolded);
  }

  async payout(winners: Seat[], won: number[], seats: Seat[]): Promise<void> {
    this.emit({ m: 'payout', winners: winners.map((s) => s.index), won });
    await this.local.payout(winners, won, seats);
  }

  async busted(seats: Seat[], out: Seat[], places: number[]): Promise<void> {
    this.emit({ m: 'busted', out: out.map((s) => s.index), places });
    await this.local.busted(seats, out, places);
  }

  /** Each person's own result board. */
  summaryFor(index: number, places: number[]): GameSummary {
    const st = this.stats[index];
    const seat = this.seats[index];
    const { winner } = finalPlaces(this.seats);
    return {
      winner,
      champions: new Set(this.seats.filter((s) => places[s.index] === 1).map((s) => s.index)),
      left: [['Ranking', ordinal(places[index])], ['Round', `${this.table.round}/${this.rounds}`], ['Coin', seat.coins],
        ['BestHand', `"${handName(st.bestHand)}"`]],
      right: [['Win', st.wins], ['Lose', st.losses], ['Drop', st.drops]],
      won: places[index] === 1,
    };
  }

  async gameSet(summary: GameSummary, seats: Seat[]): Promise<void> {
    const { places } = finalPlaces(seats);
    this.emit((p) => {
      const s = this.summaryFor(p.seat, places);
      return { m: 'gameSet', summary: { ...s, champions: [...s.champions] } };
    });
    await this.local.gameSet(summary, seats);
  }
}

/** Plays one game with everyone in the room and the AI picks; back to the lobby after. */
export async function playNetGame(stage: HTMLElement, session: HostSession, ais: Character[]): Promise<void> {
  const { rounds, decisionTime } = session.settings;
  const people = session.players.filter((p) => p.peer).slice(0, MAX_SEATS - 1);
  ais = ais.slice(0, MAX_SEATS - 1 - people.length);
  // Everyone sits down in random order.
  type Occupant = { host: true } | { player: Player } | { ai: Character };
  const occupants: Occupant[] = [{ host: true }, ...people.map((player) => ({ player })), ...ais.map((ai) => ({ ai }))];
  for (let i = occupants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [occupants[i], occupants[j]] = [occupants[j], occupants[i]];
  }
  const seats = occupants.map((o, i) => newSeat(i,
    'host' in o ? null : 'ai' in o ? o.ai : avatarCharacter(o.player.profile.avatar, o.player.profile.name, o.player.profile.key),
    START_COINS));
  for (const p of session.players) {
    const at = occupants.findIndex((o) => 'player' in o && o.player === p);
    Object.assign(p, { seat: at, live: at >= 0 && !!p.peer, rejoin: false });
  }
  const hostSeat = occupants.findIndex((o) => 'host' in o);
  session.playing = true;
  const table: Table = { id: 1, seats, father: seats.length - 1, round: 0, ante: 1 };

  let local!: TableView;
  await fade(stage, async () => {
    await preloadArt(seats);
    local = new TableView(stage, seats, { roundLimit: rounds, decisionTime, autoNext: 6, online: true });
  });
  const view = new NetView(local, session, seats, hostSeat, rounds, table);
  for (const p of session.players) {
    if (p.live) session.send(p, { t: 'start', seats: view.snapshot(p), rounds, decisionTime });
  }
  session.lobbyChanged();

  const control: SeatControl = {
    controls: (s) => !!view.playerAt(s.index)?.live,
    async holds(s, hint) {
      const p = view.playerAt(s.index)!;
      view.think(s);
      const v = await session.ask(p, { kind: 'holds', hint }, view.snapshot(p));
      return Array.isArray(v) && v.length === 5 && v.every((h) => typeof h === 'boolean') ? v : null;
    },
    async bet(s, options, rate, allIn) {
      const p = view.playerAt(s.index)!;
      view.think(s);
      const v = await session.ask(p, { kind: 'bet', options, rate, allIn }, view.snapshot(p));
      return options.includes(v as PlayerBet) ? (v as PlayerBet) : null;
    },
  };

  const ranks = new RankTracker();
  const key = (s: Seat) => String(s.index);
  const track = () => ranks.update(seats.map((s) => [key(s), s.busted ? -1 : s.coins + s.paid]));
  track();
  const removeBoard = installScoreboard(stage, () => ({
    title: `Online Game  ${session.code}`,
    info: [`Round ${local.round || 1} of ${rounds}`],
    rows: [...seats].sort((a, b) => b.coins + b.paid - (a.coins + a.paid)).map((s, i): ScoreRow => ({
      rank: i + 1, character: s.character as Character | null, name: seatName(s), me: s.human,
      value: s.busted ? 'OUT' : String(s.coins), out: s.busted, move: s.busted ? undefined : ranks.move(key(s)),
      note: view.playerAt(s.index) && !view.playerAt(s.index)!.live ? '(away)' : undefined,
    })),
  }));

  let bustSeq = 0;
  await view.seated(seats.filter((s) => s.index !== hostSeat), seats);
  while (true) {
    await playRound(table, view, Math.random, null, (out) => {
      bustSeq++;
      out.forEach((s) => (s.bustRank = bustSeq));
      return out.map(() => live(seats).length + 1);
    }, control);
    track();
    if (live(seats).length <= 1 || table.round >= rounds) break;
  }
  const { places } = finalPlaces(seats);
  await view.gameSet(view.summaryFor(hostSeat, places), seats);
  removeBoard();

  // Back to the lobby: whoever is still here stays for the next game.
  session.playing = false;
  session.players = session.players.filter((p) => p.peer);
  for (const p of session.players) {
    Object.assign(p, { seat: -1, live: false, rejoin: false });
    session.send(p, { t: 'end' });
  }
  session.lobbyChanged();
  await fade(stage, () => local.destroy());
}

/** Everyone's sprites, before the table opens. */
export const preloadArt = (seats: Seat[]): Promise<unknown> =>
  preloadImages(seats.flatMap((s) => {
    const c = s.character as Character | null;
    return c ? [...Object.values(c.art), ...Object.values(c.companionArt ?? {})] : [];
  }));
