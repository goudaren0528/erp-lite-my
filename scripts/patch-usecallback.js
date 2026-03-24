const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
let lines = content.split('\n');

// Find getBufferDays start
const bufferStart = lines.findIndex(l => l.includes('const getBufferDays = (address'));
// Find getOrderRentRange end
let rentEnd = -1;
for (let i = bufferStart; i < lines.length; i++) {
    if (lines[i].includes('return { start, end }') && lines[i+1] && lines[i+1].trim() === '}') {
        rentEnd = i + 1;
        break;
    }
}
console.log('getBufferDays start:', bufferStart+1, 'getOrderRentRange end:', rentEnd+1);

// Extract the block
const block = lines.slice(bufferStart, rentEnd + 1).join('\n');
console.log('Block preview:', block.substring(0, 100));

// Wrap in useCallback
// Replace:
//   const getBufferDays = (address...) => { ... }
//   const getOrderOccupancyRange = (o...) => { ... }
//   const getOrderRentRange = (o...) => { ... }
// With useCallback versions

const newBlock = `    const getBufferDays = useCallback((address?: string | null) => {
        const province = extractProvince(address)
        if (province && calendarConfig.regionBuffers.length > 0) {
            const match = calendarConfig.regionBuffers.find(r => r.provinces.includes(province))
            if (match) return { deliveryBufferDays: match.deliveryBufferDays, returnBufferDays: match.returnBufferDays }
        }
        return { deliveryBufferDays: calendarConfig.defaultDeliveryBufferDays, returnBufferDays: calendarConfig.defaultReturnBufferDays }
    }, [calendarConfig])

    const getOrderOccupancyRange = useCallback((o: OrderSimple) => {
        if (['CANCELED', 'CLOSED', 'REFUNDED', 'TRADE_CLOSED', '已关闭', '已取消'].includes(o.status)) return null
        if (!o.rentStartDate) return null

        const { deliveryBufferDays, returnBufferDays } = getBufferDays(o.address)

        let start = subDays(new Date(o.rentStartDate), deliveryBufferDays)
        let endRaw = o.returnDeadline ? new Date(o.returnDeadline) : addDays(new Date(o.rentStartDate), 30)

        if (o.completedAt) {
            endRaw = new Date(o.completedAt)
        }

        const end = addDays(endRaw, returnBufferDays)

        let outDate = start
        if (o.actualDeliveryTime || o.deliveryTime) {
            const delivery = new Date(o.actualDeliveryTime || o.deliveryTime!)
            if (delivery < start) {
                start = delivery
            }
            outDate = delivery
        }

        start.setHours(0,0,0,0)
        end.setHours(23,59,59,999)

        return { start, end, outDate }
    }, [getBufferDays])

    const getOrderRentRange = useCallback((o: OrderSimple) => {
        if (['CANCELED', 'CLOSED', 'REFUNDED', 'TRADE_CLOSED', '已关闭', '已取消'].includes(o.status)) return null
        if (!o.rentStartDate) return null
        const start = new Date(o.rentStartDate)
        const end = o.returnDeadline ? new Date(o.returnDeadline) : addDays(start, 30)
        start.setHours(0,0,0,0)
        end.setHours(23,59,59,999)
        return { start, end }
    }, [])`;

lines.splice(bufferStart, rentEnd - bufferStart + 1, ...newBlock.split('\n'));
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
