// Extracts the original Poker Face Up UI (vector art + sounds) from the SWF into public/ui.
// Usage: node tools/extract-swf-ui.mjs [path/to/game.swf]
// Requires JPEXS (`ffdec`) on PATH. Touhou character art is NOT taken from the SWF; only the original
// opponents are, as avatars for online players.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const swf = resolve(process.argv[2] ?? join(root, '..', 'dagobah_poker_face_up_survival.swf'));
const work = join(root, '.swf-export');
const out = join(root, 'public', 'ui');

if (!existsSync(join(work, 'sprites'))) {
  mkdirSync(work, { recursive: true });
  execFileSync('ffdec', ['-format', 'shape:svg,sprite:svg,button:svg,sound:mp3', '-export', 'shape,sprite,button,sound', work, swf], { stdio: 'inherit' });
}
if (!existsSync(join(work, 'swf.xml'))) execFileSync('ffdec', ['-swf2xml', swf, join(work, 'swf.xml')], { stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Sprites whose frames we reuse, keyed by the name the game code uses.
const SPRITES = {
  card: 'DefineSprite_4002_SP_Card', jien: 'DefineSprite_4004_SP_JIEN', mona: 'DefineSprite_4006_SP_Mona',
  dcard: 'DefineSprite_4008_SP_DCard', coin: 'DefineSprite_4010_SP_Coin', ocard: 'DefineSprite_4014_SP_O_Card',
  hold: 'DefineSprite_4402_SP_Hold', title: 'DefineSprite_5402_SP_Title', record: 'DefineSprite_5404_SP_Record',
  credit: 'DefineSprite_5406_SP_Credit', select: 'DefineSprite_5408_SP_Select', reset: 'DefineSprite_5410_SP_Reset',
  waku: 'DefineSprite_5598_SP_Waku',
  // The original opponents, as online players' avatars (frames: 1-2 normal, 3-4 cards, 5-6 drop, 7-8 win).
  'avatar-giko': 'DefineSprite_4614_SP_Giko_R', 'avatar-sii': 'DefineSprite_4606_SP_Sii_R',
  'avatar-morara': 'DefineSprite_4610_SP_Morara_R', 'avatar-shin': 'DefineSprite_4618_SP_shin_R',
  'avatar-fun': 'DefineSprite_4622_SP_fun_R', 'avatar-zu': 'DefineSprite_4626_SP_zu_R',
  'avatar-syobo': 'DefineSprite_4630_SP_syobo_R',
};
const BUTTONS = {
  hold0: 'DefineButton2_20025', raise2: 'DefineButton2_20030', raise: 'DefineButton2_20031', call: 'DefineButton2_20032',
  drop: 'DefineButton2_20033', dropAlt: 'DefineButton2_20034', next: 'DefineButton_20035',
};
const CARD_LABELS = [
  ...['14', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'].flatMap((r) => ['a', 'b', 'c', 'd'].map((s) => r + s)),
  'jjj',
];

const manifest = {};
// Registration point = the translate on the SVG's outer <g>; size from the root element.
function register(key, src) {
  const svg = readFileSync(src, 'utf8');
  const size = svg.match(/height="([\d.]+)px" width="([\d.]+)px"/);
  const origin = svg.match(/<g transform="matrix\([^,]+, [^,]+, [^,]+, [^,]+, (-?[\d.]+), (-?[\d.]+)\)"/);
  const file = `${key}.svg`;
  cpSync(src, join(out, file));
  manifest[key] = { file, w: +size[2], h: +size[1], ox: origin ? +origin[1] : 0, oy: origin ? +origin[2] : 0 };
}

for (const [name, dir] of Object.entries(SPRITES)) {
  for (const f of readdirSync(join(work, 'sprites', dir))) {
    const frame = parseInt(f, 10);
    const key = name === 'card' ? `card-${CARD_LABELS[frame - 1]}` : `${name}-${frame}`;
    register(key, join(work, 'sprites', dir, f));
  }
}
for (const [name, dir] of Object.entries(BUTTONS)) {
  for (const f of readdirSync(join(work, 'buttons', dir))) {
    const state = f.replace(/^\d_|\.svg$/g, '');
    if (state !== 'hittest') register(`btn-${name}-${state}`, join(work, 'buttons', dir, f));
  }
}
register('table', join(work, 'shapes', '202.svg'));
// The same table without its beige backdrop, so characters can sit between the backdrop and the felt.
const felt = readFileSync(join(out, 'table.svg'), 'utf8').replace(/<path d="[^"]*" fill="#d2bc90"[^>]*\/>/, '');
writeFileSync(join(out, 'table-felt.svg'), felt);
manifest['table-felt'] = { ...manifest.table, file: 'table-felt.svg' };

mkdirSync(join(out, 'sound'));
for (const f of readdirSync(join(work, 'sounds'))) {
  cpSync(join(work, 'sounds', f), join(out, 'sound', f.replace(/^\d+_MP_/, '').toLowerCase()));
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
// JPEXS flattens Flash's drawing layers (all fills, then all outlines); put them back in order.
execFileSync('python3', [join(root, 'tools', 'fix-svg-layers.py'), join(work, 'swf.xml'), out], { stdio: 'inherit' });
console.log(`wrote ${Object.keys(manifest).length} UI assets to ${out}`);
