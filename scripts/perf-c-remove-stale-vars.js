const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
let lines = content.split('\n');

// Find the parent function
const parentFnStart = lines.findIndex(l => l.includes('export function InventoryCalendarClient'));

// Find and remove the stale pagination block in parent (after openOrder function)
// Lines 1277-1281 (0-indexed 1276-1280): "// Pagination logic" + 4 const lines
const toRemove = new Set();
for (let i = parentFnStart + 500; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l === '// Pagination logic' ||
        l.startsWith('const totalPages = Math.ceil(selectedDayOrders') ||
        l.startsWith('const currentSheetOrders = selectedDayOrders') ||
        l.startsWith('const dayTypeLabel = ') ||
        l.startsWith('const dayEmptyLabel = ')) {
        toRemove.add(i);
        console.log('Remove line', i+1, ':', l.substring(0, 60));
    }
}

console.log('Removing', toRemove.size, 'lines');
const newLines = lines.filter((_, i) => !toRemove.has(i));
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', newLines.join('\n'), 'utf8');
console.log('done, lines:', newLines.length);
