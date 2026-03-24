const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
const lines = content.split('\n');

// Find line with "const StatsCell" (0-indexed: 174)
const insertIdx = lines.findIndex(l => l.includes('const StatsCell ='));

const regionBufferRowComponent = `
// RegionBufferRow component for config UI
function RegionBufferRow({ rb, onChange, onDelete }: {
    rb: { id: string; provinces: string[]; deliveryBufferDays: number; returnBufferDays: number }
    onChange: (updated: typeof rb) => void
    onDelete: () => void
}) {
    const [showProvinces, setShowProvinces] = useState(false)
    const allSelected = PROVINCES.every(p => rb.provinces.includes(p))

    const toggleProvince = (p: string) => {
        const next = rb.provinces.includes(p)
            ? rb.provinces.filter(x => x !== p)
            : [...rb.provinces, p]
        onChange({ ...rb, provinces: next })
    }

    const toggleAll = () => {
        onChange({ ...rb, provinces: allSelected ? [] : [...PROVINCES] })
    }

    return (
        <div className="border rounded-md p-2 space-y-2 text-xs">
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 flex-1">
                    <Label className="text-xs whitespace-nowrap">发货</Label>
                    <Input type="number" className="h-6 w-12 text-xs px-1" value={rb.deliveryBufferDays} onChange={e => onChange({ ...rb, deliveryBufferDays: Number(e.target.value) })} />
                    <span className="text-muted-foreground">天</span>
                    <Label className="text-xs whitespace-nowrap ml-1">归还</Label>
                    <Input type="number" className="h-6 w-12 text-xs px-1" value={rb.returnBufferDays} onChange={e => onChange({ ...rb, returnBufferDays: Number(e.target.value) })} />
                    <span className="text-muted-foreground">天</span>
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-xs px-1" onClick={() => setShowProvinces(v => !v)}>
                    {rb.provinces.length === 0 ? '选省份' : rb.provinces.length + '省'} {showProvinces ? '▲' : '▼'}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" onClick={onDelete}>✕</Button>
            </div>
            {showProvinces && (
                <div className="space-y-1">
                    <div className="flex items-center gap-1 pb-1 border-b">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-3 w-3" />
                        <span className="text-muted-foreground">全选/反选</span>
                    </div>
                    <div className="grid grid-cols-5 gap-x-2 gap-y-0.5">
                        {PROVINCES.map(p => (
                            <label key={p} className="flex items-center gap-
0.5 cursor-pointer hover:text-primary">
                                <input type="checkbox" checked={rb.provinces.includes(p)} onChange={() => toggleProvince(p)} className="h-3 w-3" />
                                <span>{p}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

`;

lines.splice(insertIdx, 0, ...regionBufferRowComponent.split('\n'));
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
