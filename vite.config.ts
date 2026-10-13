import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Plugin, defineConfig } from 'vite';

/** Dev only: lets tools/faces.html save a character's look.face back into its character.json. */
const written = new Set<string>();
const faceEditor = (): Plugin => ({
  name: 'face-editor',
  apply: 'serve',
  // Our own saves don't reload the editor page (it already shows the new face).
  handleHotUpdate({ file }) {
    if (written.delete(file)) return [];
  },
  configureServer(server) {
    server.middlewares.use('/__face', (req, res) => {
      if (req.method !== 'POST') return void res.writeHead(405).end();
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const { id, face, companion } = JSON.parse(body) as { id: string; face: { x: number; y: number; size: number }; companion?: boolean };
          if (!/^[a-z0-9-]+$/.test(id)) throw new Error('bad id');
          const file = resolve(__dirname, 'src/characters', id, 'character.json');
          const data = JSON.parse(readFileSync(file, 'utf8'));
          const round = (n: number) => Math.round(n * 1000) / 1000;
          const box = { x: round(face.x), y: round(face.y), size: round(face.size) };
          if (companion) data.look.companion.face = box;
          else data.look.face = box;
          written.add(file);
          writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(box));
        } catch (e) {
          res.writeHead(400).end(String(e));
        }
      });
    });
  },
});

// Relative base so the built game runs from any folder or static host.
export default defineConfig({ base: './', plugins: [faceEditor()] });
