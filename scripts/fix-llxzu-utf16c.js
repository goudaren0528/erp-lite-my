const fs = require('fs');

const buf = fs.readFileSync('web/src/lib/online-orders/llxzu.ts');
// Skip first 6 garbage bytes, decode as UTF-16 LE
const content16 = buf.slice(6);
const decoded = content16.toString('utf16le');

// Verify
console.log('First 80:', decoded.slice(0, 80));
console.log('Length:', decoded.length);

// Search for key strings
const tests = ['Sync completed', 'pendingSaveOrders', 'startLlxzuSync', 'stopLlxzuSync'];
tests.forEach(t => console.log(`"${t}" at:`, decoded.indexOf(t)));

// Show last 500 chars
console.log('Last 500:', decoded.slice(-500));
