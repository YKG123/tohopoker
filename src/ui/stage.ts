// The 400x300 Flash stage. Everything is positioned in original SWF coordinates;
// CSS zoom scales the whole stage so the vector art re-renders crisply at any size.
import { type UiAsset, ui, uiUrl } from './assets';

export const STAGE_W = 400;
export const STAGE_H = 300;
export const FPS = 52;

/** Dev flags from the URL: ?speed=10 fast-forwards, ?autoplay plays your seat (for testing). */
const params = new URLSearchParams(location.search);
export const timing = { speed: Number(params.get('speed')) || 1 };
export const autoplay = params.has('autoplay');

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms / timing.speed));
/** Wait a number of original timeline frames. */
export const frames = (n: number): Promise<void> => wait((n * 1000) / FPS);

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

export function place(e: HTMLElement, x: number, y: number, w?: number, h?: number): HTMLElement {
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  if (w !== undefined) e.style.width = `${w}px`;
  if (h !== undefined) e.style.height = `${h}px`;
  return e;
}

export function createStage(host: HTMLElement): HTMLElement {
  const stage = el('div', 'stage', host);
  const fit = () => {
    // Snapped so the stage spans whole device pixels (400 and 300 both divide into 1/100 steps);
    // a fractional edge lets the page background bleed through as a 1px line.
    const dpr = devicePixelRatio || 1;
    const z = Math.max(1, Math.min(host.clientWidth / STAGE_W, host.clientHeight / STAGE_H));
    stage.style.zoom = String(Math.floor(z * dpr * 100) / (100 * dpr));
  };
  new ResizeObserver(fit).observe(host);
  fit();
  return stage;
}

/** A layer that covers the whole stage. */
export const layer = (parent: HTMLElement, cls = ''): HTMLElement => el('div', `layer ${cls}`, parent);

/**
 * A MovieClip stand-in: shows frames `${prefix}-${n}` of an extracted sprite at a registration point,
 * optionally mirrored (the SWF's _xscale = -100) and scaled.
 */
export class Clip {
  readonly img: HTMLImageElement;
  private token = 0;
  frame = 0;

  constructor(
    parent: HTMLElement,
    private prefix: string,
    private x: number,
    private y: number,
    public opts: { flip?: boolean; scaleX?: number; scaleY?: number; cls?: string } = {},
  ) {
    this.img = el('img', `clip ${opts.cls ?? ''}`, parent);
    this.img.draggable = false;
    this.img.alt = '';
    this.hide();
  }

  private key(n: number | string): string {
    return typeof n === 'string' ? n : `${this.prefix}-${n}`;
  }

  private current: number | string = 1;

  show(n: number | string): this {
    this.current = n;
    this.frame = typeof n === 'number' ? n : 0;
    const a: UiAsset = ui(this.key(n));
    const { flip, scaleX = 1, scaleY = 1 } = this.opts;
    const img = this.img;
    img.src = uiUrl(a);
    img.style.width = `${a.w}px`;
    img.style.height = `${a.h}px`;
    img.style.left = `${this.x - a.ox}px`;
    img.style.top = `${this.y - a.oy}px`;
    img.style.transformOrigin = `${a.ox}px ${a.oy}px`;
    img.style.transform = `scale(${(flip ? -1 : 1) * scaleX}, ${scaleY})`;
    img.style.visibility = 'visible';
    return this;
  }

  hide(): this {
    this.token++;
    this.img.style.visibility = 'hidden';
    return this;
  }

  /** Plays frames from..to (inclusive) at the original frame rate and stops on the last one. */
  async play(from: number, to: number): Promise<void> {
    const t = ++this.token;
    for (let f = from; f <= to; f++) {
      if (t !== this.token) return;
      this.show(f);
      if (f < to) await frames(1);
    }
  }

  /** Changes scale and/or position (the SWF's _xscale/_x tweens) without changing frame. */
  set(props: { x?: number; y?: number; scaleX?: number; scaleY?: number }): this {
    if (props.x !== undefined) this.x = props.x;
    if (props.y !== undefined) this.y = props.y;
    if (props.scaleX !== undefined) this.opts.scaleX = props.scaleX;
    if (props.scaleY !== undefined) this.opts.scaleY = props.scaleY;
    if (this.img.style.visibility === 'visible') this.show(this.current);
    return this;
  }
}

/** An absolutely positioned text field styled like the SWF's dynamic text. */
export function textField(parent: HTMLElement, cls: string, x: number, y: number, w?: number, h?: number): HTMLDivElement {
  const t = el('div', `text ${cls}`, parent);
  place(t, x, y, w, h);
  return t;
}

/** Resolves on the next click anywhere inside `target`. */
export const click = (target: HTMLElement): Promise<void> =>
  new Promise((resolve) => target.addEventListener('click', () => resolve(), { once: true }));
