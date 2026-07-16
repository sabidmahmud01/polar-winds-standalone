const fs = require('fs');
const path = require('path');

const root = process.cwd();
const BACKUP_SUFFIX = 'bak-real-dev-stage-controls';

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
  let after = text.slice(block.end);

  // Remove nearby temporary comment directly above the handler if present.
  before = before.replace(/\n\s*\/\/\s*(TEMP|Handle|Mine Test|Stage Skip)[^\n]*\n\s*$/i, '\n');

  let nextText = before + after;
  nextText = nextText.replace(/\n{4,}/g, '\n\n\n');
  return { text: nextText, removed: true };
}

function updateServer() {
  const source = read('server/rooms/GameRoom.ts');
  let text = source.text;

  // Kill the failed extra test handler if it exists.
  const mineTestRemoval = removeOnMessageBlock(text, 'mineTestSkipRound');
  text = mineTestRemoval.text;

  const replacement = [
    'this.onMessage("devStageUp", (_client) => {',
    '      // TEMP LOCAL TEST TOOL:',
    '      // Local/dev stage skip used by DevStageControls. It uses the real stage advancement path.',
    '      const allowStageSkip =',
    '        this.isDevMode ||',
    '        process.env.NODE_ENV !== "production" ||',
    '        process.env.MINE_TEST_TOOLS === "true";',
    '',
    '      if (!allowStageSkip || !this.state.gameStarted) {',
    '        console.log(',
    '          "[DevStageUp] ignored. allowed=" + allowStageSkip +',
    '          ", started=" + this.state.gameStarted',
    '        );',
    '        return;',
    '      }',
    '',
    '      const nextStage = this.state.stage + 1;',
    '      if (nextStage > 8) {',
    '        console.log("[DevStageUp] ignored. Already at/above stage cap. stage=" + this.state.stage);',
    '        return;',
    '      }',
    '',
    '      console.log(',
    '        "[DevStageUp] real stage skip " + this.state.stage + " -> " + nextStage +',
    '        ". Before board " + this.state.gridWidth + "x" + this.state.gridHeight +',
    '        ", score " + this.state.totalScore',
    '      );',
    '',
    '      this.advanceToStage(nextStage);',
    '      this.calculateScores();',
    '',
    '      const nextScoreGoal = this.stageThresholds[this.state.stage - 1] ?? null;',
    '',
    '      console.log(',
    '        "[DevStageUp] complete. stage=" + this.state.stage +',
    '        ", board=" + this.state.gridWidth + "x" + this.state.gridHeight +',
    '        ", goal=" + (nextScoreGoal ?? "none") +',
    '        ", collectibles=" + this.state.collectibles.length +',
    '        ", mines=" + (this.state.mines?.length ?? 0)',
    '      );',
    '',
    '      this.broadcast("devStageUpComplete", {',
    '        stage: this.state.stage,',
    '        gridWidth: this.state.gridWidth,',
    '        gridHeight: this.state.gridHeight,',
    '        nextScoreGoal,',
    '        collectibles: this.state.collectibles.length,',
    '        mines: this.state.mines?.length ?? 0,',
    '      });',
    '    });',
  ].join('\n');

  const devBlock = findOnMessageBlock(text, 'devStageUp');
  if (!devBlock) {
    throw new Error('Could not find this.onMessage("devStageUp") in server/rooms/GameRoom.ts.');
  }

  text = text.slice(0, devBlock.start) + replacement + text.slice(devBlock.end);

  write(source, text);
  if (mineTestRemoval.removed) console.log('  - removed old mineTestSkipRound handler');
  console.log('  - devStageUp now works in local/dev builds and calls advanceToStage()');
}

function updateDevStageControls() {
  const source = read('client/src/components/game/DevStageControls.tsx');

  const replacement = [
    'import { useEffect, useState, useCallback } from "react";',
    'import type * as Client from "colyseus.js";',
    '',
    '/**',
    ' * DevStageControls — temporary local/dev stage skip helper.',
    ' *',
    ' * Important behavior:',
    ' * - Backquote and F9 no longer open this menu.',
    ' * - F8 sends a real server devStageUp message while running on localhost/dev.',
    ' * - No fake client-only stage changes are used anymore.',
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
    '  const onKeyDown = useCallback((event: KeyboardEvent) => {',
    '    const element = event.target as HTMLElement | null;',
    '    const tag = element?.tagName?.toLowerCase();',
    '    if (event.repeat || tag === "input" || tag === "textarea" || element?.isContentEditable) return;',
    '',
    '    // Use F8 now. Backquote and F9 are intentionally ignored so the old menu does not pop.',
    '    if (event.key === "F8") {',
    '      event.preventDefault();',
    '      event.stopPropagation();',
    '      advanceStage();',
    '    }',
    '  }, [advanceStage]);',
    '',
    '  useEffect(() => {',
    '    if (!enabled) return;',
    '',
    '    (window as any).__polarStageSkip = advanceStage;',
    '    window.addEventListener("keydown", onKeyDown, true);',
    '',
    '    return () => {',
    '      window.removeEventListener("keydown", onKeyDown, true);',
    '      delete (window as any).__polarStageSkip;',
    '    };',
    '  }, [enabled, advanceStage, onKeyDown]);',
    '',
    '  if (!enabled) return null;',
    '',
    '  // In localhost-only mode, keep the screen clean. Use F8 or window.__polarStageSkip().',
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
    '      <p className="text-[9px] text-white/30">Real server skip. F8 also works on localhost.</p>',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');

  write(source, replacement);
  console.log('  - Backquote/F9 menu shortcut removed');
  console.log('  - F8 now sends real devStageUp to the server');
  console.log('  - fake client-only stage bump removed');
}

updateServer();
updateDevStageControls();

console.log('\nReal DevStageControls fix applied.');
console.log('Next:');
console.log('  1) Ctrl+C');
console.log('  2) npm run dev');
console.log('  3) Ctrl+Shift+R in the browser');
console.log('Test in-game with F8, or browser console: window.__polarStageSkip()');
console.log('Backups created with suffix: .' + BACKUP_SUFFIX);
