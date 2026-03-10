const fs = require('fs');
let content = fs.readFileSync('web/src/lib/online-orders/llxzu.ts', 'utf8');

// Fix 1: stopLlxzuSync - change idle to running
content = content.replace(
  'updateStatus({ status: "idle", message: "Stopping..." })',
  'updateStatus({ status: "running", message: "正在停止..." })'
);

// Fix 2: Add shouldStop check before setStatus success
const oldEnd = `    if (pendingSaveOrders.length > 0) {
        appendLog(\`Saving remaining \${pendingSaveOrders.length} orders...\`)
        await saveOrdersBatch(pendingSaveOrders)
    }

    updateStatus({ 
        status: "success", 
        message: "Sync completed", 
    })
    appendLog("Sync completed successfully.")`;

const newEnd = `    if (pendingSaveOrders.length > 0) {
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

if (content.includes(oldEnd)) {
  content = content.replace(oldEnd, newEnd);
  console.log('Applied shouldStop check');
} else {
  console.log('Pattern not found for shouldStop check');
}

fs.writeFileSync('web/src/lib/online-orders/llxzu.ts', content, 'utf8');
console.log('Done!');
