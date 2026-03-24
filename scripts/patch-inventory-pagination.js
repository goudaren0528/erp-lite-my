const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
let lines = content.split('\n');

// 1. Add inventoryItemPage state after currentPage (line 366, 0-indexed 365)
const pageStateIdx = lines.findIndex(l => l.includes("const [currentPage, setCurrentPage] = useState(1)"));
lines.splice(pageStateIdx + 1, 0, '    const [inventoryItemPage, setInventoryItemPage] = useState(1)');
console.log('Added inventoryItemPage state at line', pageStateIdx + 2);

// 2. Reset inventoryItemPage when sheet opens — find setCurrentPage(1) // Reset pagination
const resetIdx = lines.findIndex(l => l.includes("setCurrentPage(1) // Reset pagination"));
if (resetIdx >= 0) {
    lines[resetIdx] = lines[resetIdx] + '\n        setInventoryItemPage(1)';
    console.log('Added reset at line', resetIdx + 1);
}

// 3. Replace inventoryItems.map with paginated version
// Find the line with inventoryItems.map
const mapIdx = lines.findIndex(l => l.includes('{inventoryItems.map((item) => {'));
const mapEndIdx = lines.findIndex((l, i) => i > mapIdx && l.trim() === '})}'  && lines[i-1].trim() === ')');
console.log('inventoryItems.map at line', mapIdx + 1, 'end at', mapEndIdx + 1);

// Insert pagination vars before the table body
// Find <TableBody> before the map
let tableBodyIdx = mapIdx - 1;
while (tableBodyIdx > 0 && !lines[tableBodyIdx].includes('<TableBody>')) tableBodyIdx--;
console.log('TableBody at line', tableBodyIdx + 1);

// Insert paging vars before TableBody
const invPageSize = 50;
lines.splice(tableBodyIdx, 0,
    `                                                {/* Inventory item pagination */}`,
    `                                                {(() => { const _invTotal = inventoryItems.length; const _invPages = Math.ceil(_invTotal / ${invPageSize}); return null; })()}`
);

// Re-find mapIdx after splice
const mapIdx2 = lines.findIndex(l => l.includes('{inventoryItems.map((item) => {'));
// Replace inventoryItems.map with paged slice
lines[mapIdx2] = lines[mapIdx2].replace(
    '{inventoryItems.map((item) => {',
    `{inventoryItems.slice((inventoryItemPage - 1) * ${invPageSize}, inventoryItemPage * ${invPageSize}).map((item) => {`
);
console.log('Patched map at line', mapIdx2 + 1);

// Find closing </Table> after the map to insert pagination controls
const tableCloseIdx = lines.findIndex((l, i) => i > mapIdx2 && l.includes('</Table>'));
console.log('</Table> at line', tableCloseIdx + 1);

const paginationBlock = [
`                                                {Math.ceil(inventoryItems.length / ${invPageSize}) > 1 && (`,
`                                                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">`,
`                                                        <span>共 {inventoryItems.length} 条，第 {inventoryItemPage}/{Math.ceil(inventoryItems.length / ${invPageSize})} 页</span>`,
`                                                        <div className="flex gap-1">`,
`                                                            <button className="px-2 py-0.5 border rounded disabled:opacity-40" disabled={inventoryItemPage <= 1} onClick={() => setInventoryItemPage(p => p - 1)}>上一页</button>`,
`                                                            <button className="px-2 py-0.5 border rounded disabled:opacity-40" disabled={inventoryItemPage >= Math.ceil(inventoryItems.length / ${invPageSize})} onClick={() => setInventoryItemPage(p => p + 1)}>下一页</button>`,
`                                                        </div>`,
`                                                    </div>`,
`                                                )}`,
];

// Insert after </Table> closing div
lines.splice(tableCloseIdx + 2, 0, ...paginationBlock);
console.log('Inserted pagination after line', tableCloseIdx + 2);

fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
