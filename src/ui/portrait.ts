// Crops of Dairi-style standing portraits: full figure for the table, face strips for banners/icons.
import type { FaceBox } from '../engine/types';
import { keepInMemory, local } from './assets';

const sizes = new Map<string, Promise<{ w: number; h: number }>>();

export function imageSize(url: string): Promise<{ w: number; h: number }> {
  let p = sizes.get(url);
  if (!p) {
    p = keepInMemory(url).then((src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error(`could not load ${url}`));
      img.src = src;
    }));
    sizes.set(url, p);
  }
  return p;
}

const widths = new Map<string, Promise<number>>();

/**
 * How wide the figure looks at the table, in face heights: the opaque part above the rail
 * (about 2.3 faces below the eyes). Sprite canvases carry uneven transparent margins, so the
 * canvas width alone sorts some figures wrongly.
 */
export function figureWidth(url: string, face: FaceBox): Promise<number> {
  let p = widths.get(url);
  if (!p) {
    p = keepInMemory(url).then((src) => new Promise<number>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight, s = face.size * h;
        const rows = Math.max(1, Math.min(h, Math.round(face.y * h + 2.3 * s)));
        const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(w / s);
        ctx.canvas.width = w;
        ctx.canvas.height = rows;
        ctx.drawImage(img, 0, 0);
        const a = ctx.getImageData(0, 0, w, rows).data;
        let left = w, right = -1;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < left; x++) if (a[(y * w + x) * 4 + 3] > 40) { left = x; break; }
          for (let x = w - 1; x > right; x--) if (a[(y * w + x) * 4 + 3] > 40) { right = x; break; }
        }
        resolve(right < left ? w / s : (right - left + 1) / s);
      };
      img.onerror = () => resolve(0);
      img.src = src;
    }));
    widths.set(url, p);
  }
  return p;
}

export const preloadImages = (urls: string[]): Promise<unknown> => Promise.all(urls.map(imageSize));

/**
 * Fills `box` (boxW x boxH stage px) with the part of the portrait around the face.
 * The crop is `zoom` face boxes wide, keeps the box's aspect, and is centered `lift` face boxes above the face center.
 */
export async function paintFace(box: HTMLElement, url: string, face: FaceBox, boxW: number, boxH: number, zoom = 1, lift = 0): Promise<void> {
  const { w, h } = await imageSize(url);
  const cropW = face.size * h * zoom;
  const k = boxW / cropW;
  const cx = face.x * w;
  const cy = (face.y - face.size * lift) * h;
  box.style.backgroundImage = `url("${local(url)}")`;
  box.style.backgroundSize = `${w * k}px ${h * k}px`;
  box.style.backgroundPosition = `${-(cx - cropW / 2) * k}px ${-(cy * k - boxH / 2)}px`;
}

/**
 * Sizes and places a full-figure <img> so its face is `faceH` px tall and centered on (x, y).
 */
export async function placeFigure(img: HTMLImageElement, url: string, face: FaceBox, x: number, y: number, faceH: number): Promise<void> {
  const { w, h } = await imageSize(url);
  const k = faceH / (face.size * h);
  img.src = local(url);
  img.style.width = `${w * k}px`;
  img.style.height = `${h * k}px`;
  img.style.left = `${x - face.x * w * k}px`;
  img.style.top = `${y - face.y * h * k}px`;
  img.style.transformOrigin = `${face.x * w * k}px 0`;
}
