const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
let lines = content.split('\n');

// Find old simple pagination block (lines 1635-1643, 0-indexed 1634-1642)
const startIdx = lines.findIndex(l => l.includes('Math.ceil(inventoryItems.length / 50) > 1'));
let endIdx = startIdx;
// Find the closing )}
let depth = 0;
for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
    }
    if (depth <= 0 && i > startIdx) { endIdx = i; break; }
}
console.log('Replacing lines', startIdx+1, 'to', endIdx+1);

const newPagination = [
`                                                {Math.ceil(inventoryItems.length / 50) > 1 && (() => {`,
`                                                    const invTotalPages = Math.ceil(inventoryItems.length / 50)`,
`                                                    const windowSize = 10`,
`                                                    const half = Math.floor(windowSize / 2)`,
`                                                    let startPage = Math.max(1, inventoryItemPage - half)`,
`                                                    let endPage = Math.min(invTotalPages, startPage + windowSize - 1)`,
`                                                    if (endPage - startPage + 1 < windowSize) startPage = Math.max(1, endPage - windowSize + 1)`,
`                                                    const pageNums = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)`,
`                                                    return (`,
`                                                        <div className="flex items-center justify-center gap-1 mt-2 flex-wrap">`,
`                                                            <button className="px-2 py-0.5 border rounded text-xs disabled:opacity-40" disabled={inventoryItemPage <= 1} onClick={() => setInventoryItemPage(p => p - 1)}>‹</button>`,
`                                                            {pageNums.map(page => (`,
`                                                                <button key={page} className={\`px-2 py-0.5 border rounded text-xs \${inventoryItemPage === page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}\`} onClick={() => setInventoryItemPage(page)}>{page}</button>`,
`                                                            ))}`,
`                                                            <button className="px-2 py-0.5 border rounded text-xs disabled:opacity-40" disabled={inventoryItemPage >= invTotalPages} onClick={() => setInventoryItemPage(p => p + 1)}>›</button>`,
`                                                        </div>`,
`                                                    )`,
`                                                })()}`,
];

lines.splice(startIdx, endIdx - startIdx + 1, ...newPagination);
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
