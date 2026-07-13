const fs = require('fs');
const path = require('path');

const root = process.cwd();
const BACKUP_SUFFIX = 'bak-remove-demo-mines-add-fill-lines';

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing file: ${relativePath}. Run this from the repo root.`);
  }
  const text = fs.readFileSync(file, 'utf8');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  return { file, relativePath, text, newline };
}

function write(source, nextText) {
  if (source.text === nextText) {
    console.log(`No changes needed: ${source.relativePath}`);
    return false;
  }

  const backup = `${source.file}.${BACKUP_SUFFIX}`;
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(source.file, backup);
  }

  if (source.newline === '\r\n') {
    nextText = nextText.replace(/\r?\n/g, '\r\n');
  }

  fs.writeFileSync(source.file, nextText, 'utf8');
  console.log(`Updated: ${source.relativePath}`);
  return true;
}

function findOnMessageBlock(text, messageName) {
  const start = text.indexOf(`this.onMessage("${messageName}"`);
  if (start === -1) return null;

  const endMarker = '\n    });';
  const end = text.indexOf(endMarker, start);
  if (end === -1) {
    throw new Error(`Found ${messageName}, but could not find the end of the handler.`);
  }

  return {
    start,
    end: end + endMarker.length,
    block: text.slice(start, end + endMarker.length),
  };
}

function removeOnMessageBlock(text, messageName) {
  const block = findOnMessageBlock(text, messageName);
  if (!block) return { text, removed: false };

  let before = text.slice(0, block.start);
  const after = text.slice(block.end);

  // Remove nearby temporary comment directly above the handler if present.
  before = before.replace(/\n\s*\/\/\s*(TEMP|Demo|Mine|Stage|Handle)[^\n]*\n\s*$/i, '\n');

  let nextText = before + after;
  nextText = nextText.replace(/\n{4,}/g, '\n\n\n');
  return { text: nextText, removed: true };
}

function removePrivateMethod(text, methodName) {
  const start = text.indexOf(`  private ${methodName}`);
  if (start === -1) return { text, removed: false };

  const nextPrivate = text.indexOf('\n  private ', start + 5);
  if (nextPrivate === -1) {
    throw new Error(`Found ${methodName}, but could not find the next private method after it.`);
  }

  let nextText = text.slice(0, start) + text.slice(nextPrivate + 1);
  nextText = nextText.replace(/\n{4,}/g, '\n\n\n');
  return { text: nextText, removed: true };
}

function replaceOrInsertDevFillLinesHandler(text) {
  const handler = [
    'this.onMessage("devFillLines", (client, message: { color?: PlayerColor } = {}) => {',
    '      // TEMP LOCAL DEMO TOOL:',
    '      // Fills currently visible empty grid cells with normal player line cells.',
    '      // This is for quickly demoing mine blast effects against lots of player-made lines.',
    '      const allowLineFill =',
    '        this.isDevMode ||',
    '        process.env.NODE_ENV !== "production" ||',
    '        process.env.MINE_TEST_TOOLS === "true";',
    '',
    '      if (!allowLineFill || !this.state.gameStarted) {',
    '        console.log(',
    '          "[Demo Lines] ignored. allowed=" + allowLineFill +',
    '          ", started=" + this.state.gameStarted',
    '        );',
    '        return;',
    '      }',
    '',
    '      const player = this.state.players.get(client.sessionId);',
    '      const requestedColor = message?.color;',
    '      const color: PlayerColor =',
    '        requestedColor === "RED" || requestedColor === "GREEN" || requestedColor === "BLUE"',
    '          ? requestedColor',
    '          : player?.color || "RED";',
    '',
    '      this.fillVisibleEmptyGridWithDemoLines(color);',
    '    });',
  ].join('\n');

  const existing = findOnMessageBlock(text, 'devFillLines');
  if (existing) {
    return text.slice(0, existing.start) + handler + text.slice(existing.end);
  }

  const devStageUp = findOnMessageBlock(text, 'devStageUp');
  if (!devStageUp) {
    throw new Error('Could not find devStageUp handler to insert devFillLines after.');
  }

  return text.slice(0, devStageUp.end) + '\n\n    ' + handler + text.slice(devStageUp.end);
}

function replaceOrInsertFillLinesHelper(text) {
  const helper = [
    '  private fillVisibleEmptyGridWithDemoLines(color: PlayerColor = "RED") {',
    '    const center = Math.floor(this.MAX_GRID_SIZE / 2);',
    '    const halfWidth = Math.floor(this.state.gridWidth / 2);',
    '    const halfHeight = Math.floor(this.state.gridHeight / 2);',
    '    const minX = center - halfWidth;',
    '    const maxX = center + halfWidth - 1;',
    '    const minY = center - halfHeight;',
    '    const maxY = center + halfHeight - 1;',
    '',
    '    const existingMineCells = new Set<string>();',
    '    for (const mine of this.state.mines) {',
    '      existingMineCells.add(String(mine.x) + "," + String(mine.y));',
    '    }',
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
    '    let placed = 0;',
    '    let skippedExistingLines = 0;',
    '    let skippedOccupied = 0;',
    '    let skippedMines = 0;',
    '',
    '    for (let y = minY; y <= maxY; y++) {',
    '      for (let x = minX; x <= maxX; x++) {',
    '        const key = String(x) + "," + String(y);',
    '',
    '        if (this.state.gridColors.has(key)) {',
    '          skippedExistingLines++;',
    '          continue;',
    '        }',
    '',
    '        if (existingMineCells.has(key)) {',
    '          skippedMines++;',
    '          continue;',
    '        }',
    '',
    '        if (isActorOnCell(x, y)) {',
    '          skippedOccupied++;',
    '          continue;',
    '        }',
    '',
    '        const cell = new GridCell();',
    '        cell.color = color;',
    '        this.state.gridColors.set(key, cell);',
    '        placed++;',
    '      }',
    '    }',
    '',
    '    this.calculateScores();',
    '',
    '    console.log(',
    '      "[Demo Lines] filled visible board with " + placed + " " + color + " line cells. " +',
    '      "Skipped existing lines=" + skippedExistingLines +',
    '      ", occupied=" + skippedOccupied +',
    '      ", mines=" + skippedMines +',
    '      ", totalScore=" + this.state.totalScore',
    '    );',
    '',
    '    this.broadcast("devFillLinesComplete", {',
    '      placed,',
    '      color,',
    '      skippedExistingLines,',
    '      skippedOccupied,',
    '      skippedMines,',
    '      totalScore: this.state.totalScore,',
    '    });',
    '  }',
  ].join('\n');

  const existing = text.indexOf('  private fillVisibleEmptyGridWithDemoLines');
  if (existing !== -1) {
    const nextPrivate = text.indexOf('\n  private ', existing + 5);
    if (nextPrivate === -1) throw new Error('Could not find end of existing fillVisibleEmptyGridWithDemoLines helper.');
    return text.slice(0, existing) + helper + '\n\n' + text.slice(nextPrivate + 1);
  }

  const insertionPoint = text.indexOf('  private calculateScores()');
  if (insertionPoint === -1) {
    throw new Error('Could not find private calculateScores() insertion point.');
  }

  return text.slice(0, insertionPoint) + helper + '\n\n' + text.slice(insertionPoint);
}

function updateGameRoom() {
  const source = read('server/rooms/GameRoom.ts');
  let text = source.text;
  const notes = [];

  const removeFillMines = removeOnMessageBlock(text, 'devFillMines');
  text = removeFillMines.text;
  if (removeFillMines.removed) notes.push('removed devFillMines server handler');

  const removeMineHelper = removePrivateMethod(text, 'fillVisibleEmptyGridWithDemoMines');
  text = removeMineHelper.text;
  if (removeMineHelper.removed) notes.push('removed fillVisibleEmptyGridWithDemoMines helper');

  text = replaceOrInsertDevFillLinesHandler(text);
  notes.push('added/replaced devFillLines server handler');

  text = replaceOrInsertFillLinesHelper(text);
  notes.push('added/replaced fillVisibleEmptyGridWithDemoLines helper');

  write(source, text);
  for (const note of notes) console.log('  - ' + note);
}

function updateDevStageControls() {
  const source = read('client/src/components/game/DevStageControls.tsx');

  const replacement = [
    'import { useEffect, useState, useCallback } from "react";',
    'import type * as Client from "colyseus.js";',
    '',
    '/**',
    ' * DevStageControls — temporary local/dev helpers.',
    ' *',
    ' * F8: real server stage skip.',
    ' * F7: fill visible empty cells with normal player line cells.',
    ' * Backquote and F9 are intentionally ignored.',
    ' */',
    '',
    'interface DevStageControlsProps {',
    '  room: Client.Room | null;',
    '  isDevMode: boolean;',
    '  stage: number;',
    '  /** Kept for backwards compatibility with existing GameScreen props; intentionally unused now. */',
    '  onFakeStageChange?: (stage: number) => void;',
    '}',
    '',
    'export function DevStageControls({ room, isDevMode, stage }: DevStageControlsProps) {',
    '  const isLocalhost = typeof window !== "undefined" && (',
    '    window.location.hostname === "localhost" ||',
    '    window.location.hostname === "127.0.0.1"',
    '  );',
    '',
    '  const enabled = isDevMode || isLocalhost;',
    '  const [expanded, setExpanded] = useState(false);',
    '',
    '  const advanceStage = useCallback(() => {',
    '    console.log("[DevStageControls] real stage skip requested", {',
    '      hasRoom: Boolean(room),',
    '      roomId: (room as any)?.roomId ?? (room as any)?.id,',
    '      isDevMode,',
    '      isLocalhost,',
    '      stage,',
    '    });',
    '',
    '    if (stage >= 8) return;',
    '',
    '    if (!room) {',
    '      console.warn("[DevStageControls] No active room yet. Start the game first.");',
    '      return;',
    '    }',
    '',
    '    room.send("devStageUp", {});',
    '  }, [room, isDevMode, isLocalhost, stage]);',
    '',
    '  const fillEmptyLines = useCallback(() => {',
    '    console.log("[DevStageControls] fill empty lines requested", {',
    '      hasRoom: Boolean(room),',
    '      roomId: (room as any)?.roomId ?? (room as any)?.id,',
    '    });',
    '',
    '    if (!room) {',
    '      console.warn("[DevStageControls] No active room yet. Start the game first.");',
    '      return;',
    '    }',
    '',
    '    room.send("devFillLines", {});',
    '  }, [room]);',
    '',
    '  const onKeyDown = useCallback((event: KeyboardEvent) => {',
    '    const element = event.target as HTMLElement | null;',
    '    const tag = element?.tagName?.toLowerCase();',
    '    if (event.repeat || tag === "input" || tag === "textarea" || element?.isContentEditable) return;',
    '',
    '    if (event.key === "F8") {',
    '      event.preventDefault();',
    '      event.stopPropagation();',
    '      advanceStage();',
    '    }',
    '',
    '    if (event.key === "F7") {',
    '      event.preventDefault();',
    '      event.stopPropagation();',
    '      fillEmptyLines();',
    '    }',
    '  }, [advanceStage, fillEmptyLines]);',
    '',
    '  useEffect(() => {',
    '    if (!enabled) return;',
    '',
    '    (window as any).__polarStageSkip = advanceStage;',
    '    (window as any).__polarFillEmptyLines = fillEmptyLines;',
    '    window.addEventListener("keydown", onKeyDown, true);',
    '',
    '    return () => {',
    '      window.removeEventListener("keydown", onKeyDown, true);',
    '      delete (window as any).__polarStageSkip;',
    '      delete (window as any).__polarFillEmptyLines;',
    '    };',
    '  }, [enabled, advanceStage, fillEmptyLines, onKeyDown]);',
    '',
    '  if (!enabled) return null;',
    '',
    '  // In localhost-only mode, keep the screen clean. Use F8/F7 or the browser console helpers.',
    '  if (!isDevMode) return null;',
    '',
    '  if (!expanded) {',
    '    return (',
    '      <button',
    '        type="button"',
    '        onClick={() => setExpanded(true)}',
    '        className="fixed bottom-3 left-3 z-[100] rounded border border-yellow-500/30 bg-black/70 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-yellow-400/80 backdrop-blur-sm transition-opacity hover:opacity-100 opacity-50"',
    '        title="Open dev controls"',
    '      >',
    '        DEV',
    '      </button>',
    '    );',
    '  }',
    '',
    '  return (',
    '    <div',
    '      className="fixed bottom-3 left-3 z-[100] flex flex-col gap-2 rounded-lg border border-white/10 bg-black/85 p-3 backdrop-blur-sm"',
    '      data-ui="dev-stage-controls"',
    '    >',
    '      <div className="flex items-center justify-between gap-4">',
    '        <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-400/80">',
    '          Dev Controls',
    '        </p>',
    '        <button',
    '          type="button"',
    '          onClick={() => setExpanded(false)}',
    '          className="text-[10px] text-white/40 hover:text-white/70"',
    '        >',
    '          ✕',
    '        </button>',
    '      </div>',
    '      <div className="flex items-center gap-2">',
    '        <span className="text-xs text-white/60">Stage {stage}/8</span>',
    '        <button',
    '          type="button"',
    '          onClick={advanceStage}',
    '          disabled={stage >= 8}',
    '          className="rounded border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"',
    '        >',
    '          Real Next Stage →',
    '        </button>',
    '      </div>',
    '      <button',
    '        type="button"',
    '        onClick={fillEmptyLines}',
    '        disabled={!room}',
    '        className="rounded border border-sky-400/30 bg-sky-950/35 px-2.5 py-1 text-xs font-medium text-sky-100 transition-colors hover:bg-sky-900/50 disabled:opacity-30 disabled:cursor-not-allowed"',
    '        title="Fill currently visible empty cells with your player line color. Existing paths, actors, and mines are skipped."',
    '      >',
    '        Fill Empty Lines',
    '      </button>',
    '      <p className="text-[9px] text-white/30">F8 skips stage. F7 fills empty line cells. Backquote/F9 ignored.</p>',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');

  write(source, replacement);
  console.log('  - replaced DevStageControls with F8 stage skip + F7/Fill Empty Lines');
  console.log('  - removed the old Fill Empty Mines button/menu code');
}

updateGameRoom();
updateDevStageControls();

console.log('\nRemoved demo mine-fill tool and added demo line-fill tool.');
console.log('Next: Ctrl+C, npm run dev, then Ctrl+Shift+R in the browser.');
console.log('Use Dev Controls -> Fill Empty Lines, F7, or browser console: window.__polarFillEmptyLines()');
