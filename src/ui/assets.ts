// Original UI art (extracted by tools/extract-swf-ui.mjs) and sounds.
export interface UiAsset {
  file: string;
  w: number;
  h: number;
  /** Where the symbol's registration point sits inside the SVG. */
  ox: number;
  oy: number;
}

let manifest: Record<string, UiAsset> = {};
const base = import.meta.env.BASE_URL;

// Every image is fetched once and played from memory (blob URLs), so animations never hit the network:
// no flicker, and a stopped dev server or flaky connection can't blank out cards mid-game.
const memory = new Map<string, string>();

export async function keepInMemory(url: string): Promise<string> {
  const hit = memory.get(url);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  const local = URL.createObjectURL(await res.blob());
  memory.set(url, local);
  return local;
}

/** The in-memory URL for an image loaded with keepInMemory, or the original URL if it wasn't. */
export const local = (url: string): string => memory.get(url) ?? url;

export async function loadUi(): Promise<void> {
  manifest = await (await fetch(`${base}ui/manifest.json`)).json();
  await Promise.all(Object.values(manifest).map(async (a) => {
    const url = await keepInMemory(`${base}ui/${a.file}`);
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => undefined);
  }));
  // Short effects too (music streams on demand).
  await Promise.all(SFX.map((name) => keepInMemory(`${base}ui/sound/${name}.mp3`).catch(() => undefined)));
}

export const ui = (key: string): UiAsset => {
  const a = manifest[key];
  if (!a) throw new Error(`missing UI asset ${key}`);
  return a;
};
export const hasUi = (key: string): boolean => key in manifest;
export const uiUrl = (a: UiAsset): string => local(`${base}ui/${a.file}`);

// --- Sound -------------------------------------------------------------------------------------
const SFX = ['bell', 'call', 'card', 'coin', 'drop', 'jien', 'lose', 'raise', 'raise2', 'win'] as const;
export type Sfx = (typeof SFX)[number];
/** Looping music: the three table tracks plus the select and record screen themes. */
export type Music = 'bgm1' | 'bgm2' | 'bgm3' | 'select' | 'record';

const sfxCache = new Map<string, HTMLAudioElement>();
let bgm: HTMLAudioElement | null = null;
let bgmTrack: Music | null = null;
let bgmOn = true;
let sfxMuted = false;

/** Silences sound effects (while a round is fast-forwarded); music carries on. */
export function setSfxMuted(muted: boolean): void {
  sfxMuted = muted;
}

export function play(name: Sfx): void {
  if (sfxMuted) return;
  let a = sfxCache.get(name);
  if (!a) {
    a = new Audio(local(`${base}ui/sound/${name}.mp3`));
    sfxCache.set(name, a);
  }
  const s = a.cloneNode() as HTMLAudioElement;
  s.play().catch(() => undefined);
}

export function setBgmEnabled(on: boolean): void {
  bgmOn = on;
  if (!on) stopBgm();
}

/** Starts a track; one that's already playing carries on (moving between menus that share it). */
export function playBgm(track: Music, volume = 1): void {
  if (bgm && bgmTrack === track) {
    bgm.volume = volume;
    return;
  }
  stopBgm();
  if (!bgmOn) return;
  bgmTrack = track;
  bgm = new Audio(`${base}ui/sound/${track}.mp3`);
  bgm.loop = true;
  bgm.volume = volume;
  bgm.play().catch(() => undefined);
}

export function setBgmVolume(volume: number): void {
  if (bgm) bgm.volume = volume;
}

export function stopBgm(): void {
  bgm?.pause();
  bgm = null;
  bgmTrack = null;
}
