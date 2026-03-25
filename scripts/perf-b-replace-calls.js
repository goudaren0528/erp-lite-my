const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
const lines = content.split('\n');

// Replace getOrderOccupancyRange(o) calls (not the definition line) with getOrderRange(o)
// Replace getOrderRentRange(o) calls (not the definition line) with getOrderRentRangeCached(o)
let replacedOccupancy = 0;
let replacedRent = 0;

for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // Skip definition lines
    if (l.includes('const getOrderOccupancyRange = useCallback') ||
        l.includes('const getOrderRentRange = useCallback') ||
        l.includes('const getOrderRange = ') ||
        l.includes('const getOrderRentRangeCached = ') ||
        l.includes('orderRangeMap.get(o.id)') ||
        l.includes('orderRentRangeMap.get(o.id)') ||
        l.includes('[orders, getOrderOccupancyRange]') ||
        l.includes('[orders, getOrderRentRange]')) {
        continue;
    }
    if (l.includes('getOrderOccupancyRange(o)')) {
        lines[i] = l.replaceAll('getOrderOccupancyRange(o)', 'getOrderRange(o)');
        replacedOccupancy++;
    }
    if (l.includes('getOrderRentRange(o)')) {
        lines[i] = l.replaceAll('getOrderRentRange(o)', 'getOrderRentRangeCached(o)');
        replacedRent++;
    }
}

console.log('Replaced occupancy calls:', replacedOccupancy);
console.log('Replaced rent calls:', replacedRent);

fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done');
