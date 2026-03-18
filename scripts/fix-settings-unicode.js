const fs = require('fs');
let c = fs.readFileSync('sync-tool/src/pages/Settings.tsx', 'utf8');

// Replace literal \uXXXX escape sequences with actual Chinese characters
c = c.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

fs.writeFileSync('sync-tool/src/pages/Settings.tsx', c, 'utf8');
console.log('done');
