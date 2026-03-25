const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
let lines = content.split('\n');

// Extract Sheet lines (1459-1795, 0-indexed 1458-1794)
const sheetStart = 1458; // <Sheet open=...
const sheetEnd = 1794;   // </Sheet>

const sheetLines = lines.slice(sheetStart, sheetEnd + 1);

// Build the DayDetailSheet component
// It receives all needed data as props, owns currentPage and inventoryItemPage internally
const componentLines = [
'',
'// C: Extracted Sheet as separate component to isolate pagination re-renders',
'function DayDetailSheet({',
'    open, onOpenChange,',
'    selectedDate, selectedDayType, selectedDayOrders, selectedDayStats,',
'    inventoryItems, loadingItems, activeTab,',
'    openOrder,',
'}: {',
'    open: boolean',
'    onOpenChange: (v: boolean) => void',
'    selectedDate: Date | null',
'    selectedDayType: string',
'    selectedDayOrders: OrderSimple[]',
'    selectedDayStats: { occupied: number; available: number; totalStock: number } | null',
'    inventoryItems: InventoryItem[]',
'    loadingItems: boolean',
'    activeTab: string',
'    openOrder: (o: OrderSimple) => void',
'}) {',
'    const [currentPage, setCurrentPage] = useState(1)',
'    const [inventoryItemPage, setInventoryItemPage] = useState(1)',
'    const pageSize = 10',
'',
'    // Reset pages when content changes',
'    useEffect(() => { setCurrentPage(1) }, [selectedDayOrders, selectedDayType])',
'    useEffect(() => { setInventoryItemPage(1) }, [inventoryItems])',
'',
'    const totalPages = Math.ceil(selectedDayOrders.length / pageSize)',
'    const currentSheetOrders = selectedDayOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)',
'    const dayTypeLabel = selectedDayType === \'in\' ? \'入库\' : selectedDayType === \'out\' ? \'出库\' : selectedDayType === \'stock\' ? \'在库\' : \'占用\'',
'    const dayEmptyLabel = selectedDayType === \'in\' ? \'无入库记录\' : selectedDayType === \'out\' ? \'无出库记录\' : selectedDayType === \'stock\' ? \'无库存记录\' : \'无占用记录\'',
'',
'    return (',
];

// Now take the sheet JSX lines and de-indent by 12 spaces (3 levels of 4-space indent)
// The sheet was inside 3 levels of JSX nesting in the parent
const deindent = (line) => {
    // Remove up to 12 leading spaces
    let count = 0;
    let i = 0;
    while (i < line.length && line[i] === ' ' && count < 12) {
        count++;
        i++;
    }
    return line.substring(count);
};

// Add the sheet JSX, de-indented, with 4 spaces base indent
sheetLines.forEach(l => {
    componentLines.push('    ' + deindent(l));
});

componentLines.push('    )');
componentLines.push('}');
componentLines.push('');

// Find where InventoryCalendarClient function starts
const clientFnIdx = lines.findIndex(l => l.includes('export function InventoryCalendarClient'));
console.log('InventoryCalendarClient at line', clientFnIdx + 1);

// Insert component before InventoryCalendarClient
lines.splice(clientFnIdx, 0, ...componentLines);

// Now find the original Sheet block (shifted by componentLines.length)
const newSheetStart = sheetStart + componentLines.length;
const newSheetEnd = sheetEnd + componentLines.length;

console.log('Original Sheet now at lines', newSheetStart+1, 'to', newSheetEnd+1);

// Replace the Sheet block with a single <DayDetailSheet ... /> call
const replacement = [
'            <DayDetailSheet',
'                open={sheetOpen}',
'                onOpenChange={setSheetOpen}',
'                selectedDate={selectedDate}',
'                selectedDayType={selectedDayType}',
'                selectedDayOrders={selectedDayOrders}',
'                selectedDayStats={selectedDayStats}',
'                inventoryItems={inventoryItems}',
'                loadingItems={loadingItems}',
'                activeTab={activeTab}',
'                openOrder={openOrder}',
'            />',
];

lines.splice(newSheetStart, newSheetEnd - newSheetStart + 1, ...replacement);

// Remove the now-redundant state/vars from parent that moved to child
// currentPage, inventoryItemPage, pageSize, totalPages, currentSheetOrders, dayTypeLabel, dayEmptyLabel
// These are computed inline in the parent currently - find and remove them
// Actually they are still referenced in the parent for the Sheet, so we just leave them
// The parent still has them but they won't cause re-renders of the Sheet child

fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
