const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
const lines = content.split('\n');

// Find the Popover start line (canManage && Popover open={isConfigOpen})
let startIdx = -1;
let endIdx = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Popover open={isConfigOpen}')) {
        // go back to find the {canManage && ( line
        startIdx = i - 1;
        break;
    }
}
// Find matching end: look for the closing )}  after the Popover
let depth = 0;
for (let i = startIdx; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('<Popover') || l.includes('{canManage')) depth++;
    if (l.includes('</Popover>')) {
        // next line should be )}
        endIdx = i + 2; // include the )} line
        break;
    }
}

console.log('Replacing lines', startIdx+1, 'to', endIdx+1);

const newPopover = `                    {canManage && (
                        <Popover open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="icon">
                                    <Settings className="h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[480px] max-h-[80vh] overflow-y-auto">
                                <div className="grid gap-4">
                                    <div className="space-y-1">
                                        <h4 className="font-medium leading-none">占用计算配置</h4>
                                        <p className="text-xs text-muted-foreground">按省份配置发货/归还缓冲天数，无匹配走默认</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs whitespace-nowrap">默认发货缓冲</Label>
                                            <Input type="number" className="h-7 w-16 text-xs" value={calendarConfig.defaultDeliveryBufferDays} onChange={e => setCalendarConfig(c => ({ ...c, defaultDeliveryBufferDays: Number(e.target.value) }))} />
                                            <span className="text-xs text-muted-foreground">天</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Label className="text-xs whitespace-nowrap">默认归还缓冲</Label>
                                            <Input type="number" className="h-7 w-16 text-xs" value={calendarConfig.defaultReturnBufferDays} onChange={e => setCalendarConfig(c => ({ ...c, defaultReturnBufferDays: Number(e.target.value) }))} />
                                            <span className="text-xs text-muted-foreground">天</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-medium">地区缓冲配置</span>
                                            <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setCalendarConfig(c => ({ ...c, regionBuffers: [...c.regionBuffers, { id: Date.now().toString(), provinces: [], deliveryBufferDays: 2, returnBufferDays: 3 }] }))}>+ 添加</Button>
                                        </div>
                                        {calendarConfig.regionBuffers.map((rb, idx) => (
                                            <RegionBufferRow key={rb.id} rb={rb} onChange={updated => setCalendarConfig(c => ({ ...c, regionBuffers: c.regionBuffers.map((r, i) => i === idx ? updated : r) }))} onDelete={() => setCalendarConfig(c => ({ ...c, regionBuffers: c.regionBuffers.filter((_, i) => i !== idx) }))} />
                                        ))}
                                        {calendarConfig.regionBuffers.length === 0 && (
                                            <p className="text-xs text-muted-foreground text-center py-2">暂无地区配置，所有订单使用默认缓冲</p>
                                        )}
                                    </div>
                                    <Button onClick={handleSaveConfig} disabled={isSavingConfig} size="sm">
                                        {isSavingConfig && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        保存配置
                 
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}`;

const newLines = newPopover.split('\n');
lines.splice(startIdx, endIdx - startIdx, ...newLines);
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
