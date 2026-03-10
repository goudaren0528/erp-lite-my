const fs = require('fs');
let c = fs.readFileSync('web/src/lib/online-orders/llxzu.ts', 'utf8');

// Find the exact end-of-function pattern
const marker = 'appendLog("Sync completed successfully.")';
const idx = c.indexOf(marker);
if (idx === -1) {
  console.log('Marker not found!');
  // Show last 500 chars
  console.log(JSON.stringify(c.slice(-500)));
  process.exit(1);
}

const afterMarker = c.slice(idx + marker.length);
console.log('After marker:', JSON.stringify(afterMarker.slice(0, 200)));

// The rest should be: \n\n  } catch ... } finally ... }\n
// We want to replace everything from marker to end with the fixed version
const newEnd = `appendLog("Sync completed successfully.")

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

// Also add shouldStop check before the success block
// Find "Saving remaining" block before the marker
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
` + newEnd;

fs.writeFileSync('web/src/lib/online-orders/llxzu.ts', newContent, 'utf8');
const lines = newContent.split('\n');
console.log('Done. Total lines:', lines.length);
console.log('Last 30 lines:');
for (let i = Math.max(0, lines.length-30); i < lines.length; i++) {
  console.log((i+1)+': '+lines[i]);
}
