const fs = require('fs');
let content = fs.readFileSync('web/src/lib/online-orders/llxzu.ts', 'utf8');

// Fix 1: Remove duplicate restartLlxzuBrowser
// Keep only the first occurrence
const restartFn = `export async function restartLlxzuBrowser() {
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
}`;

const firstIdx = content.indexOf(restartFn);
const secondIdx = content.indexOf(restartFn, firstIdx + 1);
console.log('First restartLlxzuBrowser at:', firstIdx);
console.log('Second restartLlxzuBrowser at:', secondIdx);

if (secondIdx !== -1) {
  content = content.slice(0, secondIdx) + content.slice(secondIdx + restartFn.length);
  console.log('Removed duplicate restartLlxzuBrowser');
}

// Fix 2: Remove duplicate end-of-function block
// The pattern is: the function ends properly, then there's a stray duplicate
const endBlock = `  } finally {
      // Do not close page to allow reuse
  }
}`;

const firstEnd = content.indexOf(endBlock);
const secondEnd = content.indexOf(endBlock, firstEnd + 1);
console.log('First end block at:', firstEnd);
console.log('Second end block at:', secondEnd);

if (secondEnd !== -1) {
  // Find what comes after the second end block and remove the duplicate content between them
  // The duplicate starts with some code that was incorrectly inserted
  // We need to find the stray code between firstEnd+endBlock.length and secondEnd
  const between = content.slice(firstEnd + endBlock.length, secondEnd + endBlock.length);
  console.log('Content between duplicates:', JSON.stringify(between.slice(0, 200)));
  
  // Remove everything from firstEnd+endBlock.length to secondEnd+endBlock.length
  content = content.slice(0, firstEnd + endBlock.length) + '\n' + content.slice(secondEnd + endBlock.length);
  console.log('Removed duplicate end block');
}

fs.writeFileSync('web/src/lib/online-orders/llxzu.ts', content, 'utf8');
console.log('Done!');
