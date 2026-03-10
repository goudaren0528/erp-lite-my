const fs = require('fs');
const c = fs.readFileSync('web/src/lib/online-orders/llxzu.ts', 'utf8');
const lines = c.split('\n');
console.log('Total lines:', lines.length);

// Find stopLlxzuSync
const stopIdx = c.indexOf('stopLlxzuSync');
const stopLine = c.slice(0, stopIdx).split('\n').length;
console.log('stopLlxzuSync at line:', stopLine);
for (let i = stopLine-1; i <= stopLine+5; i++) console.log((i+1)+': '+lines[i]);

console.log('---');
// Find the success block
const successIdx = c.indexOf('Sync completed successfully');
const successLine = c.slice(0, successIdx).split('\n').length;
console.log('success at line:', successLine);
for (let i = successLine-8; i <= successLine+3; i++) console.log((i+1)+': '+lines[i]);

console.log('---');
// Find restartLlxzuBrowser occurrences
const r = [...c.matchAll(/export async function restartLlxzuBrowser/g)];
console.log('restartLlxzuBrowser count:', r.length);
r.forEach(m => {
  const line = c.slice(0, m.index).split('\n').length;
  console.log('  at line:', line);
});
