// Character registry. Every folder here with a character.json is a playable opponent:
// to add one, copy a folder, swap the four sprites and edit the JSON. Nothing else to register.
import type { CharacterData, Emotion } from '../engine/types';

const data = import.meta.glob<CharacterData>('./*/character.json', { eager: true, import: 'default' });
const images = import.meta.glob<string>('./*/*.{webp,png,jpg}', { eager: true, import: 'default', query: '?url' });

export interface Character extends CharacterData {
  /** Resolved image URLs. */
  art: Record<Emotion, string>;
  companionArt?: Record<Emotion, string>;
}

function resolveArt(id: string, sprites: Record<Emotion, string>): Record<Emotion, string> {
  const out = {} as Record<Emotion, string>;
  for (const [emotion, file] of Object.entries(sprites) as [Emotion, string][]) {
    const url = images[`./${id}/${file}`];
    if (!url) throw new Error(`characters/${id}: missing sprite ${file}`);
    out[emotion] = url;
  }
  return out;
}

export const characters: Character[] = Object.entries(data)
  .map(([path, c]) => {
    const id = path.split('/')[1];
    return {
      ...c,
      id,
      art: resolveArt(id, c.look.sprites),
      companionArt: c.look.companion ? resolveArt(id, c.look.companion.sprites) : undefined,
    };
  })
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name));

export const characterById = (id: string): Character | undefined => characters.find((c) => c.id === id);
