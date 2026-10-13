// Title, Select Characters, Record and Credit screens, laid out on the original art.
import { type Character, characters } from '../characters';
import { HAND_NAMES } from '../engine/hand';
import { MAX_SEATS, ordinal } from '../engine/match';
import { BREAKING_NAMES, BUY_IN, type Breaking, type Tournament, type TournamentConfig, paidPlaces, payoutTable } from '../engine/tournament';
import { player } from '../player';
import { type CashSettings, type CharacterRecord, type SaveData, emptyRecord, load, resetRecords, saveSettings, store } from '../save';
import { play, playBgm, setBgmEnabled, stopBgm } from '../ui/assets';
import { paintFace } from '../ui/portrait';
import { fitText } from '../ui/table';
import { Clip, el, frames, layer, place, textField, wait } from '../ui/stage';

/** A clickable invisible region over baked-in art. */
function hotspot(parent: HTMLElement, x: number, y: number, w: number, h: number, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'hotspot', parent);
  b.setAttribute('aria-label', label);
  place(b, x, y, w, h);
  b.addEventListener('click', () => {
    play('card');
    onClick();
  });
  return b;
}

/** SP_Fade: fade to black and back around a scene change. */
export async function fade(stage: HTMLElement, swap: () => void | Promise<void>): Promise<void> {
  const f = layer(stage, 'fade');
  await frames(1);
  f.classList.add('on');
  await frames(20);
  await swap();
  f.classList.remove('on');
  await frames(20);
  f.remove();
}

// --- Title ---------------------------------------------------------------------------------------
export type TitleChoice = 'game' | 'record' | 'credit';

/** The title over the baked-in "Poker Face Up", in the same two-tone italic. */
function gameTitle(root: HTMLElement): void {
  const t = place(el('div', 'game-title', root), 0, 0, 400, 84);
  el('span', 'game-title-a', t).textContent = 'Imperishable ';
  el('span', 'game-title-b', t).textContent = 'Poker Night';
  // The old logo's "p" in "Up" hangs below the band.
  place(el('div', 'game-title', root), 320, 84, 80, 12);
}

export function titleScreen(stage: HTMLElement): Promise<TitleChoice> {
  const root = layer(stage, 'title-screen');
  new Clip(root, 'title', 0, 0).show(2);
  gameTitle(root);
  const data = load();
  const marks = layer(root);
  const mark = (x: number, y: number, w: number) => place(el('div', 'option-mark', marks), x, y, w, 2);
  const bgmMarks = [mark(250, 273, 26), mark(290, 273, 28)];
  const qualityMarks = [mark(246, 296, 32), mark(285, 296, 60), mark(352, 296, 38)];
  const qualities = ['low', 'medium', 'high'] as const;

  const refresh = () => {
    bgmMarks.forEach((m, i) => m.classList.toggle('on', data.settings.bgm === (i === 0)));
    qualityMarks.forEach((m, i) => m.classList.toggle('on', data.settings.quality === qualities[i]));
    stage.dataset.quality = data.settings.quality;
    setBgmEnabled(data.settings.bgm);
    store({ ...load(), settings: data.settings });
  };
  refresh();

  return new Promise((resolve) => {
    const done = (choice: TitleChoice) => {
      root.remove();
      resolve(choice);
    };
    hotspot(root, 180, 115, 166, 34, 'Open the Game', () => done('game'));
    hotspot(root, 220, 160, 88, 33, 'Record', () => done('record'));
    hotspot(root, 225, 204, 74, 32, 'Credit', () => done('credit'));
    hotspot(root, 246, 257, 32, 20, 'BGM on', () => ((data.settings.bgm = true), refresh()));
    hotspot(root, 286, 257, 34, 20, 'BGM off', () => ((data.settings.bgm = false), refresh()));
    qualities.forEach((q, i) => {
      const [x, w] = [[243, 38], [283, 64], [350, 42]][i];
      hotspot(root, x, 278, w, 20, `Quality ${q}`, () => ((data.settings.quality = q), refresh()));
    });
  });
}

// --- Credit (SP_Credit over the title) -------------------------------------------------------------
const CREDITS = `Character art
  dairi & Haruka
Touhou Project
  Team Shanghai Alice
Original game
  Poker Face Up (Flash)`;

export async function creditScreen(stage: HTMLElement): Promise<void> {
  const root = layer(stage, 'credit-screen');
  new Clip(root, 'title', 0, 0).show(2);
  gameTitle(root);
  const panel = new Clip(root, 'credit', 0, 0);
  await panel.play(1, 17);
  // Page 1 is the original credits baked into the art; page 2 adds this version's.
  const next = hotspot(root, 179, 99, 198, 163, 'Next page', () => undefined);
  await new Promise((r) => next.addEventListener('click', r, { once: true }));
  panel.show(16);
  const text = textField(root, 'credit-text', 186, 134, 186, 124);
  text.textContent = CREDITS;
  await new Promise((r) => next.addEventListener('click', r, { once: true }));
  text.remove();
  next.remove();
  await panel.play(18, 26);
  root.remove();
}

// --- Select Characters (SP_Select) -----------------------------------------------------------------
const COLS = 8;
const PER_SELECT_PAGE = 15;

export function selectScreen(stage: HTMLElement, PICK: number, noun = 'opponent'): Promise<Character[]> {
  const root = layer(stage, 'select-screen');
  new Clip(root, 'select', 0, 0).show(4);
  place(el('div', 'select-cover', root), 0, 46, 400, 183);
  const footer = textField(root, 'select-footer', 8, 234, 384, 60);
  const picked: Character[] = [];
  const stamps = new Map<string, Clip>();

  const describe = (c?: Character) => {
    if (!c) {
      footer.textContent = `Select ${PICK - picked.length} more ${noun}${PICK - picked.length === 1 ? '' : 's'}.\n${picked.map((p) => p.name).join(', ')}`;
      return;
    }
    const s = c.stats;
    const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
    footer.textContent = s
      ? `${c.fullName}   Strict ${stars(s.strictness)}  Aggro ${stars(s.aggression)}  Wild ${stars(s.unpredictability)}\n${s.comment ?? ''}`
      : c.fullName;
  };

  playBgm('select');
  return new Promise((resolve) => {
    const finish = async () => {
      describe();
      await wait(400);
      stopBgm();
      // The SWF shuffles the picks into random seats.
      for (let i = picked.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [picked[i], picked[j]] = [picked[j], picked[i]];
      }
      root.remove();
      resolve(picked);
    };

    const toggle = (c: Character) => {
      const at = picked.indexOf(c);
      if (at >= 0) {
        picked.splice(at, 1);
        stamps.get(c.id)?.hide();
      } else {
        picked.push(c);
        stamps.get(c.id)?.show(4);
      }
      play('card');
      describe(c);
      if (picked.length === PICK) finish();
    };

    // Two rows of eight: up to 15 characters per page, Auto always in the last slot.
    const grid = layer(root);
    let page = 0;
    const pageCount = Math.ceil(characters.length / PER_SELECT_PAGE);

    const slot = (c: Character | null, i: number) => {
      const x = 6 + (i % COLS) * 49;
      const y = 50 + Math.floor(i / COLS) * 89;
      const card = el('button', `select-card${c ? '' : ' auto'}`, grid);
      place(card, x, y, 46, 84);
      const face = el('div', 'select-face', card);
      const name = el('div', 'select-name', card);
      // Long names (Clownpiece, Wakasagihime) shrink to fit the card.
      if (c) fitText(name, c.name, 11, 6);
      else name.textContent = 'Auto';
      const stamp = new Clip(grid, 'hold', x - 1, y, { scaleX: 46 / 62, scaleY: 84 / 82 });
      if (c) {
        card.style.setProperty('--accent', c.look.color);
        paintFace(face, c.art.neutral, c.look.face, 42, 58);
        stamps.set(c.id, stamp);
        if (picked.includes(c)) stamp.show(4);
        card.addEventListener('click', () => toggle(c));
        card.addEventListener('pointerenter', () => describe(c));
        card.addEventListener('pointerleave', () => describe());
      } else {
        face.textContent = '?';
        card.addEventListener('click', () => {
          play('card');
          const rest = characters.filter((x) => !picked.includes(x)).sort(() => Math.random() - 0.5);
          picked.push(...rest.slice(0, PICK - picked.length));
          picked.forEach((p) => stamps.get(p.id)?.show(4));
          finish();
        });
      }
    };

    const showPage = () => {
      grid.replaceChildren();
      stamps.clear();
      characters.slice(page * PER_SELECT_PAGE, (page + 1) * PER_SELECT_PAGE).forEach((c, i) => slot(c, i));
      slot(null, PER_SELECT_PAGE);
      if (pageCount > 1) {
        const label = textField(grid, 'select-page', 300, 268, 92, 20);
        label.textContent = `${page + 1} / ${pageCount}`;
        hotspot(grid, 300, 266, 24, 24, 'Previous page', () => ((page = (page + pageCount - 1) % pageCount), showPage())).textContent = '◀';
        hotspot(grid, 368, 266, 24, 24, 'Next page', () => ((page = (page + 1) % pageCount), showPage())).textContent = '▶';
      }
    };
    showPage();
    describe();
  });
}

// --- Game mode (new): cash game or tournament, and their settings, on the select screen's art ---------
export type GameSetup = { mode: 'cash'; cash: CashSettings } | { mode: 'tournament'; tournament: TournamentConfig };

/** Covers the baked-in "Select Characters" with another title in the same band. */
function retitle(root: HTMLElement, text: string, cls = 'select-title'): void {
  place(el('div', `title-cover ${cls}`, root), 40, 6, 320, 36).textContent = text;
}

/** A small menu button in the style of the record screen's OK button. */
export function menuButton(parent: HTMLElement, x: number, y: number, w: number, text: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `menu-button ${cls}`, parent);
  place(b, x, y, w, 24);
  b.textContent = text;
  b.addEventListener('click', () => {
    play('card');
    onClick();
  });
  return b;
}

interface Option {
  label: string;
  help: string;
  values: (number | string)[] | (() => (number | string)[]);
  get: () => number | string;
  set: (v: number | string) => void;
  show?: (v: number | string) => string;
}

const range = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

export function modeScreen(stage: HTMLElement): Promise<GameSetup | null> {
  const root = layer(stage, 'select-screen mode-screen');
  new Clip(root, 'select', 0, 0).show(4);
  place(el('div', 'select-cover', root), 0, 46, 400, 183);
  retitle(root, 'Game Mode');
  const footer = textField(root, 'select-footer', 8, 234, 280, 60);
  const data = load();
  const settings = data.settings;
  const cast = characters.length + 1;
  const t = settings.tournament;
  // Watching, every entrant is from the cast; playing, you're one of them.
  const maxEntrants = () => (t.spectate ? characters.length : cast);
  if (!t.entrants || t.entrants > maxEntrants()) t.entrants = maxEntrants();
  let mode: GameSetup['mode'] = 'cash';

  const prizes = () => payoutTable(t.entrants, t.paidPercent);
  const cashOptions: Option[] = [
    { label: 'Opponents', help: `Up to ${MAX_SEATS} at the table, you included.`, values: range(1, MAX_SEATS - 1),
      get: () => settings.cash.opponents, set: (v) => (settings.cash.opponents = +v) },
    { label: 'Rounds', help: 'The game ends after this many rounds (or when only one player is left).\nThe survivors are ranked by coins.',
      values: range(10, 50, 5), get: () => settings.cash.rounds, set: (v) => (settings.cash.rounds = +v) },
  ];
  const tournamentOptions: Option[] = [
    { label: 'You', help: 'Play in the tournament, or watch the whole thing from the rail.', values: ['play', 'watch'],
      get: () => (t.spectate ? 'watch' : 'play'), set: (v) => (t.spectate = v === 'watch'),
      show: (v) => (v === 'watch' ? 'Spectate' : 'Play') },
    { label: 'Entrants', help: `Everyone pays ${BUY_IN} coins in. You pick the field next (Auto fills it at random).`,
      values: () => range(3, maxEntrants()), get: () => t.entrants, set: (v) => (t.entrants = +v) },
    { label: 'Table size', help: 'Seats per table, you included.', values: range(3, MAX_SEATS),
      get: () => t.tableSize, set: (v) => (t.tableSize = +v) },
    { label: 'Starting stack', help: 'Tournament chips each player starts with.', values: [20, 30, 40, 50, 75, 100, 150, 200],
      get: () => t.startStack, set: (v) => (t.startStack = +v) },
    { label: 'Ante up every', help: 'The ante (and every bet with it) goes up: 1, 2, 3, 4, 5, 6, 8, 10, 12, 15...',
      values: range(5, 40, 5), get: () => t.anteEvery, set: (v) => (t.anteEvery = +v), show: (v) => `${v} rounds` },
    { label: 'Table breaking', help: '', values: Object.keys(BREAKING_NAMES),
      get: () => t.breaking, set: (v) => (t.breaking = v as Breaking), show: (v) => BREAKING_NAMES[v as Breaking] },
    { label: 'Paid', help: '', values: [10, 15, 20, 25, 30, 40, 50],
      get: () => t.paidPercent, set: (v) => (t.paidPercent = +v), show: (v) => `${v}% (${paidPlaces(t.entrants, +v)} places)` },
  ];
  const BREAK_HELP: Record<Breaking, string> = {
    balanced: 'Tables break as soon as the players left fit at fewer, and stay within one player of each other.',
    shorthanded: 'A table only breaks once it is down to two players; the final table forms when everyone fits.',
    final: 'Tables play on until everyone left fits at the final table.',
  };
  const helpFor = (o: Option) => o.label === 'Table breaking' ? BREAK_HELP[t.breaking]
    : o.label === 'Paid' ? `Prizes: ${prizes().map((p, i) => `${ordinal(i + 1)} ${p}`).join(', ')}` : o.help;

  const body = layer(root);
  const describe = (text?: string) => {
    footer.textContent = text ?? (mode === 'cash'
      ? 'Cash Game: pick your opponents and play a set number of rounds.'
      : `Tournament: last one standing wins. Press Tab in game for the standings.\nPrizes: ${prizes().map((p, i) => `${ordinal(i + 1)} ${p}`).join(', ')}`);
  };

  return new Promise((resolve) => {
    const render = () => {
      body.replaceChildren();
      (['cash', 'tournament'] as const).forEach((m, i) => {
        const tab = el('button', `mode-tab${mode === m ? ' on' : ''}`, body);
        place(tab, 20 + i * 184, 52, 176, 28);
        tab.textContent = m === 'cash' ? 'Cash Game' : 'Tournament';
        tab.addEventListener('click', () => {
          play('card');
          mode = m;
          render();
          describe();
        });
      });
      const options = mode === 'cash' ? cashOptions : tournamentOptions;
      options.forEach((o, i) => {
        const y = 88 + i * (options.length > 6 ? 20 : 23);
        const row = textField(body, 'mode-row', 24, y, 352, 21);
        row.textContent = o.label;
        const value = textField(body, 'mode-value', 214, y, 140, 21);
        value.textContent = (o.show ?? String)(o.get());
        const step = (d: number) => {
          const values = typeof o.values === 'function' ? o.values() : o.values;
          const at = values.indexOf(o.get());
          o.set(values[(at + d + values.length) % values.length]);
          t.entrants = Math.min(t.entrants, maxEntrants());
          if (t.tableSize > t.entrants) t.tableSize = Math.max(3, t.entrants);
          saveSettings(settings);
          render();
          describe(helpFor(o));
        };
        hotspot(body, 190, y, 22, 21, `Less ${o.label}`, () => step(-1)).textContent = '◀';
        hotspot(body, 356, y, 22, 21, `More ${o.label}`, () => step(1)).textContent = '▶';
        row.style.pointerEvents = 'auto';
        row.addEventListener('pointerenter', () => describe(helpFor(o)));
        row.addEventListener('pointerleave', () => describe());
      });
      menuButton(body, 296, 238, 92, 'Start ▶', () => {
        root.remove();
        resolve(mode === 'cash' ? { mode, cash: { ...settings.cash } } : { mode, tournament: { ...t } });
      });
      menuButton(body, 296, 266, 92, '◀ Back', () => {
        stopBgm();
        root.remove();
        resolve(null);
      }, 'blue');
    };
    playBgm('select');
    render();
    describe();
  });
}

// --- Tournament: going out, and the final standings -------------------------------------------------
/** Shown over the table when the player goes out with the tournament still running. */
export function bustDialog(stage: HTMLElement, text: string): Promise<'spectate' | 'skip'> {
  const root = layer(stage, 'dialog');
  const box = el('div', 'dialog-box', root);
  place(box, 60, 78, 280, 120);
  textField(box, 'dialog-text', 0, 14, 280, 60).textContent = text;
  return new Promise((resolve) => {
    const done = (c: 'spectate' | 'skip') => {
      root.remove();
      resolve(c);
    };
    menuButton(box, 30, 82, 104, 'Spectate', () => done('spectate'));
    menuButton(box, 146, 82, 104, 'Skip ▶', () => done('skip'), 'blue');
  });
}

/** Final standings with prizes, on the Ranking page art. */
export function tournamentResults(stage: HTMLElement, t: Tournament): Promise<void> {
  const root = layer(stage, 'record-screen');
  new Clip(root, 'record', 0, 0).show(37);
  retitle(root, 'Results', 'record-title');
  const standings = t.standings();
  const me = t.human;
  const pages = Math.ceil(standings.length / PER_PAGE);
  const table = el('div', 'rec-table', root);
  let page = 0;
  const render = () => {
    const rows = standings.slice(page * PER_PAGE, (page + 1) * PER_PAGE).map((e) => [
      ordinal(e.place), e.character?.name ?? player.name, e.prize ? String(e.prize) : '-', e === me ? '◀' : '',
    ]);
    fillTable(table, ['Place', 'Name', 'Prize', ''], [[50, 44, 'left'], [98, 110, 'left'], [210, 70, 'right'], [286, 20, 'left']], rows,
      me ? `You: ${ordinal(me.place)} of ${t.entries.length}${me.prize ? `, won ${me.prize}` : ''}  (buy-in ${BUY_IN})`
        : `${t.entries.length} players, buy-in ${BUY_IN}`);
  };
  playBgm('record');
  render();
  return new Promise((resolve) => {
    if (pages > 1) hotspot(root, 170, 268, 65, 25, 'Page', () => ((page = (page + 1) % pages), render()));
    hotspot(root, 302, 268, 65, 25, 'OK', () => {
      stopBgm();
      root.remove();
      resolve();
    });
  });
}

type Col = [x: number, w: number, align: 'left' | 'right'];

/** A header row plus up to eight rows, in the record screen's text style. */
function fillTable(box: HTMLElement, head: string[], cols: Col[], rows: string[][], footer = ''): void {
  box.replaceChildren();
  cols.forEach(([x, w, align], c) => {
    const f = textField(box, `rec-text ${align}`, x, 60, w);
    f.textContent = [head[c], '', ...rows.map((r) => r[c])].join('\n');
  });
  if (footer) textField(box, 'rec-text rec-footer', 50, 230, 300).textContent = footer;
}

// --- Record (SP_Record): Total Record page, then Ranking pages ------------------------------------
const PER_PAGE = 8;

export function recordScreen(stage: HTMLElement): Promise<void> {
  const root = layer(stage, 'record-screen');
  const art = new Clip(root, 'record', 0, 0);
  // Total page: labels | values | hand names | counts.
  const cols = [textField(root, 'rec-text compact', 50, 58), textField(root, 'rec-text compact right', 104, 58, 46),
    textField(root, 'rec-text', 185, 60), textField(root, 'rec-text right', 300, 60, 46)];
  const table = el('div', 'rec-table', root);
  const title = el('div', 'title-cover record-title', root);
  place(title, 40, 6, 320, 36).textContent = 'Tournament';
  let data: SaveData = load();
  let page = 0;

  const everyone = () => [
    { name: player.name, r: data.player },
    ...characters.map((c) => ({ name: c.name, r: data.characters[c.id] ?? emptyRecord() })),
  ];
  // Games count cash games and tournaments alike; the order is by net coins, then average cash-game place.
  const played = (r: CharacterRecord) => r.games + r.tourneys;
  const ranking = () => everyone()
    .map((x) => ({ ...x, avg: x.r.games ? x.r.rankSum / x.r.games : Infinity }))
    .sort((a, b) => (played(b.r) ? 1 : 0) - (played(a.r) ? 1 : 0) || b.r.coins - a.r.coins || a.avg - b.avg);
  const tourneyRanking = () => everyone().sort((a, b) => b.r.prize - a.r.prize || b.r.titles - a.r.titles || b.r.tourneys - a.r.tourneys);
  const listPages = Math.ceil((characters.length + 1) / PER_PAGE);
  const pages = () => 1 + listPages * 2;

  const render = () => {
    cols.forEach((c) => (c.textContent = ''));
    table.replaceChildren();
    title.style.display = 'none';
    if (page === 0) {
      art.show(6);
      const games = played(data.player);
      cols[0].textContent = 'Game\nCoin\nRound\nWin\nLose\nDrop\n1st\n2nd\n3rd\n4th\n5th\n6th';
      cols[1].textContent = [games, data.player.coins, data.wins + data.losses + data.drops, data.wins, data.losses,
        data.drops, ...data.places.slice(1, 7)].join('\n');
      const shown = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11];
      cols[2].textContent = shown.map((i) => HAND_NAMES[i]).join('\n');
      cols[3].textContent = shown.map((i) => data.handCounts[i]).join('\n');
      return;
    }
    art.show(37);
    const tourney = page > listPages;
    const start = (tourney ? page - 1 - listPages : page - 1) * PER_PAGE;
    if (!tourney) {
      const rows = ranking().slice(start, start + PER_PAGE).map((r, i) => [
        `${ordinal(start + i + 1).padEnd(5)} ${r.name}`, r.r.games ? (Math.floor(r.avg * 100) / 100).toFixed(2) : '--', String(r.r.coins), String(played(r.r)),
      ]);
      fillTable(table, ['        Name', 'Rank', 'Coin', 'Game'], [[50, 130, 'left'], [185, 46, 'right'], [236, 46, 'right'], [300, 46, 'right']], rows);
      return;
    }
    title.style.display = '';
    const p = data.player;
    const rows = tourneyRanking().slice(start, start + PER_PAGE).map((r) => [
      r.name, String(r.r.tourneys), String(r.r.cashes), String(r.r.titles), r.r.best ? ordinal(r.r.best) : '--', String(r.r.prize),
    ]);
    fillTable(table, ['Name', 'Play', 'Paid', '1st', 'Best', 'Prize'],
      [[50, 90, 'left'], [140, 40, 'right'], [184, 40, 'right'], [226, 30, 'right'], [260, 40, 'right'], [304, 46, 'right']], rows,
      p.tourneys ? `You: ${p.tourneys} played, ${p.cashes} paid, ${p.titles} won, best ${ordinal(p.best)}` : '');
  };

  playBgm('record');
  render();

  return new Promise((resolve) => {
    const reset = hotspot(root, 32, 268, 65, 25, 'Reset', async () => {
      if (page !== 0) return;
      if (await confirmReset(root)) data = resetRecords();
      render();
    });
    hotspot(root, 170, 268, 65, 25, 'Page', () => {
      page = (page + 1) % pages();
      reset.style.display = page === 0 ? '' : 'none';
      render();
    });
    hotspot(root, 302, 268, 65, 25, 'OK', () => {
      stopBgm();
      root.remove();
      resolve();
    });
  });
}

/** SP_Reset: the confirm dialog, with an English line over the original Japanese. */
async function confirmReset(parent: HTMLElement): Promise<boolean> {
  const root = layer(parent, 'reset-dialog');
  const box = new Clip(root, 'reset', 0, 0);
  await box.play(1, 19);
  const note = textField(root, 'reset-text', 26, 97, 348, 60);
  note.textContent = 'Reset the play data saved in this browser.\nAre you sure?';
  const answer = await new Promise<boolean>((resolve) => {
    hotspot(root, 98, 171, 66, 25, 'Reset records', () => resolve(true));
    hotspot(root, 240, 171, 66, 25, 'Cancel', () => resolve(false));
  });
  note.remove();
  await box.play(20, 28);
  root.remove();
  return answer;
}
