const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
const lines = content.split('\n');

// Find "<CardContent>" line
const insertIdx = lines.findIndex(l => l.trim() === '<CardContent>') + 1;
console.log('Inserting legend after line', insertIdx);

const legend = [
'                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3 px-1">',
'                        <span><span className="font-medium text-foreground">到</span>：当天归还到库数量</span>',
'                        <span><span className="font-medium text-foreground">发</span>：当天发货出库数量</span>',
'                        <span><span className="font-medium text-foreground">租</span>：当天在租订单数量</span>',
'                        <span><span className="font-medium text-foreground">库</span>：当天在库空闲数量（背景色：绿=充足 黄=紧张 红=缺货）</span>',
'                    </div>',
];

lines.splice(insertIdx, 0, ...legend);
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
