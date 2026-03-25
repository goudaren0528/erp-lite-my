// Patch B: Add orderRangeMap useMemo after getOrderRentRange
const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
let lines = content.split('\n');

// Find the line after getOrderRentRange closing }, [])
const rentRangeEnd = lines.findIndex(l => l.includes('}, [])') && lines[lines.indexOf(l)].includes('}, [])'));
// More reliable: find the useCallback for getOrderRentRange and its closing
let idx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('const getOrderRentRange = useCallback')) {
        // find closing }, [])
        for (let j = i+1; j < lines.length; j++) {
            if (lines[j].trim() === '}, [])') {
                idx = j;
                break;
            }
        }
        break;
    }
}
console.log('Insert orderRangeMap after line', idx+1);

const newBlock = [
'',
'    // B: Pre-compute occupancy range for every order once',
'    // All callers use this map instead of calling getOrderOccupancyRange per-render',
'    const orderRangeMap = useMemo(() => {',
'        const map = new Map<string, { start: Date; end: Date; outDate: Date } | null>()',
'        orders.forEach(o => {',
'            map.set(o.id, getOrderOccupancyRange(o))',
'        })',
'        return map',
'    }, [orders, getOrderOccupancyRange])',
'',
'    const orderRentRangeMap = useMemo(() => {',
'        const map = new Map<string, { start: Date; end: Date } | null>()',
'        orders.forEach(o => {',
'            map.set(o.id, getOrderRentRange(o))',
'        })',
'        return map',
'    }, [orders, getOrderRentRange])',
'',
'    // Cached lookup helpers',
'    const getOrderRange = (o: OrderSimple) => orderRangeMap.get(o.id) ?? null',
'    const getOrderRentRangeCached = (o: OrderSimple) => orderRentRangeMap.get(o.id) ?? null',
];

lines.splice(idx + 1, 0, ...newBlock);
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
