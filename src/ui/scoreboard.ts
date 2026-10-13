// Press Tab for the standings (like TF2's scoreboard): rank, a strip of each player's eyes, name and stack.
import type { Character } from '../characters';
import { ui, uiUrl } from './assets';
import { paintFace } from './portrait';
import { el, layer, place } from './stage';

export interface ScoreRow {
  rank: number;
  /** null = the player. */
  character: Character | null;
  name: string;
  /** Right-hand column: the stack, or how they finished. */
  value: string;
  /** Small note beside the name (table number, prize). */
  note?: string;
  me: boolean;
  out: boolean;
  /** Moved up or down the standings over the last round. */
  move?: 'up' | 'down';
}

/**
 * Remembers everyone's standing at the end of the last two rounds, for the board's up/down arrows.
 * Ranks count players with strictly more, so ties don't read as moves.
 */
export class RankTracker {
  private prev = new Map<string, number>();
  private curr = new Map<string, number>();

  /** Call once per round with everyone's key and score (higher is better). */
  update(scores: [key: string, score: number][]): void {
    this.prev = this.curr;
    this.curr = new Map(scores.map(([k, v]) => [k, scores.filter(([, w]) => w > v).length]));
  }

  move(key: string): 'up' | 'down' | undefined {
    const was = this.prev.get(key);
    const now = this.curr.get(key);
    if (was === undefined || now === undefined || was === now) return undefined;
    return now < was ? 'up' : 'down';
  }
}

export interface Scoreboard {
  title: string;
  /** Up to two short lines of match info, shown right of the title. */
  info: string[];
  rows: ScoreRow[];
}

const PER_COLUMN = 10;
const ROW_H = 24;

/** Tab shows or hides the board. Returns a function that removes it. */
export function installScoreboard(stage: HTMLElement, provide: () => Scoreboard): () => void {
  const root = layer(stage, 'scoreboard');
  root.style.display = 'none';

  // Built once; the live refreshes only swap the text and rows, so the list keeps its scroll (even mid-scroll).
  const panel = el('div', 'sb-panel', root);
  place(panel, 8, 8, 384, 284);
  const title = el('div', 'sb-title', panel);
  const info = el('div', 'sb-info', panel);
  // Everyone, in two columns (top half left, bottom half right); past ten rows a column, the list scrolls.
  const list = el('div', 'sb-list', panel);
  place(list, 0, 38, 380, 242);
  const inner = el('div', 'sb-inner', list);

  const render = (scrollToMe = false) => {
    const board = provide();
    title.textContent = board.title;
    info.textContent = board.info.join('\n');
    inner.replaceChildren();
    const rows = board.rows;
    const columns = rows.length > PER_COLUMN ? 2 : 1;
    const perColumn = Math.ceil(rows.length / columns);
    inner.style.height = `${perColumn * ROW_H + 4}px`;
    rows.forEach((r, i) => {
      const col = Math.floor(i / perColumn);
      const row = el('div', `sb-row${r.me ? ' me' : ''}${r.out ? ' out' : ''}${i % 2 ? ' odd' : ''}`, inner);
      const w = columns === 2 ? 184 : 372;
      place(row, 6 + col * 190, 2 + (i % perColumn) * ROW_H, w, 22);
      if (r.me && scrollToMe) list.scrollTop = Math.max(0, (i % perColumn) * ROW_H - 100);
      const move = el('div', `sb-move${r.move ? ` ${r.move}` : ''}`, row);
      move.textContent = r.move === 'up' ? '▲' : r.move === 'down' ? '▼' : '';
      el('div', 'sb-rank', row).textContent = String(r.rank);
      const face = el('div', 'sb-face', row);
      if (r.character) {
        face.style.setProperty('--accent', r.character.look.color);
        paintFace(face, r.character.art[r.out ? 'lose' : 'neutral'], r.character.look.face, 34, 18, 1.15, 0.12);
      } else {
        // The player's Mona, cropped from the original box art.
        const art = ui('mona-2');
        face.style.backgroundImage = `url("${uiUrl(art)}")`;
        const k = 0.7;
        face.style.backgroundSize = `${art.w * k}px ${art.h * k}px`;
        face.style.backgroundPosition = `${-(art.ox + 35) * k + 17}px ${-38 * k + 9}px`;
      }
      const name = el('div', 'sb-name', row);
      name.textContent = r.name;
      if (r.note) el('span', 'sb-note', name).textContent = ` ${r.note}`;
      el('div', 'sb-value', row).textContent = r.value;
    });
  };

  // Tab toggles it; while open it refreshes as stacks change.
  let timer = 0;
  const down = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    if (e.repeat) return;
    if (root.style.display === 'none') {
      render(true);
      root.style.display = '';
      timer = window.setInterval(() => render(), 500);
    } else {
      root.style.display = 'none';
      clearInterval(timer);
    }
  };
  window.addEventListener('keydown', down);
  return () => {
    window.removeEventListener('keydown', down);
    clearInterval(timer);
    root.remove();
  };
}
