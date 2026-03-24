const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
const lines = content.split('\n');

// Line 747: spec view fallback
lines[746] = lines[746].replace(
    'available = buildable !== null ? buildable : Math.max(0, totalStock - occupiedCount)',
    'available = buildable !== null ? buildable : (totalStock - occupiedCount)'
);

// Line 748: occupied = max(0, totalStock - available) — keep this as-is (occupied can't be negative)
// Line 750: item view
lines[749] = lines[749].replace(
    'available = Math.max(0, totalStock - occupiedCount)',
    'available = totalStock - occupiedCount'
);

// Line 1043: getDailyStatsMap post-process
lines[1042] = lines[1042].replace(
    'val.available = Math.max(0, totalStock - val.occupied)',
    'val.available = totalStock - val.occupied'
);

fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done');
console.log('747:', lines[746]);
console.log('750:', lines[749]);
console.log('1043:', lines[1042]);
