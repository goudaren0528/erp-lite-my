const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
const lines = content.split('\n');

// Fix line 1153 (0-indexed 1152): add rentCount: 0 to default
const idx = lines.findIndex(l => l.includes('statsMap.get(dateKey) || { occupied: 0'));
if (idx >= 0) {
    lines[idx] = lines[idx].replace(
        '{ occupied: 0, available: row.stock, inCount: 0, outCount: 0 }',
        '{ occupied: 0, available: row.stock, inCount: 0, outCount: 0, rentCount: 0 }'
    );
    console.log('Fixed line', idx+1);
}

fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done');
