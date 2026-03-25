const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
let lines = content.split('\n');

// Find DayDetailSheet component start
const compStart = lines.findIndex(l => l.includes('function DayDetailSheet('));
// Find its return statement
const returnIdx = lines.findIndex((l, i) => i > compStart && l.trim() === 'return (');
console.log('DayDetailSheet at', compStart+1, 'return at', returnIdx+1);

// Fix: replace sheetOpen/setSheetOpen with open/onOpenChange in the component body
let fixed = 0;
for (let i = compStart; i < lines.length; i++) {
    // Stop at the next top-level function
    if (i > compStart + 5 && (lines[i].startsWith('export function') || lines[i].startsWith('function InventoryCalendarClient'))) break;
    
    if (lines[i].includes('sheetOpen') || lines[i].includes('setSheetOpen')) {
        lines[i] = lines[i]
            .replace(/sheetOpen/g, 'open')
            .replace(/setSheetOpen/g, 'onOpenChange');
        fixed++;
        console.log('Fixed line', i+1);
    }
    // Fix selectedDayType references that use the old variable names
    // selectedDayType is passed as prop - already correct
}

console.log('Fixed', fixed, 'lines');
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done');
