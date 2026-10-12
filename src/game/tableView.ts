// MatchView for the real table. Waits are the gaps between the SWF's timeline labels (frames at 52fps).
import type { Character } from '../characters';
import type { BetAction } from '../engine/ai';
import type { Card } from '../engine/cards';
import { handName } from '../engine/hand';
import type { MatchResult, MatchView, PlayerBet, Seat } from '../engine/match';
import { player } from '../player';
import { type Music, play, playBgm, setBgmVolume, stopBgm } from '../ui/assets';
import { Clip, autoplay, frames, layer, textField } from '../ui/stage';
import { Banner, Buttons, Dealer, OpponentSeat, PlayerHand, PlayerPanel } from '../ui/table';

const BET_SOUND: Record<BetAction, 'drop' | 'call' | 'raise' | 'raise2'> = { 0: 'drop', 1: 'call', 2: 'raise', 3: 'raise2' };

export class TableView implements MatchView {
  private root: HTMLElement;
  private seats: OpponentSeat[] = [];
  private banners: Banner[] = [];
  private dealer: Dealer;
  private panel: PlayerPanel;
  private hand: PlayerHand;
  private buttons: Buttons;
  private result: HTMLDivElement[];
  private bgmTrack = Math.floor(Math.random() * 3) + 1;

  constructor(stage: HTMLElement, opponents: Character[]) {
    this.root = layer(stage, 'table-scene');
    // Backdrop, then the characters, then the felt: the table's own curved rail hides their lower half.
    new Clip(layer(this.root), 'table', 0, 0).show('table');
    const figures = layer(this.root, 'figures');
    new Clip(layer(this.root), 'table', 0, 0).show('table-felt');
    const onTable = layer(this.root, 'on-table');
    const cards = layer(this.root, 'cards');
    this.hand = new PlayerHand(cards, cards);
    this.panel = new PlayerPanel(layer(this.root));
    const seatLayers = { onTable, figures, coins: layer(this.root, 'coins') };
    opponents.forEach((c, i) => (this.seats[i + 1] = new OpponentSeat(seatLayers, i + 1, c)));
    const banners = layer(this.root, 'banners');
    this.dealer = new Dealer(layer(this.root, 'dealer'));
    opponents.forEach((c, i) => (this.banners[i + 1] = new Banner(banners, c, i + 1 === 2)));
    const ui = layer(this.root, 'controls');
    this.result = [[40, 195], [130, 195], [210, 195], [270, 195]].map(([x, y]) => textField(ui, 'result-text', x, y));
    this.buttons = new Buttons(ui);
  }

  destroy(): void {
    stopBgm();
    this.root.remove();
  }

  private updateCoins(seats: Seat[]): void {
    for (const s of seats) {
      if (s.character) this.seats[s.index].setCoins(s.coins, s.busted);
      else this.panel.setCoins(s.coins, s.bet);
    }
  }

  private line(seat: Seat, key: Exclude<keyof Character['lines'], 'busted'>, n?: number): string {
    return seat.character!.lines[key].replace('{n}', String(n ?? '')).replace('{s}', n === 1 ? '' : 's');
  }

  private info(seat: Seat, betShown = true): string {
    return `Change:${5 - seat.holdCount}  Bet:${betShown ? seat.bet : '--'}`;
  }

  // --- Seating -----------------------------------------------------------------------------------
  /** Greeting cut-in (not in the SWF): each new arrival says hello as they take their seat. */
  /** Stacked in seat rows like the bet round, then cleared together. */
  async seated(joined: Seat[], seats: Seat[]): Promise<void> {
    this.updateCoins(seats);
    const greeters = joined.filter((s) => s.character);
    for (const s of greeters) {
      const table = this.seats[s.index];
      table.setVisible(true);
      await table.setPose('normal');
      await this.banners[s.index].enter((s.index - 1) * 64, 'neutral', this.line(s, 'greeting'));
      await frames(24);
    }
    await frames(40);
    for (const s of greeters) {
      this.banners[s.index].leave();
      await frames(1);
    }
    await frames(20);
  }

  // --- Round setup and deal ----------------------------------------------------------------------
  async roundStart(round: number, seats: Seat[]): Promise<void> {
    if ((round - 1) % 4 === 0) {
      if (round > 1) this.bgmTrack = (this.bgmTrack % 3) + 1;
      playBgm(`bgm${this.bgmTrack}` as Music);
    }
    this.result.forEach((r) => (r.textContent = ''));
    for (const s of seats.slice(1)) {
      const seat = this.seats[s.index];
      seat.setVisible(!s.busted);
      if (s.busted) continue;
      await seat.setPose('normal');
      seat.clearTable();
      seat.showBet(s.bet);
    }
    this.panel.set('normal');
    this.hand.hideAll();
    this.updateCoins(seats);
    await this.dealer.say(`Round ${round}`);
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

  async dealOpponents(): Promise<void> {
    for (const s of this.seats.slice(1)) if (s.currentPose === 'normal') await s.setPose('card');
    await frames(1);
    await this.dealer.out();
  }

  // --- Card swap ---------------------------------------------------------------------------------
  async opponentSwap(seat: Seat, swapped: number, tell: boolean): Promise<void> {
    const banner = this.banners[seat.index];
    const text = swapped ? this.line(seat, 'swap', swapped) : this.line(seat, 'keep');
    await banner.enter(71, 'neutral', text);
    await frames(3);
    play('card');
    this.seats[seat.index].showSwapped(swapped);
    await frames(31);
    if (tell) {
      await banner.swapFace('tell');
      await frames(26);
    } else {
      await frames(16);
    }
    await banner.leave();
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
  async betRoundStart(): Promise<void> {
    await this.dealer.say('Bet Round');
    await frames(30);
    await this.dealer.out();
  }

  async opponentWaits(seat: Seat): Promise<void> {
    await this.banners[seat.index].enter((seat.index - 1) * 64, 'neutral', '……', { info: this.info(seat, false) });
    await frames(23);
  }

  async opponentBet(seat: Seat, action: BetAction): Promise<void> {
    const banner = this.banners[seat.index];
    const table = this.seats[seat.index];
    const y = (seat.index - 1) * 64;
    play(BET_SOUND[action]);
    if (action === 0) {
      table.setPose('drop');
      table.ocard.play(6, 8);
      await banner.enter(y, 'lose', this.line(seat, 'drop'), { dim: true, info: this.info(seat) });
    } else {
      const key = action === 1 ? 'call' : action === 2 ? 'raise' : 'raise2';
      await banner.enter(y, 'neutral', this.line(seat, key), { info: this.info(seat) });
      table.showBet(seat.bet);
    }
    // The SWF only refreshed these at showdown; showing coins as they're paid avoids reading stale counts.
    table.setCoins(seat.coins, seat.busted);
    await frames(24);
  }

  async askBet(options: PlayerBet[], seats: Seat[]): Promise<PlayerBet> {
    this.updateCoins(seats);
    if (autoplay) return options.includes('call') ? 'call' : options[0];
    return this.buttons.choose(options);
  }

  async playerBet(seat: Seat, action: PlayerBet): Promise<void> {
    play(action === 'drop' ? 'drop' : action);
    if (action === 'drop') this.panel.set('drop');
    this.panel.setCoins(seat.coins, seat.bet);
    await frames(21);
  }

  async betRoundEnd(seats: Seat[]): Promise<void> {
    this.updateCoins(seats);
    await frames(21);
    for (const b of this.banners.slice(1)) {
      b.leave();
      await frames(1);
    }
    await frames(20);
  }

  // --- Showdown ----------------------------------------------------------------------------------
  async showdownStart(): Promise<void> {
    await this.dealer.say('ShowDown');
    await frames(30);
    await this.dealer.out();
  }

  async reveal(seat: Seat): Promise<void> {
    if (!seat.character) {
      play(seat.dropped ? 'drop' : 'card');
      this.panel.set(seat.dropped ? 'dropOpen' : 'open', seat.dropped ? '……' : handName(seat.score));
      await frames(25);
      return;
    }
    const banner = this.banners[seat.index];
    const y = (seat.index - 1) * 64;
    if (seat.dropped) {
      play('drop');
      await banner.enter(y, 'lose', '……', { dim: true });
    } else {
      play('card');
      await this.seats[seat.index].setPose('normal');
      this.seats[seat.index].ocard.play(3, 5);
      await banner.enter(y, 'neutral', handName(seat.score), { hand: seat.hand });
    }
    await frames(24);
  }

  async awaitMatch(): Promise<void> {
    if (autoplay) return frames(20);
    await this.buttons.choose(['next'], true);
  }

  async roundWinner(winner: Seat, seats: Seat[], allFolded: boolean): Promise<void> {
    for (const b of this.banners.slice(1)) {
      b.leave();
      await frames(1);
    }
    for (const s of seats.slice(1)) {
      if (s.busted) continue;
      await this.seats[s.index].setPose(s === winner ? 'win' : 'drop');
      if (s === winner && allFolded) this.seats[s.index].ocard.play(6, 8);
    }
    this.panel.set(winner.index === 0 ? 'win' : 'drop');
    await this.dealer.say(`${winner.character?.name ?? player.name} Win!`);
    await frames(48);
  }

  async payout(_winner: Seat, pot: number, seats: Seat[]): Promise<void> {
    this.updateCoins(seats);
    for (const s of seats.slice(1)) if (!s.busted) this.seats[s.index].showBet(0);
    play('coin');
    await this.dealer.say2(`Coin +${pot}`);
    await frames(61);
    await this.dealer.out();
  }

  /** Bust cut-in (not in the SWF): each player who went broke gets a last word and their finishing place. */
  async busted(seats: Seat[], out: Seat[], place: number): Promise<void> {
    this.updateCoins(seats);
    const ordinal = ['', '1st', '2nd', '3rd', '4th'][place];
    for (const s of out) {
      if (!s.character) continue; // the player busting ends the match; Game Set covers it
      const table = this.seats[s.index];
      const banner = this.banners[s.index];
      await table.setPose('drop');
      play('drop');
      await banner.enter(71, 'lose', s.character.lines.busted ?? s.character.lines.drop, {
        dim: true, info: `OUT  ${ordinal} place`, bust: true,
      });
      await frames(110);
      await banner.leave();
      await table.fadeOut();
    }
    for (const s of seats.slice(1)) {
      if (s.busted) {
        this.seats[s.index].setVisible(false);
        this.banners[s.index].hide();
      }
    }
  }

  // --- Game set ----------------------------------------------------------------------------------
  async gameSet(result: MatchResult, seats: Seat[]): Promise<void> {
    setBgmVolume(0.5);
    for (const s of seats.slice(1)) {
      const seat = this.seats[s.index];
      seat.showBet(0);
      if (!s.busted) {
        await seat.setPose('normal');
        seat.clearTable();
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
    const winner = seats[result.winner];
    await this.dealer.say2(`${winner.character?.name ?? player.name} Win!`);
    await frames(11);
    for (const s of seats.slice(1)) {
      const seat = this.seats[s.index];
      seat.setVisible(true);
      await seat.setPose(result.places[s.index] === 1 ? 'win' : 'drop');
    }
    const won = result.places[0] === 1;
    this.panel.set(won ? 'win' : 'drop');
    play(won ? 'win' : 'lose');
    await frames(121);
    const place = ['', '1st', '2nd', '3rd', '4th'][result.places[0]];
    this.result[0].textContent = `                 - Result -\n Ranking\n Round\n Coin\n BestHand    "${handName(result.bestHand)}"`;
    this.result[1].textContent = `\n${place}\n${result.rounds}\n${seats[0].coins}`;
    this.result[2].textContent = '\n Win\n Lose\n Drop';
    this.result[3].textContent = `\n${result.wins}\n${result.losses}\n${result.drops}`;
    await frames(121);
    await this.dealer.say2('Thank You!');
    await frames(11);
    await this.dealer.button('Thank You!');
  }
}

