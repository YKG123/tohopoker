// Title, Select Characters, Record and Credit screens, laid out on the original art.
import { type Character, characters } from '../characters';
import { HAND_NAMES } from '../engine/hand';
import { player } from '../player';
import { type SaveData, load, resetRecords, store } from '../save';
import { play, playBgm, setBgmEnabled, stopBgm } from '../ui/assets';
import { paintFace } from '../ui/portrait';
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

export function titleScreen(stage: HTMLElement): Promise<TitleChoice> {
  const root = layer(stage, 'title-screen');
  new Clip(root, 'title', 0, 0).show(2);
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
const PICK = 3;
const COLS = 8;
const PER_SELECT_PAGE = 15;

export function selectScreen(stage: HTMLElement): Promise<Character[]> {
  const root = layer(stage, 'select-screen');
  new Clip(root, 'select', 0, 0).show(4);
  place(el('div', 'select-cover', root), 0, 46, 400, 183);
  const footer = textField(root, 'select-footer', 8, 234, 384, 60);
  const picked: Character[] = [];
  const stamps = new Map<string, Clip>();

  const describe = (c?: Character) => {
    if (!c) {
      footer.textContent = `Select ${PICK - picked.length} more opponent${PICK - picked.length === 1 ? '' : 's'}.\n${picked.map((p) => p.name).join(', ')}`;
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
      name.textContent = c ? c.name : 'Auto';
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

// --- Record (SP_Record): Total Record page, then Ranking pages ------------------------------------
const PER_PAGE = 8;

export function recordScreen(stage: HTMLElement): Promise<void> {
  const root = layer(stage, 'record-screen');
  const art = new Clip(root, 'record', 0, 0);
  // Total page: labels | values | hand names | counts. Ranking pages: name | (unused) | rank | coin | games.
  const cols = [textField(root, 'rec-text', 50, 60), textField(root, 'rec-text right', 104, 60, 46),
    textField(root, 'rec-text', 185, 60), textField(root, 'rec-text right', 300, 60, 46),
    textField(root, 'rec-text right', 236, 60, 46)];
  let data: SaveData = load();
  let page = 0;

  const ranking = () => {
    const rows = [
      { name: player.name, r: data.player },
      ...characters.map((c) => ({ name: c.name, r: data.characters[c.id] ?? { games: 0, coins: 0, rankSum: 0 } })),
    ].map((x) => ({ ...x, avg: x.r.games ? x.r.rankSum / x.r.games : Infinity }));
    return rows.sort((a, b) => a.avg - b.avg);
  };
  const pages = () => 1 + Math.ceil((characters.length + 1) / PER_PAGE);

  const render = () => {
    cols[4].textContent = '';
    if (page === 0) {
      art.show(6);
      const games = data.player.games;
      cols[0].textContent = 'Game\nCoin\nRound\nWin\nLose\nDrop\n1st\n2nd\n3rd\n4th';
      cols[1].textContent = [games, data.player.coins, data.wins + data.losses + data.drops, data.wins, data.losses,
        data.drops, ...data.places.slice(1)].join('\n');
      const shown = [0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11];
      cols[2].textContent = shown.map((i) => HAND_NAMES[i]).join('\n');
      cols[3].textContent = shown.map((i) => data.handCounts[i]).join('\n');
      return;
    }
    art.show(37);
    const start = (page - 1) * PER_PAGE;
    const rows = ranking().slice(start, start + PER_PAGE);
    const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
    cols[0].textContent = '        Name\n\n' + rows.map((r, i) => `${ordinal(start + i + 1).padEnd(5)} ${r.name}`).join('\n');
    cols[1].textContent = '';
    cols[2].textContent = '   Rank\n\n' + rows.map((r) => `   ${r.r.games ? (Math.floor(r.avg * 100) / 100).toFixed(2) : '--'}`).join('\n');
    cols[4].textContent = 'Coin\n\n' + rows.map((r) => r.r.coins).join('\n');
    cols[3].textContent = 'Game\n\n' + rows.map((r) => r.r.games).join('\n');
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
