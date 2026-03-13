const fs = require('fs')
const f = 'sync-tool/src/lib/platforms/llxzu.ts'
let c = fs.readFileSync(f, 'utf8')

// Normalize line endings
c = c.replace(/\r\n/g, '\n')

// Fix existingFinalOrders - llxzu has platform filter
c = c.replace(
  /const existingFinalOrders = await prisma\.onlineOrder\.findMany\(\{\s*where: \{\s*orderNo: \{ in: orderNos \},\s*platform: "零零享",\s*status: \{ in: finalStatuses \}\s*\},\s*select: \{ orderNo: true, status: true \}\s*\}\)/,
  'const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip incremental stop'
)

// Also fix rrz.ts and youpin.ts with similar patterns
fs.writeFileSync(f, c, 'utf8')
console.log('llxzu fixed, existingFinalOrders replaced:', c.includes('sync-tool: skip incremental stop'))

// Fix rrz.ts
const frrz = 'sync-tool/src/lib/platforms/rrz.ts'
let crrz = fs.readFileSync(frrz, 'utf8').replace(/\r\n/g, '\n')
crrz = crrz.replace(
  /const existingFinalOrders = await prisma\.onlineOrder\.findMany\(\{\s*where: \{\s*orderNo: \{ in: orderNos \},[\s\S]*?select: \{ orderNo: true, status: true \}\s*\}\)/,
  'const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip incremental stop'
)
fs.writeFileSync(frrz, crrz, 'utf8')
console.log('rrz fixed:', crrz.includes('sync-tool: skip incremental stop'))

// Fix youpin.ts
const fyp = 'sync-tool/src/lib/platforms/youpin.ts'
let cyp = fs.readFileSync(fyp, 'utf8').replace(/\r\n/g, '\n')
cyp = cyp.replace(
  /const existingFinalOrders = await prisma\.onlineOrder\.findMany\(\{\s*where: \{\s*orderNo: \{ in: orderNos \},[\s\S]*?select: \{ orderNo: true, status: true \}\s*\}\)/,
  'const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip incremental stop'
)
fs.writeFileSync(fyp, cyp, 'utf8')
console.log('youpin fixed:', cyp.includes('sync-tool: skip incremental stop'))

// Fix aolzu.ts
const faolzu = 'sync-tool/src/lib/platforms/aolzu.ts'
let caolzu = fs.readFileSync(faolzu, 'utf8').replace(/\r\n/g, '\n')
caolzu = caolzu.replace(
  /const existingFinalOrders = await prisma\.onlineOrder\.findMany\(\{\s*where: \{\s*orderNo: \{ in: orderNos \},[\s\S]*?select: \{ orderNo: true, status: true \}\s*\}\)/,
  'const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip incremental stop'
)
fs.writeFileSync(faolzu, caolzu, 'utf8')
console.log('aolzu fixed:', caolzu.includes('sync-tool: skip incremental stop'))

// Fix chenglin.ts
const fch = 'sync-tool/src/lib/platforms/chenglin.ts'
let cch = fs.readFileSync(fch, 'utf8').replace(/\r\n/g, '\n')
cch = cch.replace(
  /const existingFinalOrders = await prisma\.onlineOrder\.findMany\(\{\s*where: \{\s*orderNo: \{ in: orderNos \},[\s\S]*?select: \{ orderNo: true, status: true \}\s*\}\)/,
  'const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip incremental stop'
)
fs.writeFileSync(fch, cch, 'utf8')
console.log('chenglin fixed:', cch.includes('sync-tool: skip incremental stop'))
