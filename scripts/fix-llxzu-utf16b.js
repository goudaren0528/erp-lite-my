const fs = require('fs');

const buf = fs.readFileSync('web/src/lib/online-orders/llxzu.ts');
console.log('Buffer length:', buf.length);
console.log('First 8 bytes hex:', buf.slice(0, 8).toString('hex'));

// The file has 2 garbage bytes then UTF-16 LE content
// Skip the first 2 bytes (damaged BOM ef bf) and decode rest as UTF-16 LE
// Actually: ef bf bd ef bf bd = 6 bytes of garbage, then UTF-16 LE
// Let's find where the actual UTF-16 content starts
// UTF-16 LE BOM is FF FE
let startOffset = 0;
for (let i = 0; i < Math.min(20, buf.length - 1); i++) {
  if (buf[i] === 0xFF && buf[i+1] === 0xFE) {
    startOffset = i + 2; // skip BOM
    console.log('Found UTF-16 LE BOM at offset', i);
    break;
  }
  // Or look for 'i\0m\0p\0' pattern (UTF-16 LE for "imp")
  if (buf[i] === 0x69 && buf[i+1] === 0x00 && buf[i+2] === 0x6D && buf[i+3] === 0x00) {
    startOffset = i;
    console.log('Found UTF-16 LE content start at offset', i);
    break;
  }
}

console.log('Using startOffset:', startOffset);
const content16 = buf.slice(startOffset);
const decoded = content16.toString('utf16le');
console.log('Decoded length:', decoded.length);
console.log('First 80 chars:', decoded.slice(0, 80));

// Verify we can find key content
const markerIdx = decoded.indexOf('Sync completed successfully');
console.log('Marker idx:', markerIdx);

if (markerIdx === -1) {
  console.log('Still not found. Trying different offsets...');
  for (let off = 0; off <= 10; off++) {
    const test = buf.slice(off).toString('utf16le');
    const ti = test.indexOf('import path');
    if (ti !== -1 && ti < 10) {
      console.log('Found at offset', off, ':', test.slice(0, 50));
      break;
    }
  }
  process.exit(1);
}

// Find savingMarker
const savingMarker = '    if (pendingSaveOrders.length > 0) {';
const savingIdx = decoded.lastIndexOf(savingMarker, markerIdx);
console.log('savingMarker at:', savingIdx);

const beforeSaving = decoded.slice(0, savingIdx);
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

// Write as clean UTF-8
fs.writeFileSync('web/src/lib/online-orders/llxzu.ts', newContent, 'utf8');
const lines = newContent.split('\n');
console.log('Written as UTF-8. Total lines:', lines.length);
console.log('Last 15 lines:');
for (let i = Math.max(0, lines.length-15); i < lines.length; i++) {
  console.log((i+1)+': '+lines[i]);
}
