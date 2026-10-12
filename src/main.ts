import { recordMatch } from './save';
import { playMatch } from './engine/match';
import { TableView } from './game/tableView';
import { creditScreen, fade, recordScreen, selectScreen, titleScreen } from './game/screens';
import { preloadImages } from './ui/portrait';
import { loadUi } from './ui/assets';
import { createStage } from './ui/stage';
import './style.css';

const stage = createStage(document.getElementById('app')!);

async function run(): Promise<never> {
  await loadUi();
  while (true) {
    const choice = await titleScreen(stage);
    if (choice === 'credit') {
      await creditScreen(stage);
    } else if (choice === 'record') {
      await recordScreen(stage);
    } else {
      const opponents = await selectScreen(stage);
      let table!: TableView;
      await fade(stage, async () => {
        await preloadImages(opponents.flatMap((c) => [...Object.values(c.art), ...Object.values(c.companionArt ?? {})]));
        table = new TableView(stage, opponents);
      });
      const result = await playMatch(opponents, table);
      recordMatch(opponents.map((c) => c.id), result);
      await fade(stage, () => table.destroy());
    }
  }
}

run();
