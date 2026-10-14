// Menus for online play, on the select screen's art like Game Mode: Singleplayer / Host Room / Join Room,
// the player's name and avatar, and the room lobbies.
import { MAX_SEATS } from '../engine/match';
import { AVATARS, avatarArt, avatarById } from '../net/avatars';
import type { LobbyPlayer, NetSettings, Profile } from '../net/protocol';
import { CODE_LENGTH, cleanCode } from '../net/room';
import { play, playBgm, stopBgm } from '../ui/assets';
import { paintFace } from '../ui/portrait';
import { Clip, el, layer, place, textField } from '../ui/stage';
import { hotspot, menuButton, retitle } from './screens';

/** The select screen's backdrop with a new title; returns the root and its footer line. */
function backdrop(stage: HTMLElement, title: string): { root: HTMLElement; footer: HTMLDivElement } {
  const root = layer(stage, 'select-screen mode-screen net-screen');
  new Clip(root, 'select', 0, 0).show(4);
  place(el('div', 'select-cover', root), 0, 46, 400, 183);
  retitle(root, title);
  return { root, footer: textField(root, 'select-footer', 8, 234, 280, 60) };
}

// --- Singleplayer / Host Room / Join Room ---------------------------------------------------------
export type PlayChoice = 'single' | 'host' | 'join';

export function playMenu(stage: HTMLElement): Promise<PlayChoice | null> {
  const { root, footer } = backdrop(stage, 'Play');
  const HELP: Record<PlayChoice, string> = {
    single: 'Cash games and tournaments against the cast.',
    host: 'Open a room for your friends to join over the internet.\nYou pick the AI opponents and the rules.',
    join: "Join a friend's room with the code they give you.",
  };
  const idle = 'Play alone, or online with friends (up to six at a table, AI included).';
  footer.textContent = idle;
  playBgm('select');
  return new Promise((resolve) => {
    const done = (c: PlayChoice | null) => {
      root.remove();
      resolve(c);
    };
    (['single', 'host', 'join'] as const).forEach((c, i) => {
      const b = menuButton(root, 100, 70 + i * 48, 200, c === 'single' ? 'Singleplayer' : c === 'host' ? 'Host Room' : 'Join Room', () => done(c),
        `big${c === 'single' ? '' : ' blue'}`);
      b.style.height = '36px';
      b.addEventListener('pointerenter', () => (footer.textContent = HELP[c]));
      b.addEventListener('pointerleave', () => (footer.textContent = idle));
    });
    menuButton(root, 296, 266, 92, '◀ Back', () => {
      stopBgm();
      done(null);
    }, 'blue');
  });
}

// --- Profile: name and avatar (and the room code, joining) -----------------------------------------
const PROFILE_KEY = 'touhou-poker-face-up/net-profile';
const SETTINGS_KEY = 'touhou-poker-face-up/net-settings';

/** Name and avatar are remembered; the key is per tab, so two tabs of one browser are two players. */
export function loadProfile(): Profile {
  let saved: Partial<Profile> = {};
  let key = '';
  try {
    saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? '{}');
    key = sessionStorage.getItem(PROFILE_KEY) ?? '';
    if (!key) sessionStorage.setItem(PROFILE_KEY, (key = crypto.randomUUID()));
  } catch {
    key ||= Math.random().toString(36).slice(2);
  }
  return { key, name: saved.name ?? '', avatar: avatarById(saved.avatar ?? AVATARS[0].id).id };
}

function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: p.name, avatar: p.avatar }));
  } catch {
    // Private windows: just not remembered.
  }
}

export function loadNetSettings(): NetSettings {
  const fallback: NetSettings = { rounds: 30, decisionTime: 15, ais: 2 };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return fallback;
  }
}

function saveNetSettings(s: NetSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Not remembered.
  }
}

function input(parent: HTMLElement, x: number, y: number, w: number, value: string, max: number, placeholder: string): HTMLInputElement {
  const box = el('input', 'net-input', parent);
  place(box, x, y, w, 22);
  box.value = value;
  box.maxLength = max;
  box.placeholder = placeholder;
  box.spellcheck = false;
  box.autocomplete = 'off';
  return box;
}

/** A face card like the select screen's, for an avatar. */
function avatarCard(parent: HTMLElement, x: number, y: number, avatar: string, label: string): HTMLButtonElement {
  const a = avatarById(avatar);
  const card = el('button', 'select-card', parent);
  place(card, x, y, 46, 84);
  card.style.setProperty('--accent', a.color);
  paintFace(el('div', 'select-face', card), avatarArt(a.id).neutral, a.face, 42, 58, 1.2, 0.05);
  el('div', 'select-name', card).textContent = label;
  return card;
}

export function profileScreen(stage: HTMLElement, joining: boolean): Promise<{ profile: Profile; code: string } | null> {
  const { root, footer } = backdrop(stage, joining ? 'Join Room' : 'Host Room');
  const profile = loadProfile();
  textField(root, 'mode-row', 24, 56, 100, 22).textContent = 'Your name';
  const name = input(root, 130, 56, 150, profile.name, 12, 'Name');
  let code: HTMLInputElement | null = null;
  if (joining) {
    textField(root, 'mode-row', 24, 82, 100, 22).textContent = 'Room code';
    code = input(root, 130, 82, 150, '', CODE_LENGTH, 'ABCDE');
    code.classList.add('code');
    code.addEventListener('input', () => (code!.value = cleanCode(code!.value)));
  }
  const top = joining ? 132 : 108;
  textField(root, 'mode-row', 24, top - 24, 200, 20).textContent = 'Play as';
  const stamps = new Map<string, Clip>();
  AVATARS.forEach((a, i) => {
    const x = 9 + i * 55;
    const card = avatarCard(root, x, top, a.id, a.name);
    const stamp = new Clip(root, 'hold', x - 1, top, { scaleX: 46 / 62, scaleY: 84 / 82 });
    stamps.set(a.id, stamp);
    card.addEventListener('click', () => {
      play('card');
      profile.avatar = a.id;
      stamps.forEach((s, id) => (id === a.id ? s.show(4) : s.hide()));
    });
  });
  stamps.get(profile.avatar)?.show(4);
  const idle = joining
    ? 'Type the room code your host gave you, pick a name and who you sit at the table as.'
    : 'Pick a name and who you sit at the table as. Your friends see you that way.';
  footer.textContent = idle;
  playBgm('select');
  (profile.name ? code ?? name : name).focus();

  return new Promise((resolve) => {
    const go = () => {
      const typed = name.value.replace(/\s+/g, ' ').trim();
      const room = code ? cleanCode(code.value) : '';
      if (!typed) {
        footer.textContent = 'Type a name first.';
        name.focus();
        return;
      }
      if (code && room.length !== CODE_LENGTH) {
        footer.textContent = `Room codes are ${CODE_LENGTH} letters and numbers.`;
        code.focus();
        return;
      }
      profile.name = typed;
      saveProfile(profile);
      root.remove();
      resolve({ profile, code: room });
    };
    for (const box of [name, code]) box?.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    menuButton(root, 296, 238, 92, joining ? 'Join ▶' : 'Open ▶', go);
    menuButton(root, 296, 266, 92, '◀ Back', () => {
      root.remove();
      resolve(null);
    }, 'blue');
  });
}

// --- Lobbies ------------------------------------------------------------------------------------
/** Who's in the room, one row each with their avatar's face. */
function playerList(parent: HTMLElement, x: number, y: number, players: LobbyPlayer[]): void {
  textField(parent, 'mode-row', x, y, 176, 20).textContent = `Players  ${players.length}`;
  players.forEach((p, i) => {
    const a = avatarById(p.avatar);
    const top = y + 24 + i * 20;
    const face = place(el('div', 'net-face', parent), x + 2, top, 26, 18);
    face.style.setProperty('--accent', a.color);
    paintFace(face, avatarArt(a.id).neutral, a.face, 26, 18, 1.7, 0.08);
    const row = textField(parent, 'net-player', x + 32, top, 144, 18);
    row.textContent = `${p.name}${p.host ? '  (host)' : p.away ? '  (away)' : ''}`;
    row.classList.toggle('away', p.away);
  });
}

interface Stepper {
  label: string;
  values: number[];
  get: () => number;
  set: (v: number) => void;
  show: (v: number) => string;
  help: string;
}

const DECISION_TIMES = [5, 10, 15, 20, 30, 45, 60, 0];

export interface HostLobby {
  /** Redraws after the room changes. */
  refresh(): void;
  /** 'start' when the host starts the game, null when they close the room. */
  done: Promise<'start' | null>;
}

/** The host's lobby. `players` is everyone in the room (the host first); settings are edited in place. */
export function hostLobby(stage: HTMLElement, code: string, players: () => LobbyPlayer[], settings: NetSettings,
  onSettings: () => void): HostLobby {
  const { root, footer } = backdrop(stage, 'Host Room');
  const body = layer(root);
  const idle = 'Send your friends the room code: they choose Join Room and type it in.\nTab shows the standings in game.';
  footer.textContent = idle;
  let resolveDone!: (v: 'start' | null) => void;
  const done = new Promise<'start' | null>((r) => (resolveDone = r));
  const freeSeats = () => MAX_SEATS - players().length;
  const steppers: Stepper[] = [
    { label: 'AI', values: Array.from({ length: MAX_SEATS }, (_, i) => i), get: () => Math.min(settings.ais, freeSeats()),
      set: (v) => (settings.ais = v), show: (v) => String(v),
      help: `AI opponents to fill the table (you pick them when you start). Up to ${MAX_SEATS} seats in all.` },
    { label: 'Rounds', values: [10, 15, 20, 25, 30, 35, 40, 45, 50], get: () => settings.rounds,
      set: (v) => (settings.rounds = v), show: String, help: 'The game ends after this many rounds (or when one player is left).' },
    { label: 'Time', values: DECISION_TIMES, get: () => settings.decisionTime, set: (v) => (settings.decisionTime = v),
      show: (v) => (v ? `${v}s` : 'Off'),
      help: 'Time for each decision. Out of time, your swap goes in as it is and your bet is a fold.' },
  ];

  const render = () => {
    body.replaceChildren();
    textField(body, 'mode-row', 24, 50, 120, 24).textContent = 'Room code';
    textField(body, 'net-code', 130, 48, 120, 28).textContent = code;
    const copy = menuButton(body, 254, 50, 64, 'Copy', () => {
      navigator.clipboard?.writeText(code).then(() => (copy.textContent = 'Copied'), () => (copy.textContent = 'Copy?'));
    }, 'blue small');
    playerList(body, 24, 80, players());
    steppers.forEach((o, i) => {
      const y = 104 + i * 24;
      const row = textField(body, 'mode-row', 214, y, 162, 21);
      row.textContent = o.label;
      row.style.pointerEvents = 'auto';
      row.addEventListener('pointerenter', () => (footer.textContent = o.help));
      row.addEventListener('pointerleave', () => (footer.textContent = idle));
      textField(body, 'mode-value', 296, y, 56, 21).textContent = o.show(o.get());
      const step = (d: number) => {
        const values = o.label === 'AI' ? o.values.filter((v) => v <= freeSeats()) : o.values;
        const at = Math.max(0, values.indexOf(o.get()));
        o.set(values[(at + d + values.length) % values.length]);
        saveNetSettings(settings);
        onSettings();
        render();
        footer.textContent = o.help;
      };
      hotspot(body, 274, y, 22, 21, `Less ${o.label}`, () => step(-1)).textContent = '◀';
      hotspot(body, 354, y, 22, 21, `More ${o.label}`, () => step(1)).textContent = '▶';
    });
    textField(body, 'mode-row', 214, 80, 162, 20).textContent = 'Rules';
    const seats = players().length + Math.min(settings.ais, freeSeats());
    const start = menuButton(body, 296, 238, 92, 'Start ▶', () => {
      root.remove();
      resolveDone('start');
    });
    if (seats < 2) {
      start.disabled = true;
      start.title = 'Wait for a friend, or add AI opponents.';
    }
    menuButton(body, 296, 266, 92, '◀ Close', () => {
      stopBgm();
      root.remove();
      resolveDone(null);
    }, 'blue');
  };
  playBgm('select');
  render();
  return { refresh: () => root.isConnected && render(), done };
}

/** A player's lobby: who's in the room and the host's rules, while waiting for the game. */
export class ClientLobby {
  private root: HTMLElement;
  private body: HTMLElement;
  private footer: HTMLDivElement;
  private players: LobbyPlayer[] = [];
  private settings?: NetSettings;
  /** The player pressed Leave. */
  onLeave: () => void = () => undefined;

  constructor(stage: HTMLElement, code: string) {
    ({ root: this.root, footer: this.footer } = backdrop(stage, `Room ${code}`));
    this.body = layer(this.root);
    menuButton(this.root, 296, 266, 92, '◀ Leave', () => this.onLeave(), 'blue');
    this.status('Looking for the room...');
    playBgm('select');
  }

  update(players: LobbyPlayer[], settings: NetSettings): void {
    this.players = players;
    this.settings = settings;
    this.render();
  }

  status(text: string): void {
    this.footer.textContent = text;
  }

  show(on: boolean): void {
    this.root.style.display = on ? '' : 'none';
    if (on) playBgm('select');
  }

  remove(): void {
    this.root.remove();
  }

  private render(): void {
    this.body.replaceChildren();
    playerList(this.body, 24, 56, this.players);
    const s = this.settings;
    if (!s) return;
    textField(this.body, 'mode-row', 214, 56, 162, 20).textContent = 'Rules';
    const ais = Math.min(s.ais, MAX_SEATS - this.players.length);
    textField(this.body, 'net-rules', 220, 80, 156, 80).textContent =
      `AI opponents  ${ais}\nRounds  ${s.rounds}\nTime  ${s.decisionTime ? `${s.decisionTime}s` : 'no limit'}`;
  }
}

/** A message with an OK button, over whatever is on screen. */
export function notice(stage: HTMLElement, text: string): Promise<void> {
  const root = layer(stage, 'dialog');
  const box = el('div', 'dialog-box', root);
  place(box, 60, 78, 280, 120);
  textField(box, 'dialog-text', 0, 14, 280, 60).textContent = text;
  return new Promise((resolve) => {
    menuButton(box, 88, 82, 104, 'OK', () => {
      root.remove();
      resolve();
    });
  });
}
