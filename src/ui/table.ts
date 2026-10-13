// Table pieces, at the SWF's coordinates for the original three opponents (left, middle, right mirrored);
// other table sizes spread the same pieces across the top of the table.
import type { Character } from '../characters';
import type { Card } from '../engine/cards';
import type { Emotion } from '../engine/types';
import { type Sfx, play, ui, uiUrl } from './assets';
import { figureWidth, paintFace, placeFigure } from './portrait';
import { Clip, el, frames, place, textField } from './stage';

// --- Opponent at the table (In_E1-3, In_Coin1-3, In_DCard1-3, In_O_Card1-3) -------------------------
/** Where one opponent sits: face center x, face size, and whether they face the table mirrored. */
export interface SeatSpot {
  x: number;
  faceY: number;
  faceH: number;
  /** Size of the coins and table cards relative to the original three-seat table. */
  scale: number;
  flip: boolean;
  coinAt: [number, number];
  onTable: [number, number];
  /** Coin label box: left edge and width. */
  label: [number, number];
  /** Draws its own label box (the table art only has boxes for the original three seats). */
  boxed?: boolean;
}

// The original three seats, at the SWF's coordinates.
const SWF_SPOTS: SeatSpot[] = [
  { x: 66, faceY: 52, faceH: 40, scale: 1, flip: false, coinAt: [5, 145], onTable: [75, 158], label: [3, 78] },
  { x: 200, faceY: 52, faceH: 40, scale: 1, flip: false, coinAt: [133, 140], onTable: [190, 155], label: [161, 78] },
  { x: 334, faceY: 52, faceH: 40, scale: 1, flip: true, coinAt: [395, 145], onTable: [330, 158], label: [318, 78] },
];

/** Seat spots for `count` opponents across the top of the table (1-6), left to right. */
export function seatLayout(count: number): SeatSpot[] {
  if (count === 3) return SWF_SPOTS;
  const faceH = [40, 40, 40, 40, 36, 32, 28][count];
  const k = faceH / 40;
  return Array.from({ length: count }, (_, i) => {
    const x = Math.round((400 * (i + 0.5)) / count);
    const center = Math.abs(x - 200) < 1;
    const flip = x > 200;
    // The rail curves: things sit a little higher toward the middle.
    const edge = Math.min(1, Math.abs(x - 200) / 134);
    const w = Math.min(78, Math.floor(400 / count) - 4);
    return {
      x, faceY: 52 + (40 - faceH) * 0.6, faceH, scale: k, flip,
      coinAt: [x + (flip ? 61 : center ? -67 : -61) * k, 140 + 5 * edge],
      onTable: [x + (flip ? -4 : center ? -10 : 9) * k, 155 + 3 * edge],
      label: [Math.max(2, Math.min(400 - w - 2, x - w / 2)), w],
      boxed: true,
    };
  });
}

export type Pose = 'normal' | 'card' | 'drop' | 'win';

/** Figures draw above the table art but are clipped at the rail; coins and labels sit above them. */
export interface SeatLayers {
  onTable: HTMLElement;
  figures: HTMLElement;
  coins: HTMLElement;
}
const POSE_EMOTION: Record<Pose, Emotion> = { normal: 'neutral', card: 'neutral', drop: 'lose', win: 'win' };

export class OpponentSeat {
  private wrap: HTMLDivElement;
  private figure: HTMLImageElement;
  private companion?: HTMLImageElement;
  private handFan: Clip;
  private coins: Clip;
  private dcard: Clip;
  readonly ocard: Clip;
  private coinText: HTMLDivElement;
  private pose: Pose = 'normal';

  constructor(layers: SeatLayers, readonly spot: SeatSpot, readonly character: Character) {
    const { flip, x, scale: k } = spot;
    const wrap = (this.wrap = el('div', 'figure', layers.figures));
    if (character.companionArt) this.companion = el('img', 'companion', wrap);
    this.figure = el('img', 'portrait', wrap);
    this.handFan = new Clip(wrap, 'dcard', x + (flip ? 34 : -34) * k, spot.faceY + 66 * k, { flip, scaleX: 1.15 * k, scaleY: 1.15 * k });
    const [cx, cy] = spot.coinAt;
    this.coins = new Clip(layers.coins, 'coin', cx, cy, { flip, scaleX: k, scaleY: k });
    const [tx, ty] = spot.onTable;
    this.ocard = new Clip(layers.onTable, 'ocard', tx, ty, { flip, scaleX: k, scaleY: k });
    this.dcard = new Clip(layers.onTable, 'dcard', tx, ty, { flip, scaleX: k, scaleY: k });
    this.coinText = textField(layers.coins, `coin-label${spot.boxed ? ' boxed' : ''}`, spot.label[0], 1, spot.label[1], 22);
  }

  async setPose(pose: Pose): Promise<void> {
    this.pose = pose;
    const c = this.character;
    const { x, faceY, faceH, flip, scale: k } = this.spot;
    const emotion = POSE_EMOTION[pose];
    // Seats right of center face the table mirrored, as seat 3 does in the SWF (_xscale = -100).
    const mirror = flip ? 'scaleX(-1)' : '';
    await placeFigure(this.figure, c.art[emotion], c.look.face, x, faceY, faceH);
    this.figure.style.transform = mirror;
    // Widest figures stand at the back, so big wings and sleeves never cover a narrower neighbor's face.
    // Measured on the neutral sprite so a seat keeps its place whatever the pose.
    if (!this.wrap.style.zIndex) {
      const width = await figureWidth(c.art.neutral, c.look.face);
      this.wrap.style.zIndex = String(Math.max(1, 5000 - Math.round(width * 100)));
    }
    if (this.companion && c.companionArt && c.look.companion) {
      const side = flip ? -1 : 1;
      await placeFigure(this.companion, c.companionArt[emotion], c.look.companion.face, x + 46 * side * k, faceY + 46 * k, 24 * k);
      this.companion.style.transform = mirror;
    }
    if (pose === 'card') this.handFan.show(7);
    else this.handFan.hide();
  }

  get currentPose(): Pose {
    return this.pose;
  }

  /** Bet stack in front of the seat (Coin1..Coin7). */
  showBet(level: number): void {
    if (level > 0) this.coins.show(Math.min(level, 7) * 2);
    else this.coins.hide();
  }

  /** Discarded cards on the table (Change0..Change5). */
  showSwapped(n: number): void {
    this.dcard.show(n === 0 ? 2 : n + 2);
  }

  clearTable(): void {
    this.dcard.show(2);
    this.ocard.show(2);
  }

  setCoins(coins: number, busted: boolean): void {
    fitText(this.coinText, busted ? 'OUT' : `COIN:${coins}`, 16, 8);
  }

  setVisible(on: boolean): void {
    for (const e of [this.figure.parentElement!, this.coins.img, this.dcard.img, this.ocard.img, this.coinText]) {
      e.style.display = on ? '' : 'none';
    }
    this.figure.parentElement!.classList.remove('gone');
  }

  /** Fades the character out of their seat after busting (or moving to another table). */
  async fadeOut(): Promise<void> {
    this.figure.parentElement!.classList.add('gone');
    this.coins.hide();
    this.dcard.hide();
    this.ocard.hide();
    this.coinText.style.display = 'none';
    await frames(26);
  }

  remove(): void {
    for (const e of [this.figure.parentElement!, this.coins.img, this.dcard.img, this.ocard.img, this.coinText]) e.remove();
  }
}

// --- Close-up banner (SP_*UP_R / _M): face strip, speech bubble, bet info -----------------------------
// Geometry measured from the original running in Ruffle. Seats 1 and 3 use the _R layout (face left);
// seat 2 uses _M, the mirror image (face right, bubble left).
export const BANNER_H = 64;
const BANNER_ZOOM = 2.2;
const BANNER_LIFT = -0.08;
const FACE_W = 190;
/** The original's bubble: an octagon with the tail folded into its lower-left corner. */
const BUBBLE_PATH = 'M22 1 L203 1 L209 7 L209 30 L203 36 L40 36 L2 35 L22 24 L22 7 Z';
const BUBBLE_SVG = `<svg class="bubble-shape" viewBox="0 0 211 37" width="211" height="37" aria-hidden="true"><path d="${BUBBLE_PATH}" fill="#fff" stroke="#333" stroke-width="2" stroke-linejoin="round"/></svg>`;

export interface BannerOptions {
  dim?: boolean;
  info?: string;
  /** Shows the hand (the Open layout). */
  hand?: Card[];
  bust?: boolean;
}

export class Banner {
  readonly root: HTMLDivElement;
  private face: HTMLDivElement;
  private bubble: HTMLDivElement;
  private text: HTMLDivElement;
  private info: HTMLDivElement;
  private cards: HTMLDivElement;

  private inner: HTMLDivElement;

  constructor(parent: HTMLElement, readonly character: Character, mirrored = false) {
    this.root = el('div', `banner${mirrored ? ' mirrored' : ''}`, parent);
    this.root.style.setProperty('--accent', character.look.color);
    el('div', 'banner-bg', this.root);
    // The original 400x64 layout; scaled down into shorter rows when more than three opponents share the stack.
    this.inner = el('div', 'banner-inner', this.root);
    this.face = el('div', 'banner-face', this.inner);
    this.bubble = el('div', 'banner-bubble', this.inner);
    this.bubble.innerHTML = BUBBLE_SVG;
    this.text = el('div', 'banner-text', this.bubble);
    this.info = el('div', 'banner-info', this.inner);
    this.cards = el('div', 'banner-cards', this.inner);
    this.root.style.display = 'none';
  }

  setMirrored(on: boolean): void {
    this.root.classList.toggle('mirrored', on);
  }

  private async setFace(emotion: Emotion): Promise<void> {
    const c = this.character;
    await paintFace(this.face, c.art[emotion], c.look.face, FACE_W, BANNER_H, BANNER_ZOOM, BANNER_LIFT);
  }

  /** Wipes in from the face side, like the SWF's 8-frame reveal. `hand` switches to the Open layout. */
  async enter(y: number, emotion: Emotion, text: string, opts: BannerOptions & { height?: number } = {}): Promise<void> {
    await this.setFace(emotion);
    const h = opts.height ?? BANNER_H;
    this.root.style.top = `${y}px`;
    this.root.style.height = `${h + 1}px`;
    this.inner.style.transform = h === BANNER_H ? '' : `scale(${h / BANNER_H})`;
    this.root.classList.toggle('dim', !!opts.dim);
    this.root.classList.toggle('bust', !!opts.bust);
    this.root.classList.toggle('open', !!opts.hand);
    this.info.textContent = opts.info ?? '';
    this.cards.replaceChildren(...(opts.hand ?? []).map((c) => miniCard(c)));
    this.root.style.display = '';
    this.root.classList.remove('leave');
    this.root.classList.add('enter');
    fitText(this.text, text, 17, 9);
    await frames(8);
  }

  async swapFace(emotion: Emotion): Promise<void> {
    await this.setFace(emotion);
  }

  /** Slides off the far side (CallClear / DropClear). */
  async leave(): Promise<void> {
    if (this.root.style.display === 'none') return;
    this.root.classList.remove('enter');
    this.root.classList.add('leave');
    await frames(8);
    this.root.style.display = 'none';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  remove(): void {
    this.root.remove();
  }
}

function miniCard(card: Card): HTMLImageElement {
  const img = el('img', 'mini-card');
  img.src = uiUrl(ui(`card-${card}`));
  return img;
}

/** Sets the text, shrinking the font until it fits on one line (then allows two). */
export function fitText(e: HTMLElement, text: string, max: number, min: number): void {
  // Measure a span, not the box, so anything decorative sticking out of the box doesn't count.
  const span = el('span');
  span.textContent = text;
  e.replaceChildren(span);
  const style = getComputedStyle(e);
  const room = e.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  e.style.whiteSpace = 'nowrap';
  e.classList.remove('two-lines');
  for (let size = max; size >= min; size--) {
    e.style.fontSize = `${size}px`;
    if (span.offsetWidth <= room) return;
  }
  e.style.whiteSpace = 'normal';
  e.classList.add('two-lines');
  e.style.fontSize = `${min + 2}px`;
}

// --- Dealer (SP_JIEN) -------------------------------------------------------------------------------
export class Dealer {
  private clip: Clip;
  private sign: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.clip = new Clip(parent, 'jien', 0, 0);
    this.sign = textField(parent, 'jien-text', 150, 120, 120, 30);
    this.sign.style.display = 'none';
  }

  private write(text: string): void {
    this.sign.style.display = '';
    fitText(this.sign, text, 20, 10);
  }

  /** MSG: walks in and raises the sign. */
  async say(text: string, sound: Sfx | null = 'jien'): Promise<void> {
    this.sign.style.display = 'none';
    if (sound) play(sound);
    await this.clip.play(2, 8);
    this.write(text);
  }

  /** MSG2: changes what's on the sign without walking in again. */
  async say2(text: string): Promise<void> {
    this.sign.style.display = 'none';
    await this.clip.play(14, 23);
    this.write(text);
  }

  /** Out: lowers the sign and walks off. */
  async out(): Promise<void> {
    this.sign.style.display = 'none';
    await this.clip.play(9, 13);
    this.clip.hide();
  }

  /** Button: the sign becomes a button; resolves when it's clicked. */
  async button(text: string): Promise<void> {
    this.sign.style.display = 'none';
    await this.clip.play(24, 27);
    this.write(text);
    this.sign.classList.add('pressable');
    await new Promise<void>((resolve) => this.sign.addEventListener('click', () => resolve(), { once: true }));
    this.sign.classList.remove('pressable');
    play('card');
    this.sign.style.display = 'none';
    await this.clip.play(28, 29);
  }

  hide(): void {
    this.clip.hide();
    this.sign.style.display = 'none';
  }
}

// --- Player box (SP_Mona at 323,195): Normal, Drop, DropOpen, Open, Win --------------------------------
export type PlayerState = 'normal' | 'drop' | 'open' | 'dropOpen' | 'win';
const MONA_FRAME: Record<PlayerState, number> = { normal: 2, drop: 4, dropOpen: 6, open: 8, win: 10 };

export class PlayerPanel {
  private mona: Clip;
  private bubble: HTMLDivElement;
  private coinText: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.mona = new Clip(parent, 'mona', 323, 195);
    // TXT_MSGE inside SP_Mona: (-195, 5), 180x30.
    this.bubble = textField(parent, 'player-bubble-text', 128, 200, 180, 30);
    this.coinText = textField(parent, 'player-coins', 325, 264, 68, 34);
    this.set('normal');
  }

  set(state: PlayerState, text = ''): void {
    this.mona.show(MONA_FRAME[state]);
    this.bubble.style.display = text ? '' : 'none';
    if (text) fitText(this.bubble, text, 18, 10);
  }

  setCoins(coins: number, bet: number): void {
    this.coinText.textContent = `COIN:${coins}\nBET  :${bet}`;
  }
}

// --- Player's five cards (In_Card0-4) and HOLD stamps (In_Hold0-4) ----------------------------------
const CX = 6;
const CW = 63;
const CY = 217;

export class PlayerHand {
  private cards: Clip[];
  private holds: Clip[];
  private hits: HTMLDivElement[];
  held = [false, false, false, false, false];

  constructor(parent: HTMLElement, hitLayer: HTMLElement) {
    this.cards = [0, 1, 2, 3, 4].map((i) => new Clip(parent, 'card', CX + CW * i + 2, CY));
    this.holds = [0, 1, 2, 3, 4].map((i) => new Clip(parent, 'hold', CX + CW * i, CY));
    this.hits = [0, 1, 2, 3, 4].map((i) => {
      const hit = el('div', 'hold-hit', hitLayer);
      place(hit, CX + CW * i, CY, 62, 82);
      hit.addEventListener('click', () => this.toggle(i));
      return hit;
    });
    this.enableHolds(false);
  }

  private flipScale(i: number, sx: number): void {
    // _xscale 20/60/100 with _x nudged so the card turns around its center.
    this.cards[i].set({ scaleX: sx / 100, x: CX + CW * i + 2 + ((100 - sx) / 100) * 30 });
  }

  setCard(i: number, card: Card | null): void {
    if (card) this.cards[i].show(`card-${card}`);
    else this.cards[i].hide();
  }

  hideAll(): void {
    this.cards.forEach((c) => c.hide());
    this.holds.forEach((h) => h.hide());
  }

  /** Deal-in animation for one card (frames 147-149). */
  async deal(i: number, card: Card): Promise<void> {
    this.setCard(i, card);
    for (const sx of [20, 60, 100]) {
      this.flipScale(i, sx);
      await frames(1);
    }
  }

  /** Fold the indices face-down and back up showing `hand` (frames 160-164 / 289-293). */
  async reflip(hand: Card[], which = [0, 1, 2, 3, 4]): Promise<void> {
    for (const sx of [60, 20]) {
      which.forEach((i) => this.flipScale(i, sx));
      await frames(1);
    }
    which.forEach((i) => this.setCard(i, hand[i]));
    for (const sx of [20, 60, 100]) {
      which.forEach((i) => this.flipScale(i, sx));
      await frames(1);
    }
  }

  async discard(i: number): Promise<void> {
    play('card');
    for (const sx of [60, 20]) {
      this.flipScale(i, sx);
      await frames(1);
    }
    this.cards[i].hide();
  }

  setHolds(holds: boolean[]): void {
    this.held = [...holds];
    holds.forEach((h, i) => this.holds[i].show(h ? 4 : 2));
  }

  private toggle(i: number): void {
    this.held[i] = !this.held[i];
    this.holds[i].show(this.held[i] ? 4 : 2);
    play('card');
  }

  enableHolds(on: boolean): void {
    this.hits.forEach((h) => (h.style.display = on ? '' : 'none'));
    if (!on) this.holds.forEach((h) => h.hide());
  }
}

// --- Bet buttons (DefineButton2 20030-20034) and the showdown OK (20035/20036) -----------------------
export type ButtonName = 'raise2' | 'raise' | 'call' | 'drop' | 'next';
const BUTTON_X: Record<ButtonName, number> = { raise2: 7, raise: 87, call: 167, drop: 247, next: 7 };

export class Buttons {
  private root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'buttons', parent);
  }

  /** Shows the given buttons; resolves with the one pressed. */
  /** `labels` relabels a button over its baked-in text (Call becomes All In). */
  async choose<T extends ButtonName>(names: T[], anywhere = false, labels: Partial<Record<ButtonName, string>> = {}): Promise<T> {
    this.root.replaceChildren();
    const result = await new Promise<T>((resolve) => {
      for (const name of names) {
        const b = el('button', 'swf-button', this.root);
        b.setAttribute('aria-label', name);
        place(b, BUTTON_X[name], 194, 67 * 1.1, 24.8);
        const img = el('img', '', b);
        img.draggable = false;
        const art = (state: string) => (img.src = uiUrl(ui(`btn-${name}-${state}`)));
        art('up');
        if (labels[name]) el('span', 'button-label', b).textContent = labels[name];
        b.addEventListener('pointerenter', () => art('over'));
        b.addEventListener('pointerleave', () => art('up'));
        b.addEventListener('pointerdown', () => art('down'));
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          resolve(name);
        });
      }
      if (anywhere) {
        // DefineButton 20036: a stage-sized hit area that also continues.
        const hit = el('div', 'anywhere', this.root);
        hit.addEventListener('click', () => resolve(names[0]));
      }
    });
    this.root.replaceChildren();
    return result;
  }
}

