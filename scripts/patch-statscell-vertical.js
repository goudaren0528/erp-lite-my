const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
const lines = content.split('\n');

// Find StatsCell start and end (lines 234-279, 0-indexed 233-278)
const startIdx = lines.findIndex(l => l.startsWith('const StatsCell ='));
let endIdx = startIdx;
let braceDepth = 0;
let started = false;
for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
        if (ch === '{') { braceDepth++; started = true; }
        if (ch === '}') braceDepth--;
    }
    if (started && braceDepth === 0) { endIdx = i; break; }
}

console.log('Replacing StatsCell lines', startIdx+1, 'to', endIdx+1);

const newStatsCell = `const StatsCell = ({ available, inCount, outCount, rentCount, compact = false, onInClick, onOutClick, onStockClick, onRentClick }: { available: number, inCount: number, outCount: number, rentCount: number, compact?: boolean, onInClick?: () => void, onOutClick?: () => void, onStockClick?: () => void, onRentClick?: () => void }) => {
    const bgClass = available <= 0 ? 'bg-red-100/70' : available < 2 ? 'bg-yellow-100/70' : 'bg-emerald-50/70'
    const stockColor = available < 0 ? 'text-red-600 font-bold' : ''

    const getClickableClass = (handler?: () => void) => 
        handler ? "cursor-pointer hover:underline underline-offset-2" : "cursor-default"

    // Vertical 4-row layout for both compact and normal
    return (
        <div className={\`flex flex-col justify-center h-full w-full \${bgClass} rounded-sm px-1 py-0.5 gap-px\`}>
            <div className={\`flex items-center justify-between text-[10px] leading-tight \${getClickableClass(onInClick)}\`} onClick={onInClick}>
                <span className="text-muted-foreground">到</span>
                <span className="tabular-nums">{inCount}</span>
            </div>
            <div className={\`flex items-center justify-between text-[10px] leading-tight \${getClickableClass(onOutClick)}\`} onClick={onOutClick}>
                <span className="text-muted-foreground">发</span>
                <span className="tabular-nums">{outCount}</span>
            </div>
            <div className={\`flex items-center justify-between text-[10px] leading-tight \${getClickableClass(onRentClick)}\`} onClick={onRentClick}>
                <span className="text-muted-foreground">租</span>
                <span className="tabular-nums">{rentCount}</span>
            </div>
            <div className={\`flex items-center justify-between text-[10px] leading-tight \${getClickableClass(onStockClick)}\`} onClick={onStockClick}>
                <span className="text-muted-foreground">库</span>
                <span className={\`tabular-nums \${stockColor}\`}>{available}</span>
            </div>
        </div>
    )
}`;

lines.splice(startIdx, endIdx - startIdx + 1, ...newStatsCell.split('\n'));
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
