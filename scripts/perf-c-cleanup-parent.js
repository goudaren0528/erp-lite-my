const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
let lines = content.split('\n');

// Remove from parent (InventoryCalendarClient):
// Lines 348-350: const [currentPage...], const [inventoryItemPage...], const pageSize = 10
// Lines 356-359: totalPages, currentSheetOrders, dayTypeLabel, dayEmptyLabel
// Also remove setCurrentPage(1) and setInventoryItemPage(1) from handleDayClick

// Find and remove parent state lines (search by content in the parent function, not the child)
// The parent function starts around line 329 (after the child component)
// Child component has its own useState at ~740

const parentFnStart = lines.findIndex(l => l.includes('export function InventoryCalendarClient'));
console.log('Parent fn at line', parentFnStart + 1);

// Remove lines in parent that are now in child
// We'll mark lines to remove by index
const toRemove = new Set();

for (let i = parentFnStart; i < Math.min(parentFnStart + 50, lines.length); i++) {
    const l = lines[i].trim();
    if (l === 'const [currentPage, setCurrentPage] = useState(1)' ||
        l === 'const [inventoryItemPage, setInventoryItemPage] = useState(1)' ||
        l === 'const pageSize = 10') {
        toRemove.add(i);
        console.log('Remove line', i+1, ':', lines[i].trim());
    }
}

// Find totalPages, currentSheetOrders, dayTypeLabel, dayEmptyLabel in parent
// These are computed vars right before the return statement or in the render area
// They appear around line 1283-1286 in the parent
for (let i = parentFnStart + 900; i < parentFnStart + 1100; i++) {
    if (i >= lines.length) break;
    const l = lines[i].trim();
    if (l.startsWith('const totalPages = Math.ceil(selectedDayOrders') ||
        l.startsWith('const currentSheetOrders = selectedDayOrders') ||
        l.startsWith('const dayTypeLabel = ') ||
        l.startsWith('const dayEmptyLabel = ')) {
        toRemove.add(i);
        console.log('Remove line', i+1, ':', lines[i].trim().substring(0, 60));
    }
}

// Remove setCurrentPage(1) and setInventoryItemPage(1) from handleDayClick in parent
for (let i = parentFnStart; i < lines.length; i++) {
    const l = lines[i].trim();
    if ((l === 'setCurrentPage(1) // Reset pagination' || l.startsWith('setCurrentPage(1)') || l === 'setInventoryItemPage(1)') &&
        i < parentFnStart + 700) {
        toRemove.add(i);
        console.log('Remove handleDayClick reset line', i+1, ':', lines[i].trim());
    }
}

console.log('Total lines to remove:', toRemove.size);

// Filter out removed lines
const newLines = lines.filter((_, i) => !toRemove.has(i));
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', newLines.join('\n'), 'utf8');
console.log('done, lines:', newLines.length);
