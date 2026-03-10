const fs = require('fs');
let c = fs.readFileSync('web/src/lib/online-orders/llxzu.ts', 'utf8');

console.log('Lines:', c.split('\n').length);

// Verify key markers exist
const markers = ['stopLlxzuSync', 'Sync completed successfully', 'pendingSaveOrders'];
markers.forEach(m => console.log(`"${m}" at:`, c.indexOf(m)));

// ── Fix 1: stopLlxzuSync → "running" ─────────────────────────────────────
const stopOld = 'updateStatus({ status: "idle", message: "Stopping..." })';
const stopNew = 'updateStatus({ status: "running", message: "正在停止..." })';
if (c.includes(stopOld)) {
  c = c.replace(stopOld, stopNew);
  console.log('Fix 1 applied');
} else {
  console.log('Fix 1 pattern not found, searching...');
  const idx = c.indexOf('stopLlxzuSync');
  if (idx !== -1) console.log('stopLlxzuSync context:', c.slice(idx, idx+200));
}

// ── Fix 2: shouldStop check before success ────────────────────────────────
// Find the exact pattern in the file
const successMarker = 'Sync completed successfully';
const successIdx = c.indexOf(successMarker);
if (successIdx === -1) { console.log('successMarker not found'); process.exit(1); }

// Find "Saving remaining" block just before success
const savingMarker = '    if (pendingSaveOrders.length > 0) {';
const savingIdx = c.lastIndexOf(savingMarker, successIdx);
if (savingIdx === -1) { console.log('savingMarker not found'); process.exit(1); }

// Find end of the saving block (the closing }) 
const savingEnd = c.indexOf('\n    }', savingIdx) + '\n    }'.length;
console.log('savingIdx:', savingIdx, 'savingEnd:', savingEnd);

// What comes between savingEnd and successIdx?
const between = c.slice(savingEnd, successIdx);
console.log('Between saving and success:', JSON.stringify(between));

// Insert shouldStop check after the saving block
const insertPoint = savingEnd;
const insertText = `

    if (runtime.shouldStop) {
        appendLog("Sync stopped by user.")
        updateStatus({ status: "idle", message: "已停止" })
        return
    }`;

c = c.slice(0, insertPoint) + insertText + c.slice(insertPoint);
console.log('Fix 2 applied');

// Write
fs.writeFileSync('web/src/lib/online-orders/llxzu.ts', c, 'utf8');
const lines = c.split('\n');
console.log('Done. Total lines:', lines.length);

// Verify
const stopCheck = c.indexOf('正在停止');
const shouldStopCheck = c.indexOf('Sync stopped by user');
console.log('"正在停止" at line:', c.slice(0, stopCheck).split('\n').length);
console.log('"Sync stopped by user" at line:', c.slice(0, shouldStopCheck).split('\n').length);
