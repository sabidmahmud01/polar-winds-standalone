const fs = require('fs');
const path = require('path');

const root = process.cwd();
const BACKUP_SUFFIX = 'bak-hard-remove-stage-skip-junk';

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  return { file, text, newline, relativePath };
}

function write(source, text) {
  if (source.text === text) return false;
  const backup = source.file + '.' + BACKUP_SUFFIX;
  if (!fs.existsSync(backup)) fs.copyFileSync(source.file, backup);
  if (source.newline === '\r\n') text = text.replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(source.file, text, 'utf8');
  return true;
}

function findOnMessageBlock(text, messageName) {
  const needle = 'this.onMessage("' + messageName + '"';
  const start = text.indexOf(needle);
  if (start === -1) return null;
  const endMarker = '\n    });';
  const end = text.indexOf(endMarker, start);
  if (end === -1) throw new Error('Found ' + messageName + ', but could not find end marker.');
  return { start, end: end + endMarker.length, block: text.slice(start, end + endMarker.length) };
}

function removeOnMessageBlock(text, messageName) {
  const found = findOnMessageBlock(text, messageName);
  if (!found) return { text, removed: false };

  let removeStart = found.start;
  const before = text.slice(0, found.start);
  const lastLineStart = before.lastIndexOf('\n', before.length - 2);
  const prevLine = before.slice(lastLineStart + 1).trim();
  if (prevLine.startsWith('//') && /TEMP|TEST|skip|stage/i.test(prevLine)) {
    removeStart = lastLineStart + 1;
  }

  let next = text.slice(0, removeStart) + text.slice(found.end);
  next = next.replace(/\n{4,}/g, '\n\n\n');
  return { text: next, removed: true };
}

function replaceDevStageUp(text) {
  const found = findOnMessageBlock(text, 'devStageUp');
  if (!found) return { text, replaced: false };

  const normalBlock = [
    'this.onMessage("devStageUp", (client) => {',
    '      if (!this.isDevMode || !this.state.gameStarted) return;',
    '      const nextStage = this.state.stage + 1;',
    '      if (nextStage <= 8) {',
    '        console.log(`[Dev Mode] Manual stage up from ${this.state.stage} to ${nextStage}. Score: ${this.state.totalScore}`);',
    '        this.advanceToStage(nextStage);',
    '      }',
    '    });'
  ].join('\n');

  if (found.block === normalBlock) return { text, replaced: false };
  return {
    text: text.slice(0, found.start) + normalBlock + text.slice(found.end),
    replaced: true,
  };
}

function cleanupServer() {
  const source = read('server/rooms/GameRoom.ts');
  if (!source) return;

  let text = source.text;
  const notes = [];

  const removedMine = removeOnMessageBlock(text, 'mineTestSkipRound');
  text = removedMine.text;
  if (removedMine.removed) notes.push('removed mineTestSkipRound handler');

  const dev = replaceDevStageUp(text);
  text = dev.text;
  if (dev.replaced) notes.push('restored normal devStageUp handler');

  if (write(source, text)) {
    console.log('Updated: ' + source.relativePath);
    notes.forEach(note => console.log('  - ' + note));
  } else {
    console.log('No changes needed: ' + source.relativePath);
  }
}

function findUseEffectStart(text, markerIndex) {
  const effectStart = text.lastIndexOf('useEffect(() => {', markerIndex);
  if (effectStart === -1) return -1;

  const commentStart = Math.max(
    text.lastIndexOf('// POLAR STAGE SKIP TEST TOOL', effectStart),
    text.lastIndexOf('// TEMP MINE TEST CONSOLE', effectStart),
    text.lastIndexOf('// Temporary local-only test shortcut', effectStart)
  );

  // If a known comment is directly above this effect, remove it too.
  if (commentStart !== -1 && effectStart - commentStart < 250) return commentStart;
  return effectStart;
}

function removeBadUseEffectBlocks(text) {
  const badMarkers = [
    'polar-mine-test-console-index',
    'polar-mine-test-console',
    '__polarMineTestSkipRound',
    '__polarStageSkip',
    'POLAR STAGE SKIP TEST TOOL',
    'Skip Round requested from Index',
    'F9/sendStageSkip',
    'mineTestSkipRound',
    'devStageUpComplete',
    'mineTestSkippedRound'
  ];

  let removed = 0;
  let changed = true;

  while (changed) {
    changed = false;
    let bestIndex = -1;

    for (const marker of badMarkers) {
      const idx = text.indexOf(marker);
      if (idx !== -1 && (bestIndex === -1 || idx < bestIndex)) bestIndex = idx;
    }

    if (bestIndex === -1) break;

    const start = findUseEffectStart(text, bestIndex);
    if (start === -1) break;

    const searchFrom = bestIndex;
    const endPatterns = [
      '\n  }, [gameRoom]);',
      '\r\n  }, [gameRoom]);',
      '\n  }, [room]);',
      '\r\n  }, [room]);',
      '\n  }, []);',
      '\r\n  }, []);'
    ];

    let end = -1;
    let endLen = 0;
    for (const pattern of endPatterns) {
      const idx = text.indexOf(pattern, searchFrom);
      if (idx !== -1 && (end === -1 || idx < end)) {
        end = idx;
        endLen = pattern.length;
      }
    }

    if (end === -1) break;

    text = text.slice(0, start) + text.slice(end + endLen);
    text = text.replace(/\n{4,}/g, '\n\n\n');
    removed++;
    changed = true;
  }

  return { text, removed };
}

function removeLineContaining(text, markers) {
  const lines = text.split(/\r?\n/);
  const kept = [];
  let removed = 0;
  for (const line of lines) {
    if (markers.some(marker => line.includes(marker))) {
      removed++;
      continue;
    }
    kept.push(line);
  }
  return { text: kept.join('\n'), removed };
}

function cleanupClientFile(relativePath) {
  const source = read(relativePath);
  if (!source) return;

  let text = source.text;
  const notes = [];

  const effects = removeBadUseEffectBlocks(text);
  text = effects.text;
  if (effects.removed) notes.push('removed ' + effects.removed + ' temporary skip/test useEffect block(s)');

  const leftover = removeLineContaining(text, [
    '__polarMineTestSkipRound',
    '__polarStageSkip',
    'polar-mine-test-console',
    'mineTestSkipRound',
    'mineTestSkippedRound',
    'devStageUpComplete',
    'F9/sendStageSkip',
    'Skip Round requested from Index',
    'POLAR STAGE SKIP TEST TOOL'
  ]);
  text = leftover.text;
  if (leftover.removed) notes.push('removed ' + leftover.removed + ' leftover temp line(s)');

  if (write(source, text)) {
    console.log('Updated: ' + source.relativePath);
    notes.forEach(note => console.log('  - ' + note));
  } else {
    console.log('No changes needed: ' + source.relativePath);
  }
}

function deleteOldPatchScripts() {
  const keep = path.basename(__filename).toLowerCase();
  const entries = fs.readdirSync(root);
  let deleted = 0;
  for (const entry of entries) {
    const lower = entry.toLowerCase();
    if (!lower.startsWith('apply-') || !lower.endsWith('.cjs')) continue;
    if (lower === keep) continue;
    fs.unlinkSync(path.join(root, entry));
    deleted++;
    console.log('Deleted old patch script: ' + entry);
  }
  if (!deleted) console.log('No old apply-*.cjs scripts found to delete.');
}

cleanupServer();
cleanupClientFile('client/src/pages/Index.tsx');
cleanupClientFile('client/src/screens/GameScreen.tsx');
deleteOldPatchScripts();

console.log('\nHard cleanup complete.');
console.log('Backups created with suffix .' + BACKUP_SUFFIX + ' when files changed.');
console.log('Now run these checks:');
console.log('  findstr /n /c:"mineTestSkipRound" /c:"devStageUpComplete" server\\rooms\\GameRoom.ts');
console.log('  findstr /n /c:"polar-mine-test-console" /c:"__polarStageSkip" /c:"__polarMineTestSkipRound" /c:"POLAR STAGE SKIP TEST TOOL" client\\src\\pages\\Index.tsx client\\src\\screens\\GameScreen.tsx');
