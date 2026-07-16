const fs = require('fs');
const path = require('path');

const root = process.cwd();
const BACKUP_SUFFIX = 'bak-demo-fill-mines-tool';

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${relativePath}. Run this from the repo root.`);
  const text = fs.readFileSync(file, 'utf8');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  return { file, text, newline, relativePath };
}

function write(source, text) {
  if (source.text === text) {
    console.log(`No changes needed: ${source.relativePath}`);
    return false;
  }
  const backup = `${source.file}.${BACKUP_SUFFIX}`;
  if (!fs.existsSync(backup)) fs.copyFileSync(source.file, backup);
  if (source.newline === '\r\n') text = text.replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(source.file, text, 'utf8');
  console.log(`Updated: ${source.relativePath}`);
  return true;
}

function findOnMessageBlock(text, messageName) {
  const start = text.indexOf(`this.onMessage("${messageName}"`);
  if (start === -1) return null;
  const endMarker = '\n    });';
  const end = text.indexOf(endMarker, start);
  if (end === -1) throw new Error(`Found ${messageName}, but could not find the end of the handler.`);
  return { start, end: end + endMarker.length, block: text.slice(start, end + endMarker.length) };
}

function ensureMineImport(text) {
  // If Mine is already imported from GameState, leave it alone.
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']\.\.\/schema\/GameState["'];/;
  const match = text.match(importRegex);
  if (!match) throw new Error('Could not find the GameState import in server/rooms/GameRoom.ts.');
  const names = match[1].split(',').map((x) => x.trim()).filter(Boolean);
  if (!names.includes('Mine')) names.push('Mine');
  return text.replace(importRegex, `import { ${names.join(', ')} } from "../schema/GameState";`);
}

function updateGameRoom() {
  const source = read('server/rooms/GameRoom.ts');
  let text = source.text;

  if (!text.includes('private advanceToStage(')) {
    throw new Error('Could not find advanceToStage(). This does not look like the expected GameRoom.ts.');
  }

  if (!text.includes('this.state.mines')) {
    throw new Error('Could not find this.state.mines. Apply/restore the mine feature before adding the demo fill tool.');
  }

  text = ensureMineImport(text);

  const handler = [
    'this.onMessage("devFillMines", (_client, message?: { includePaintedCells?: boolean }) => {',
    '      // TEMP LOCAL DEMO TOOL:',
    '      // Fills the currently visible empty board cells with demo mines so the mine effects are easy to show.',
    '      const allowDemoMineFill =',
    '        this.isDevMode ||',
    '        process.env.NODE_ENV !== "production" ||',
    '        process.env.MINE_TEST_TOOLS === "true";',
    '',
    '      if (!allowDemoMineFill || !this.state.gameStarted) {',
    '        console.log(',
    '          `[Demo Mines] ignored. allowed=${allowDemoMineFill}, started=${this.state.gameStarted}`',
    '        );',
    '        return;',
    '      }',
    '',
    '      this.fillVisibleEmptyGridWithDemoMines(Boolean(message?.includePaintedCells));',
    '    });',
  ].join('\n');

  const existingFillHandler = findOnMessageBlock(text, 'devFillMines');
  if (existingFillHandler) {
    text = text.slice(0, existingFillHandler.start) + handler + text.slice(existingFillHandler.end);
  } else {
    const devStageUp = findOnMessageBlock(text, 'devStageUp');
    if (!devStageUp) throw new Error('Could not find devStageUp handler to insert after.');
    text = text.slice(0, devStageUp.end) + '\n\n    ' + handler + text.slice(devStageUp.end);
  }

  const helperMarker = 'private fillVisibleEmptyGridWithDemoMines';
  const helper = [
    '  private fillVisibleEmptyGridWithDemoMines(includePaintedCells: boolean = false) {',
    '    const center = Math.floor(this.MAX_GRID_SIZE / 2);',
    '    const halfWidth = Math.floor(this.state.gridWidth / 2);',
    '    const halfHeight = Math.floor(this.state.gridHeight / 2);',
    '    const minX = center - halfWidth;',
    '    const maxX = center + halfWidth - 1;',
    '    const minY = center - halfHeight;',
    '    const maxY = center + halfHeight - 1;',
    '',
    '    const colors: PlayerColor[] = ["RED", "GREEN", "BLUE"];',
    '    const demoTypes = ["square", "horizontal", "vertical", "cross", "diagonal", "cluster"];',
    '    const existingMineCells = new Set<string>();',
    '',
    '    for (const mine of this.state.mines) {',
    '      existingMineCells.add(`${mine.x},${mine.y}`);',
    '    }',
    '',
    '    let placed = 0;',
    '    let skippedOccupied = 0;',
    '    let skippedPainted = 0;',
    '',
    '    const isActorOnCell = (x: number, y: number) => {',
    '      for (const player of this.state.players.values()) {',
    '        if (player.x === x && player.y === y) return true;',
    '      }',
    '',
    '      for (const collectible of this.state.collectibles) {',
    '        if (collectible.x === x && collectible.y === y) return true;',
    '      }',
    '',
    '      for (const enemy of this.state.enemies) {',
    '        if (enemy.x === x && enemy.y === y) return true;',
    '      }',
    '',
    '      return false;',
    '    };',
    '',
    '    for (let y = minY; y <= maxY; y++) {',
    '      for (let x = minX; x <= maxX; x++) {',
    '        const key = `${x},${y}`;',
    '',
    '        if (existingMineCells.has(key) || isActorOnCell(x, y)) {',
    '          skippedOccupied++;',
    '          continue;',
    '        }',
    '',
    '        // Default demo behavior: do NOT place mines under existing painted paths.',
    '        // That keeps this from instantly feeling broken and avoids same-cell trigger edge cases.',
    '        if (!includePaintedCells && this.state.gridColors.has(key)) {',
    '          skippedPainted++;',
    '          continue;',
    '        }',
    '',
    '        const mine = new Mine();',
    '        mine.id = `demo-mine-${this.state.stage}-${Date.now()}-${placed}`;',
    '        mine.x = x;',
    '        mine.y = y;',
    '        mine.color = colors[placed % colors.length];',
    '        (mine as any).type = demoTypes[placed % demoTypes.length];',
    '        this.state.mines.push(mine);',
    '        existingMineCells.add(key);',
    '        placed++;',
    '      }',
    '    }',
    '',
    '    console.log(',
    '      `[Demo Mines] filled visible board with ${placed} demo mines. ` +',
    '      `Skipped occupied/existing=${skippedOccupied}, painted=${skippedPainted}, ` +',
    '      `total mines=${this.state.mines.length}`',
    '    );',
    '',
    '    this.broadcast("devFillMinesComplete", {',
    '      placed,',
    '      totalMines: this.state.mines.length,',
    '      skippedOccupied,',
    '      skippedPainted,',
    '      includePaintedCells,',
    '    });',
    '  }',
  ].join('\n');

  if (text.includes(helperMarker)) {
    const start = text.indexOf('  private fillVisibleEmptyGridWithDemoMines');
    const nextPrivate = text.indexOf('\n  private ', start + 5);
    if (nextPrivate === -1) throw new Error('Could not find end of existing fillVisibleEmptyGridWithDemoMines helper.');
    text = text.slice(0, start) + helper + '\n\n' + text.slice(nextPrivate + 1);
  } else {
    const scoreIndex = text.indexOf('  private calculateScores()');
    if (scoreIndex === -1) throw new Error('Could not find private calculateScores() insertion point.');
    text = text.slice(0, scoreIndex) + helper + '\n\n' + text.slice(scoreIndex);
  }

  write(source, text);
}

function updateDevStageControls() {
  const source = read('client/src/components/game/DevStageControls.tsx');
  let text = source.text;

  if (text.includes('devFillMines')) {
    console.log('DevStageControls already has the demo mine fill button.');
    return;
  }

  const button = [
    '        <button',
    '          type="button"',
    '          onClick={() => {',
    '            if (room) {',
    '              console.log("[Demo Mines] Requesting empty-cell mine fill");',
    '              room.send("devFillMines", { includePaintedCells: false });',
    '            }',
    '          }}',
    '          disabled={!room}',
    '          className="rounded border border-red-400/30 bg-red-950/35 px-2.5 py-1 text-xs font-medium text-red-100 transition-colors hover:bg-red-900/50 disabled:opacity-30 disabled:cursor-not-allowed"',
    '          title="Fill visible empty grid cells with demo mines. Existing paths, players, collectibles, enemies, and old mines are skipped."',
    '        >',
    '          Fill Empty Mines',
    '        </button>',
  ].join('\n');

  const anchor = '      <p className="text-[9px] text-white/30">';
  const anchorIndex = text.indexOf(anchor);
  if (anchorIndex !== -1) {
    text = text.slice(0, anchorIndex) + button + '\n' + text.slice(anchorIndex);
    write(source, text);
    return;
  }

  const closingPanel = '    </div>\n  );';
  const closingIndex = text.lastIndexOf(closingPanel);
  if (closingIndex === -1) throw new Error('Could not find a safe JSX insertion point in DevStageControls.tsx.');
  text = text.slice(0, closingIndex) + '      <div className="flex items-center gap-2">\n' + button + '\n      </div>\n' + text.slice(closingIndex);
  write(source, text);
}

updateGameRoom();
updateDevStageControls();

console.log('\nDemo mine fill tool applied.');
console.log('Next: restart dev server: Ctrl+C, then npm run dev');
console.log('Open the Dev Controls menu and click "Fill Empty Mines".');
console.log('It fills empty visible cells only; painted paths are skipped by default.');
