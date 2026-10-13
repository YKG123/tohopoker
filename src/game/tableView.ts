// MatchView for the real table. Waits are the gaps between the SWF's timeline labels (frames at 52fps).
// The player always sits at the bottom; the other seats spread across the top in turn order. While
// spectating a tournament table there is no player: every seat is across the top.
import type { Character } from '../characters';
import type { BetAction } from '../engine/ai';
import type { Card } from '../engine/cards';
import { handName } from '../engine/hand';
import type { Emotion } from '../engine/types';
import { type GameSummary, type MatchView, type PlayerBet, type Seat, ordinal } from '../engine/match';
import { player } from '../player';
import { type Music, play, playBgm, setBgmVolume, stopBgm } from '../ui/assets';
import { Clip, autoplay, el, frames, layer, place, textField } from '../ui/stage';
import { BANNER_H, Banner, type BannerOptions, Buttons, Dealer, OpponentSeat, PlayerHand, PlayerPanel, type SeatLayers, type SeatSpot, seatLayout } from '../ui/table';

const BET_SOUND: Record<BetAction, 'drop' | 'call' | 'raise' | 'raise2'> = { 0: 'drop', 1: 'call', 2: 'raise', 3: 'raise2' };
/** Banner rows stack down to the top of the player's box. */
const ROWS_H = 192;

interface Slot {
  character: Character;
  table: OpponentSeat;
  banner: Banner;
  /** Already faded out (went broke). */
  gone: boolean;
}

/** Spectating speeds on the slider. */
export const WATCH_SPEEDS = [0.5, 1, 1.5, 2, 3, 5, 8];

export interface TableOptions {
  /** Cash games: the scheduled number of rounds, shown on the dealer's sign. */
  roundLimit?: number;
  /** Spectating: the Skip button's action. */
  onSkip?: () => void;
  /** Called as each round starts, before anything is shown. */
  onRound?: () => void;
  /** Spectating: ◀ ▶ pick another table to watch (-1/+1); returns the caption to show until it switches. */
  onSwitch?: (dir: -1 | 1) => string;
  /** Spectating: the speed slider's starting value and what it changes. */
  speed?: { value: number; onChange: (v: number) => void };
  /** Spectating: the line under the table. */
  caption?: string;
}

export const seatName = (s: Seat): string => s.character?.name ?? player.name;

export class TableView implements MatchView {
  private root: HTMLElement;
  private layers: SeatLayers;
  private bannerLayer: HTMLElement;
  private slots = new Map<number, Slot>();
  private spots: SeatSpot[];
  private n: number;
  /** The player's seat, or -1 while spectating. */
  private me: number;
  private dealer: Dealer;
  private panel: PlayerPanel;
  private hand: PlayerHand;
  private buttons: Buttons;
  private result: HTMLDivElement[];
  private spectateBar?: HTMLElement;
  private bgmTrack = Math.floor(Math.random() * 3) + 1;
  private ante = 0;
  /** The round being played (for the scoreboard). */
  round = 0;

  constructor(stage: HTMLElement, seats: Seat[], private opts: TableOptions = {}) {
    this.n = seats.length;
    this.me = seats.findIndex((s) => s.human && !s.busted);
    const count = this.me >= 0 ? this.n - 1 : this.n;
    this.spots = seatLayout(count);
    this.root = layer(stage, 'table-scene');
    // Backdrop, then the characters, then the felt: the table's own curved rail hides their lower half.
    new Clip(layer(this.root), 'table', 0, 0).show('table');
    const figures = layer(this.root, 'figures');
    const felt = layer(this.root);
    new Clip(felt, 'table', 0, 0).show('table-felt');
    // Other table sizes draw their own coin boxes: paint over the three baked into the felt art.
    if (count !== 3) place(el('div', 'label-cover', felt), 0, 0, 400, 25);
    const onTable = layer(this.root, 'on-table');
    const cards = layer(this.root, 'cards');
    this.hand = new PlayerHand(cards, cards);
    const panelLayer = layer(this.root);
    this.panel = new PlayerPanel(panelLayer);
    this.layers = { onTable, figures, coins: layer(this.root, 'coins') };
    this.bannerLayer = layer(this.root, 'banners');
    this.dealer = new Dealer(layer(this.root, 'dealer'));
    const ui = layer(this.root, 'controls');
    this.result = [[40, 195], [130, 195], [210, 195], [270, 195]].map(([x, y]) => textField(ui, 'result-text', x, y));
    this.buttons = new Buttons(ui);
    if (this.me < 0) {
      panelLayer.style.display = 'none';
      cards.style.display = 'none';
      this.spectateBar = layer(ui, 'spectate-bar');
      // Repaint the bottom strip: the player's coin box is baked into the art under where the panel was.
      place(el('div', 'spectate-cover', this.spectateBar), 0, 192, 400, 108);
      const caption = textField(this.spectateBar, 'spectate-text', 12, 204, 376, 50);
      caption.textContent = `${opts.caption ?? 'Spectating'}\nPress Tab for the standings.`;
      const button = (x: number, w: number, text: string, onClick: () => void, cls = '') => {
        const b = el('button', `menu-button ${cls}`, this.spectateBar!);
        place(b, x, 268, w, 24);
        b.textContent = text;
        b.addEventListener('click', () => {
          play('card');
          onClick();
        });
        return b;
      };
      if (opts.onSwitch) {
        const to = (dir: -1 | 1) => (caption.textContent = `${opts.onSwitch!(dir)}\nPress Tab for the standings.`);
        button(12, 72, '◀ Table', () => to(-1), 'blue');
        button(88, 72, 'Table ▶', () => to(1), 'blue');
      }
      if (opts.speed) {
        const { value, onChange } = opts.speed;
        const label = textField(this.spectateBar, 'spectate-speed', 168, 262, 100, 14);
        const slider = el('input', 'speed-slider', this.spectateBar);
        place(slider, 168, 276, 100, 16);
        slider.type = 'range';
        slider.min = '0';
        slider.max = String(WATCH_SPEEDS.length - 1);
        slider.value = String(Math.max(0, WATCH_SPEEDS.indexOf(value)));
        slider.setAttribute('aria-label', 'Spectating speed');
        const show = () => (label.textContent = `Speed x${WATCH_SPEEDS[+slider.value]}`);
        slider.addEventListener('input', () => {
          show();
          onChange(WATCH_SPEEDS[+slider.value]);
        });
        // Arrow keys stay on the slider; Tab still goes to the standings rather than moving focus.
        slider.addEventListener('keydown', (e) => e.key !== 'Tab' && e.stopPropagation());
        slider.addEventListener('change', () => slider.blur());
        show();
      }
      if (opts.onSkip) {
        const skip = button(276, 112, 'Stop Spectating', () => {
          skip.disabled = true;
          opts.onSkip!();
        });
      }
    }
    this.sync(seats);
  }

  destroy(keepMusic = false): void {
    if (!keepMusic) stopBgm();
    this.root.remove();
  }

  // --- Seats -------------------------------------------------------------------------------------
  /** Position across the top, left to right: the seats after the player's, in turn order. */
  private pos(index: number): number {
    return this.me >= 0 ? (index - this.me - 1 + this.n) % this.n : index;
  }

  /** Opponents still at the table, in position order: the bet rounds stack one row each,
   *  so a five-seat table down to four players draws four rows, not four and a gap. */
  private rows(): number[] {
    return [...this.slots].filter(([, slot]) => !slot.gone).map(([i]) => i).sort((a, b) => this.pos(a) - this.pos(b));
  }

  private get rowH(): number {
    return Math.min(BANNER_H, Math.floor(ROWS_H / Math.max(1, this.rows().length)));
  }

  private row(seat: Seat): number {
    const r = this.rows().indexOf(seat.index);
    return r >= 0 ? r : this.pos(seat.index);
  }

  private rowY(seat: Seat): number {
    return this.row(seat) * this.rowH;
  }

  /** A seat's close-up: in its row (scaled to the row height), or full size for the mid-table cut-ins at y 71. */
  private banner(seat: Seat, y: number, emotion: Emotion, text: string, o: BannerOptions = {}): Promise<void> {
    const banner = this.slots.get(seat.index)!.banner;
    // Rows alternate sides; the mid-table cut-ins keep the seat's own side.
    banner.setMirrored((y === 71 ? this.pos(seat.index) : this.row(seat)) % 2 === 1);
    return banner.enter(y, emotion, text, { height: y === 71 ? BANNER_H : this.rowH, ...o });
  }

  /** Matches the seats to who's sitting in them; returns the slots of anyone who left. */
  private sync(seats: Seat[]): Slot[] {
    const left: Slot[] = [];
    for (const s of seats) {
      if (s.index === this.me) continue;
      const slot = this.slots.get(s.index);
      const who = s.vacant ? null : (s.character as Character);
      if (slot && slot.character === who) continue;
      if (slot) {
        this.slots.delete(s.index);
        left.push(slot);
      }
      if (who) {
        const p = this.pos(s.index);
        const table = new OpponentSeat(this.layers, this.spots[p], who);
        table.setVisible(false);
        this.slots.set(s.index, { character: who, table, banner: new Banner(this.bannerLayer, who, p % 2 === 1), gone: false });
      }
    }
    return left;
  }

  private updateCoins(seats: Seat[]): void {
    for (const s of seats) {
      if (s.index === this.me) this.panel.setCoins(s.coins, s.paid);
      else this.slots.get(s.index)?.table.setCoins(s.coins, s.busted);
    }
  }

  private allInLine(seat: Seat): string {
    return seat.character?.lines.allIn ?? 'All in!';
  }

  private line(seat: Seat, key: Exclude<keyof Character['lines'], 'busted' | 'allIn'>, n?: number): string {
    return seat.character!.lines[key].replaceAll('{n}', String(n ?? '')).replaceAll('{s}', n === 1 ? '' : 's');
  }

  private info(seat: Seat, betShown = true): string {
    return `Change:${5 - seat.holdCount}  Bet:${betShown ? seat.paid : '--'}`;
  }

  private async clearBanners(): Promise<void> {
    for (const slot of this.slots.values()) {
      slot.banner.leave();
      await frames(1);
    }
  }

  // --- Seating -----------------------------------------------------------------------------------
  /** Greeting cut-in (not in the SWF): each new arrival says hello as they take their seat.
   *  Stacked in seat rows like the bet round, then cleared together. Anyone who left fades out first. */
  async seated(joined: Seat[], seats: Seat[]): Promise<void> {
    const left = this.sync(seats);
    for (const slot of left) {
      slot.banner.remove();
      if (!slot.gone) await slot.table.fadeOut();
      slot.table.remove();
    }
    this.updateCoins(seats);
    const greeters = joined.filter((s) => s.character && this.slots.has(s.index));
    for (const s of greeters) {
      const table = this.slots.get(s.index)!.table;
      table.setVisible(true);
      await table.setPose('normal');
      await this.banner(s, this.rowY(s), 'neutral', this.line(s, 'greeting'));
      await frames(24);
    }
    await frames(40);
    await this.clearBanners();
    await frames(20);
  }

  /** A message on the dealer's sign (table changes, ante ups). */
  async announce(text: string): Promise<void> {
    await this.dealer.say(text);
    await frames(70);
    await this.dealer.out();
  }

  // --- Round setup and deal ----------------------------------------------------------------------
  get hasPlayer(): boolean {
    return this.me >= 0;
  }

  async roundStart(round: number, seats: Seat[], ante: number): Promise<void> {
    this.round = round;
    this.opts.onRound?.();
    if ((round - 1) % 4 === 0 || !this.ante) {
      if (round > 1) this.bgmTrack = (this.bgmTrack % 3) + 1;
      playBgm(`bgm${this.bgmTrack}` as Music);
    }
    this.result.forEach((r) => (r.textContent = ''));
    for (const s of seats) {
      const slot = this.slots.get(s.index);
      if (!slot) continue;
      slot.table.setVisible(!s.busted);
      if (s.busted) continue;
      await slot.table.setPose('normal');
      slot.table.clearTable();
      slot.table.showBet(s.bet);
    }
    this.panel.set('normal');
    this.hand.hideAll();
    this.updateCoins(seats);
    await this.dealer.say(this.opts.roundLimit ? `Round ${round}/${this.opts.roundLimit}` : `Round ${round}`);
    if (this.ante && ante !== this.ante) {
      await frames(30);
      play('bell');
      await this.dealer.say2(`Ante ${ante}!`);
      await frames(30);
    }
    this.ante = ante;
  }

  async dealPlayer(hand: Card[]): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await this.hand.deal(i, hand[i]);
      await frames(2);
    }
  }

  async sortPlayer(hand: Card[]): Promise<void> {
    await frames(8);
    await this.hand.reflip(hand);
  }

  async dealOpponents(seats: Seat[]): Promise<void> {
    if (this.me < 0) await frames(20);
    for (const s of seats) {
      const t = this.slots.get(s.index)?.table;
      if (t && !s.busted && t.currentPose === 'normal') await t.setPose('card');
    }
    await frames(1);
    await this.dealer.out();
  }

  // --- Card swap ---------------------------------------------------------------------------------
  async opponentSwap(seat: Seat, swapped: number, tell: boolean): Promise<void> {
    const slot = this.slots.get(seat.index)!;
    const text = swapped ? this.line(seat, 'swap', swapped) : this.line(seat, 'keep');
    await this.banner(seat, 71, 'neutral', text);
    await frames(3);
    play('card');
    slot.table.showSwapped(swapped);
    await frames(31);
    if (tell) {
      await slot.banner.swapFace('tell');
      await frames(26);
    } else {
      await frames(16);
    }
    await slot.banner.leave();
  }

  async askHolds(_hand: Card[], hint: boolean[]): Promise<boolean[]> {
    await this.dealer.say('Change?');
    this.hand.setHolds(hint);
    this.hand.enableHolds(true);
    // As in the original, the dealer's "Change?" sign is the confirm button.
    if (autoplay) await frames(10);
    else await this.dealer.button('Change?');
    this.hand.enableHolds(false);
    return [...this.hand.held];
  }

  async playerSwap(hand: Card[], holds: boolean[]): Promise<void> {
    for (let i = 0; i < 5; i++) if (!holds[i]) await this.hand.discard(i);
    for (let i = 0; i < 5; i++) {
      if (holds[i]) continue;
      play('card');
      await this.hand.deal(i, hand[i]);
    }
    await this.dealer.out();
    if (holds.every(Boolean)) return;
    play('card');
    await this.hand.reflip([...hand].sort());
  }

  // --- Betting -----------------------------------------------------------------------------------
  async betRoundStart(seats: Seat[], opener: number): Promise<void> {
    await this.dealer.say('Bet Round');
    await frames(30);
    await this.dealer.out();
    // Rows above the opener wait their turn ("……"); seats all-in for the ante just watch.
    const order = seats.filter((s) => this.slots.has(s.index) && !s.busted).sort((a, b) => this.pos(a.index) - this.pos(b.index));
    for (const s of order) {
      if (s.allIn) {
        await this.banner(s, this.rowY(s), 'neutral', this.allInLine(s), { info: this.info(s) });
        await frames(23);
      } else if (opener !== this.me && this.pos(s.index) < this.pos(opener) && !s.dropped) {
        await this.banner(s, this.rowY(s), 'neutral', '……', { info: this.info(s, false) });
        await frames(23);
      }
    }
  }

  async opponentBet(seat: Seat, action: BetAction): Promise<void> {
    const table = this.slots.get(seat.index)!.table;
    const y = this.rowY(seat);
    play(BET_SOUND[action]);
    if (action === 0) {
      table.setPose('drop');
      table.ocard.play(6, 8);
      await this.banner(seat, y, 'lose', this.line(seat, 'drop'), { dim: true, info: this.info(seat) });
    } else {
      const key = action === 1 ? 'call' : action === 2 ? 'raise' : 'raise2';
      await this.banner(seat, y, 'neutral', seat.allIn ? this.allInLine(seat) : this.line(seat, key), { info: this.info(seat) });
      table.showBet(seat.bet);
    }
    // The SWF only refreshed these at showdown; showing coins as they're paid avoids reading stale counts.
    table.setCoins(seat.coins, seat.busted);
    await frames(24);
  }

  async askBet(options: PlayerBet[], seats: Seat[], _rate: number, allIn: boolean): Promise<PlayerBet> {
    this.updateCoins(seats);
    if (autoplay) return options.includes('call') ? 'call' : options[0];
    return this.buttons.choose(options, false, allIn ? { call: 'All In' } : {});
  }

  async playerBet(seat: Seat, action: PlayerBet): Promise<void> {
    play(action === 'drop' ? 'drop' : action);
    if (action === 'drop') this.panel.set('drop');
    this.panel.setCoins(seat.coins, seat.paid);
    await frames(21);
  }

  async betRoundEnd(seats: Seat[]): Promise<void> {
    this.updateCoins(seats);
    await frames(21);
    await this.clearBanners();
    await frames(20);
  }

  // --- Showdown ----------------------------------------------------------------------------------
  async showdownStart(): Promise<void> {
    await this.dealer.say('ShowDown');
    await frames(30);
    await this.dealer.out();
  }

  async reveal(seat: Seat): Promise<void> {
    if (seat.index === this.me) {
      play(seat.dropped ? 'drop' : 'card');
      this.panel.set(seat.dropped ? 'dropOpen' : 'open', seat.dropped ? '……' : handName(seat.score));
      await frames(25);
      return;
    }
    const slot = this.slots.get(seat.index);
    if (!slot) return;
    const y = this.rowY(seat);
    if (seat.dropped) {
      play('drop');
      await this.banner(seat, y, 'lose', '……', { dim: true });
    } else {
      play('card');
      await slot.table.setPose('normal');
      slot.table.ocard.play(3, 5);
      await this.banner(seat, y, 'neutral', handName(seat.score), { hand: seat.hand });
    }
    await frames(24);
  }

  async awaitMatch(): Promise<void> {
    if (autoplay || this.me < 0) return frames(60);
    await this.buttons.choose(['next'], true);
  }

  async roundWinner(winners: Seat[], seats: Seat[], allFolded: boolean): Promise<void> {
    await this.clearBanners();
    for (const s of seats) {
      const slot = this.slots.get(s.index);
      if (!slot || s.busted) continue;
      const won = winners.includes(s);
      await slot.table.setPose(won ? 'win' : 'drop');
      if (won && allFolded) slot.table.ocard.play(6, 8);
    }
    this.panel.set(winners.some((w) => w.index === this.me) ? 'win' : 'drop');
    await this.dealer.say(winners.length === 1 ? `${seatName(winners[0])} Win!` : 'Split Pot!');
    await frames(48);
  }

  async payout(winners: Seat[], won: number[], seats: Seat[]): Promise<void> {
    this.updateCoins(seats);
    for (const s of seats) if (!s.busted) this.slots.get(s.index)?.table.showBet(0);
    play('coin');
    const shares = winners.map((w) => won[w.index]);
    const text = winners.length === 1 ? `Coin +${shares[0]}`
      : shares.every((x) => x === shares[0]) ? `+${shares[0]} each`
      : `Coin +${shares.reduce((a, b) => a + b, 0)}`;
    await this.dealer.say2(text);
    await frames(61);
    // Side pots the main winners weren't in (or a bet nobody could call, handed back).
    for (const s of seats) {
      if (winners.includes(s) || !won[s.index]) continue;
      await this.dealer.say2(`${s.dropped ? 'Back to' : 'Side Pot:'} ${seatName(s)} +${won[s.index]}`);
      await frames(61);
    }
    await this.dealer.out();
  }

  /** Bust cut-in (not in the SWF): each player who went broke gets a last word and their finishing place. */
  async busted(seats: Seat[], out: Seat[], places: number[]): Promise<void> {
    this.updateCoins(seats);
    // Worst place first: 53rd, then 52nd, then 51st.
    const order = out.map((s, i) => [s, places[i]] as const).sort((a, b) => b[1] - a[1]);
    for (const [s, place] of order) {
      const slot = this.slots.get(s.index);
      if (!slot || !s.character) continue; // the player going out is handled by the game itself
      await slot.table.setPose('drop');
      play('drop');
      await this.banner(s, 71, 'lose', s.character.lines.busted ?? s.character.lines.drop, {
        dim: true, info: `OUT  ${ordinal(place)} place`, bust: true,
      });
      await frames(110);
      await slot.banner.leave();
      await slot.table.fadeOut();
      slot.gone = true;
    }
    for (const s of seats) {
      const slot = this.slots.get(s.index);
      if (slot && s.busted) {
        slot.table.setVisible(false);
        slot.banner.hide();
      }
    }
  }

  /** Spectating: someone went out at another table. Their cut-in, labelled with where it happened. */
  async bustedElsewhere(character: Character, place: number, table: number): Promise<void> {
    const banner = new Banner(this.bannerLayer, character, false);
    play('drop');
    await banner.enter(71, 'lose', character.lines.busted ?? character.lines.drop, {
      height: BANNER_H, dim: true, info: `OUT  ${ordinal(place)} place  (Table ${table})`, bust: true,
    });
    await frames(110);
    await banner.leave();
    banner.remove();
  }

  // --- Game set ----------------------------------------------------------------------------------
  async gameSet(summary: GameSummary, seats: Seat[]): Promise<void> {
    setBgmVolume(0.5);
    this.spectateBar?.remove();
    for (const s of seats) {
      const slot = this.slots.get(s.index);
      if (!slot) continue;
      slot.table.showBet(0);
      if (!s.busted) {
        await slot.table.setPose('normal');
        slot.table.clearTable();
      }
    }
    this.panel.set('normal');
    this.hand.hideAll();
    await frames(21);
    stopBgm();
    await frames(56);
    play('bell');
    await this.dealer.say('Game Set!', null);
    await frames(120);
    await this.dealer.say2(`${seatName(seats[summary.winner])} Win!`);
    await frames(11);
    for (const s of seats) {
      const slot = this.slots.get(s.index);
      if (!slot) continue;
      slot.table.setVisible(true);
      await slot.table.setPose(summary.champions.has(s.index) ? 'win' : 'drop');
    }
    if (this.me >= 0) {
      this.panel.set(summary.won ? 'win' : 'drop');
      play(summary.won ? 'win' : 'lose');
    }
    await frames(121);
    this.result[0].textContent = `                 - Result -\n${summary.left.map(([k]) => ` ${k}`).join('\n')}`;
    this.result[1].textContent = `\n${summary.left.map(([, v]) => v).join('\n')}`;
    this.result[2].textContent = `\n${summary.right.map(([k]) => ` ${k}`).join('\n')}`;
    this.result[3].textContent = `\n${summary.right.map(([, v]) => v).join('\n')}`;
    await frames(121);
    await this.dealer.say2('Thank You!');
    await frames(11);
    await this.dealer.button('Thank You!');
  }
}
