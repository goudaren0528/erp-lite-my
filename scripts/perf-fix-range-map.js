const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
let lines = content.split('\n');

// Fix 1: orderRangeMap should call getOrderOccupancyRange directly, not getOrderRange
lines[1048] = '            map.set(o.id, getOrderOccupancyRange(o))';

// Fix 2: orderRentRangeMap should call getOrderRentRange directly, not getOrderRentRangeCached
lines[1056] = '            map.set(o.id, getOrderRentRange(o))';

// Fix 3: Move getOrderRange and getOrderRentRangeCached BEFORE the useMemo blocks
// Currently at lines 1062-1064, need to move before line 1044
// Remove them from current position
const helperComment = lines[1061]; // '    // Cached lookup helpers'
const helperLine1 = lines[1062];   // getOrderRange
const helperLine2 = lines[1063];   // getOrderRentRangeCached
const emptyAfter = lines[1064];    // ''

// Remove lines 1061-1064 (0-indexed)
lines.splice(1061, 4);

// Insert before orderRangeMap (now at 1044 after removal, but we removed 4 lines so it's still 1044)
// Actually after splice, line 1044 is still the comment line
const insertAt = lines.findIndex((l, i) => i >= 1040 && l.includes('// B: Pre-compute occupancy range'));
lines.splice(insertAt, 0,
    '    // Cached lookup helpers (defined before useMemo that uses them)',
    '    const getOrderRange = (o: OrderSimple) => orderRangeMap.get(o.id) ?? null',
    '    const getOrderRentRangeCached = (o: OrderSimple) => orderRentRangeMap.get(o.id) ?? null',
    ''
);

// Wait - getOrderRange references orderRangeMap which isn't defined yet either
// The real fix: just inline the map lookups everywhere, remove the helper wrappers entirely
// and use orderRangeMap.get(o.id) ?? null directly

// Actually simplest fix: remove the helper wrappers and replace all getOrderRange(o) calls
// with orderRangeMap.get(o.id) ?? null, and getOrderRentRangeCached(o) with orderRentRangeMap.get(o.id) ?? null

// Revert the splice above
// Let's just reload and do it cleanly
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');

// Reload and do clean replacement
content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');

// Replace getOrderRange(o) with (orderRangeMap.get(o.id) ?? null)
// Replace getOrderRentRangeCached(o) with (orderRentRangeMap.get(o.id) ?? null)
// But NOT in the definition lines themselves

let result = content;
// Remove the helper wrapper lines entirely
result = result.replace(/\n    \/\/ Cached lookup helpers \(defined before useMemo that uses them\)\n    const getOrderRange = \(o: OrderSimple\) => orderRangeMap\.get\(o\.id\) \?\? null\n    const getOrderRentRangeCached = \(o: OrderSimple\) => orderRentRangeMap\.get\(o\.id\) \?\? null\n\n/, '\n');
result = result.replace(/\n    \/\/ Cached lookup helpers\n    const getOrderRange = \(o: OrderSimple\) => orderRangeMap\.get\(o\.id\) \?\? null\n    const getOrderRentRangeCached = \(o: OrderSimple\) => orderRentRangeMap\.get\(o\.id\) \?\? null\n/, '\n');

// Replace all call sites
result = result.replaceAll('getOrderRange(o)', '(orderRangeMap.get(o.id) ?? null)');
result = result.replaceAll('getOrderRentRangeCached(o)', '(orderRentRangeMap.get(o.id) ?? null)');

fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', result, 'utf8');
const finalLines = result.split('\n');
console.log('done, lines:', finalLines.length);

// Verify no more references
const remaining = finalLines.filter(l => l.includes('getOrderRange') || l.includes('getOrderRentRangeCached'));
console.log('Remaining refs:', remaining.length);
remaining.forEach((l, i) => console.log(i, l.trim().substring(0, 80)));
