const fs = require('fs');
let c = fs.readFileSync('web/src/lib/online-orders/llxzu.ts', 'utf8');
const lines = c.split('\n');

// Find the first closing of startLlxzuSync (line 1725, index 1724)
// Everything after line 1725 is duplicate garbage - remove it
const firstClose = 1725; // 1-based line number of the first '}'
const goodContent = lines.slice(0, firstClose).join('\n') + '\n';

fs.writeFileSync('web/src/lib/online-orders/llxzu.ts', goodContent, 'utf8');
console.log('Fixed. New line count:', goodContent.split('\n').length);

// Verify
const verify = fs.readFileSync('web/src/lib/online-orders/llxzu.ts', 'utf8');
const vlines = verify.split('\n');
console.log('Last 10 lines:');
for (let i = Math.max(0, vlines.length-10); i < vlines.length; i++) {
  console.log((i+1) + ': ' + vlines[i]);
}
