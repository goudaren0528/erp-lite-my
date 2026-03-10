const fs = require('fs');
let c = fs.readFileSync('web/src/lib/online-orders/zanchen.ts', 'utf8');

// Add retry log in buildTemplateSelectors
const old1 = 'if (end > 0) break\n        await page.waitForTimeout(1000)';
const new1 = 'if (end > 0) break\n        addLog(`[System] buildTemplateSelectors: container "${container}" has 0 children, retry ${i+1}/10...`)\n        await page.waitForTimeout(1000)';
if (c.includes(old1)) {
  c = c.replace(old1, new1);
  console.log('Applied buildTemplateSelectors log');
} else {
  console.log('Pattern 1 not found');
  // Find the area
  const idx = c.indexOf('buildTemplateSelectors');
  console.log(JSON.stringify(c.slice(idx, idx+800)));
}

fs.writeFileSync('web/src/lib/online-orders/zanchen.ts', c, 'utf8');
console.log('Done');
