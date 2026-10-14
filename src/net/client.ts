// A player's side of an online game: their own table view, replaying what the host sends from their seat,
// and their decisions sent back when asked.
import type { Character } from '../characters';
import type { PlayerBet, Seat } from '../engine/match';
import { fade } from '../game/screens';
import { TableView, seatName } from '../game/tableView';
import { RankTracker, type ScoreRow, installScoreboard } from '../ui/scoreboard';
import { timing } from '../ui/stage';
import { preloadArt } from './host';
import { type ClientMsg, type HostMsg, type Profile, SeatMirror, type ViewEvent } from './protocol';
import { type Link, openRoom } from './room';

/** Local happenings, queued with the host's messages. */
export type Inbound = HostMsg | { t: 'lost' } | { t: 'leave' };

/** Messages in arrival order, taken one at a time. */
export class Inbox {
  private queue: Inbound[] = [];
  private waiting: ((m: Inbound) => void) | null = null;

  push(m: Inbound): void {
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = null;
      w(m);
    } else {
      this.queue.push(m);
    }
  }

  next(): Promise<Inbound> {
    const m = this.queue.shift();
    return m ? Promise.resolve(m) : new Promise((r) => (this.waiting = r));
  }

  /** How far behind the host the table is. */
  get backlog(): number {
    return this.queue.filter((m) => m.t === 'ev').length;
  }
}

/** A connection to a host's room: says hello to whoever's there and listens to the host only. */
export class ClientLink {
  readonly inbox = new Inbox();
  private link: Link<HostMsg, ClientMsg>;
  private host: string | null = null;

  constructor(readonly code: string, private profile: Profile) {
    this.link = openRoom<HostMsg, ClientMsg>(code);
    this.link.onJoin = (peer) => this.link.send({ t: 'hello', profile: this.profile }, peer);
    this.link.onMessage = (msg, peer) => {
      // Other players are in the room too; only the host talks to us (its first message says which peer it is).
      if (!this.host && ['lobby', 'wait', 'start', 'bye'].includes(msg?.t)) this.host = peer;
      if (peer === this.host) this.inbox.push(msg);
    };
    this.link.onLeave = (peer) => {
      if (peer !== this.host) return;
      this.host = null;
      this.inbox.push({ t: 'lost' });
    };
  }

  get connected(): boolean {
    return this.host !== null;
  }

  answer(id: number, value: boolean[] | PlayerBet): void {
    if (this.host) this.link.send({ t: 'answer', id, value }, this.host);
  }

  close(): void {
    this.link.close();
  }
}

/**
 * Plays a game from a 'start' message until it ends ('end'), the host goes ('bye'/'lost'), or the player
 * leaves. Returns whatever message ended it. A second 'start' (back after a dropout) rebuilds the table.
 */
export async function playClientGame(stage: HTMLElement, net: ClientLink, start: Extract<HostMsg, { t: 'start' }>): Promise<Inbound> {
  const mirror = new SeatMirror();
  let seats: Seat[] = [];
  let view: TableView | null = null;
  const speed = timing.speed;

  const ranks = new RankTracker();
  const key = (s: Seat) => String(s.index);
  const track = () => ranks.update(seats.map((s) => [key(s), s.busted ? -1 : s.coins + s.paid]));
  let rounds = start.rounds;
  const removeBoard = installScoreboard(stage, () => ({
    title: `Online Game  ${net.code}`,
    info: [`Round ${view?.round || 1} of ${rounds}`],
    rows: [...seats].filter((s) => !s.vacant).sort((a, b) => b.coins + b.paid - (a.coins + a.paid)).map((s, i): ScoreRow => ({
      rank: i + 1, character: s.character as Character | null, name: seatName(s), me: s.human,
      value: s.busted ? 'OUT' : String(s.coins), out: s.busted, move: s.busted ? undefined : ranks.move(key(s)),
    })),
  }));

  const sit = async (msg: Extract<HostMsg, { t: 'start' }>) => {
    rounds = msg.rounds;
    const next = new SeatMirror().apply(msg.seats);
    await fade(stage, async () => {
      view?.destroy();
      mirror.seats = [];
      seats = mirror.apply(msg.seats);
      await preloadArt(next);
      view = new TableView(stage, seats, { roundLimit: msg.rounds, decisionTime: msg.decisionTime, autoNext: 0, online: true, onRound: track });
    });
    track();
  };
  await sit(start);

  let ended: Inbound;
  while (true) {
    const msg = await net.inbox.next();
    if (msg.t === 'start') {
      await sit(msg);
      continue;
    }
    if (msg.t === 'ev') {
      seats = mirror.apply(msg.seats);
      // Running behind (a slow tab, a long animation): catch up a little faster.
      timing.speed = net.inbox.backlog > 6 ? speed * 3 : net.inbox.backlog > 3 ? speed * 1.5 : speed;
      if (msg.ev.m !== 'think') view!.stopThinking();
      await replay(view!, seats, msg.ev);
      continue;
    }
    if (msg.t === 'ask') {
      timing.speed = speed;
      seats = mirror.apply(msg.seats);
      view!.stopThinking();
      const a = msg.ask;
      net.answer(msg.id, a.kind === 'holds' ? await view!.askHolds([], a.hint) : await view!.askBet(a.options, seats, a.rate, a.allIn));
      continue;
    }
    if (msg.t === 'lobby' || msg.t === 'wait') continue;
    ended = msg;
    break;
  }
  timing.speed = speed;
  removeBoard();
  await fade(stage, () => view?.destroy());
  return ended;
}

/** One event from the host on this player's table. */
async function replay(view: TableView, seats: Seat[], ev: ViewEvent): Promise<void> {
  const at = (i: number) => seats[i];
  switch (ev.m) {
    case 'seated': return view.seated(ev.joined.map(at), seats);
    case 'roundStart': return view.roundStart(ev.round, seats, ev.ante);
    case 'dealPlayer': return view.dealPlayer(ev.hand);
    case 'dealOpponents': return view.dealOpponents(seats);
    case 'opponentSwap': return view.opponentSwap(at(ev.seat), ev.swapped, ev.tell);
    case 'playerSwap': return view.playerSwap(ev.hand, ev.holds);
    case 'betRoundStart': return view.betRoundStart(seats, ev.opener);
    case 'opponentBet': return view.opponentBet(at(ev.seat), ev.action);
    case 'playerBet': return view.playerBet(at(ev.seat), ev.action);
    case 'betRoundEnd': return view.betRoundEnd(seats);
    case 'showdownStart': return view.showdownStart();
    case 'reveal': return view.reveal(at(ev.seat));
    case 'awaitMatch': return view.awaitMatch();
    case 'roundWinner': return view.roundWinner(ev.winners.map(at), seats, ev.allFolded);
    case 'payout': return view.payout(ev.winners.map(at), ev.won, seats);
    case 'busted': return view.busted(seats, ev.out.map(at), ev.places);
    case 'gameSet': return view.gameSet({ ...ev.summary, champions: new Set(ev.summary.champions) }, seats);
    case 'think': return view.thinking(seatName(at(ev.seat)), ev.seconds);
  }
}
