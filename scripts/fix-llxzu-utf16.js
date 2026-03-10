const fs = require('fs');

// File is UTF-16 LE, read with correct encoding
const buf = fs.readFileSync('web/src/lib/online-orders/llxzu.ts');
// Check BOM
console.log('First 4 bytes:', buf[0].toString(16), buf[1].toString(16), buf[2].toString(16), buf[3].toString(16));

// Decode as UTF-16 LE
let c = buf.toString('utf16le');
// Remove BOM if present
if (c.charCodeAt(0) === 0xFEFF) c = c.slice(1);

console.log('Decoded length:', c.length);
console.log('First 100 chars:', c.slice(0, 100));

// Now find the marker
const marker = 'appendLog("Sync completed successfully.")';
const idx = c.indexOf(marker);
console.log('Marker found at:', idx);

if (idx === -1) {
  // Try alternate
  const idx2 = c.indexOf('Sync completed successfully');
  console.log('Alt marker at:', idx2);
  process.exit(1);
}

// Find savingMarker before the success block
const savingMarker = '    if (pendingSaveOrders.length > 0) {';
const savingIdx = c.lastIndexOf(savingMarker, idx);
console.log('savingMarker at:', savingIdx);

const beforeSaving = c.slice(0, savingIdx);
const newContent = beforeSaving + `    if (pendingSaveOrders.length > 0) {
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
    appendLog("Sync completed successfully.")

  } catch (e) {
    const msg = String(e)
    updateStatus({ 
        status: "error", 
        message: \`Error: \${msg}\`,
        logs: [...(runtime.status.logs || []), \`[Error] \${msg}\`]
    })
    appendLog(\`Sync failed: \${msg}\`)
  } finally {
      // Do not close page to allow reuse
  }
}

export function stopLlxzuSync() {
    runtime.shouldStop = true
    appendLog("User requested stop.")
    updateStatus({ status: "running", message: "正在停止..." })
}

export async function restartLlxzuBrowser() {
    appendLog("Browser restart requested.")
    runtime.shouldStop = true
    try {
        if (runtime.context) {
            await runtime.context.close().catch(() => void 0)
            runtime.context = undefined
            runtime.page = undefined
            appendLog("Browser context closed.")
        }
    } catch { void 0 }
    updateStatus({ status: "idle", message: "浏览器已重启，可重新开始同步" })
    return { success: true }
}
`;

// Write back as UTF-8 (no BOM) - Next.js/TypeScript works fine with UTF-8
fs.writeFileSync('web/src/lib/online-orders/llxzu.ts', newContent, 'utf8');
const lines = newContent.split('\n');
console.log('Done. Total lines:', lines.length);
console.log('Last 20 lines:');
for (let i = Math.max(0, lines.length-20); i < lines.length; i++) {
  console.log((i+1)+': '+lines[i]);
}
