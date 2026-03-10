const fs = require('fs');

// Read the original clean file from git
let c = fs.readFileSync('web/src/lib/online-orders/llxzu.ts.orig', 'utf8');

// ── Fix 1: stopLlxzuSync → status: "running" not "idle" ──────────────────
// The original file has stopLlxzuSync with "idle". Find and fix it.
const stopOld = 'updateStatus({ status: "idle", message: "Stopping..." })';
const stopNew = 'updateStatus({ status: "running", message: "正在停止..." })';
if (c.includes(stopOld)) {
  c = c.replace(stopOld, stopNew);
  console.log('Fix 1: stopLlxzuSync status applied');
} else {
  // Maybe it doesn't exist yet - find the export function stopLlxzuSync block
  const stopBlock = c.indexOf('export function stopLlxzuSync');
  if (stopBlock !== -1) {
    console.log('Fix 1: stopLlxzuSync found at', stopBlock, '- checking content');
    const snippet = c.slice(stopBlock, stopBlock + 200);
    console.log(snippet);
  } else {
    console.log('Fix 1: stopLlxzuSync not found in original');
  }
}

// ── Fix 2: Add shouldStop check before setStatus success ─────────────────
const successOld = `    if (pendingSaveOrders.length > 0) {
        appendLog(\`Saving remaining \${pendingSaveOrders.length} orders...\`)
        await saveOrdersBatch(pendingSaveOrders)
    }

    updateStatus({ 
        status: "success", 
        message: "Sync completed", 
    })
    appendLog("Sync completed successfully.")`;

const successNew = `    if (pendingSaveOrders.length > 0) {
        appendLog(\`Saving remaining \${pendingSaveOrders.length} orders...\`)
        await saveOrdersBatch(pendingSaveOrders)
    }

    if (runtime.shouldStop) {
        appendLog("Sync stopped by user.")
        updateStatus({ status: "idle", message: "已停止" })
        return
    }

    updateStatus({ 
        status: "success", 
        message: "Sync completed", 
    })
    appendLog("Sync completed successfully.")`;

if (c.includes(successOld)) {
  c = c.replace(successOld, successNew);
  console.log('Fix 2: shouldStop check applied');
} else {
  console.log('Fix 2: pattern not found');
  // Show what the end looks like
  const idx = c.indexOf('Saving remaining');
  if (idx !== -1) console.log('Context:', JSON.stringify(c.slice(idx-10, idx+300)));
}

// Write the fixed file
fs.writeFileSync('web/src/lib/online-orders/llxzu.ts', c, 'utf8');
const lines = c.split('\n');
console.log('Done. Total lines:', lines.length);
console.log('Last 20 lines:');
for (let i = Math.max(0, lines.length-20); i < lines.length; i++) {
  console.log((i+1)+': '+lines[i]);
}
