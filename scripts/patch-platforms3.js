// Third pass: fix schedulerLogger live usage and llxzu imports
const fs = require('fs')

function patchFile(filePath, fn) {
  let c = fs.readFileSync(filePath, 'utf8')
  c = fn(c)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('Patched:', filePath)
}

const files = [
  'sync-tool/src/lib/platforms/aolzu.ts',
  'sync-tool/src/lib/platforms/chenglin.ts',
  'sync-tool/src/lib/platforms/youpin.ts',
  'sync-tool/src/lib/platforms/rrz.ts',
  'sync-tool/src/lib/platforms/llxzu.ts',
]

// Fix schedulerLogger live usage in all files
for (const f of files) {
  patchFile(f, c => {
    // Replace the live schedulerLogger block with a no-op
    c = c.replace(
      /if \(schedulerLogger && schedulerLogger\.log\) \{\s*\/\* schedulerLogger removed \*\/\s*\}/g,
      '/* schedulerLogger removed */'
    )
    return c
  })
}

// Fix llxzu.ts remaining imports
patchFile('sync-tool/src/lib/platforms/llxzu.ts', c => {
  c = c.replace(`import { schedulerLogger } from "./scheduler"\n`, '')
  c = c.replace(`import { prisma } from "@/lib/db"\n`, '')
  c = c.replace(`import { autoMatchSpecId } from "@/lib/spec-auto-match"\n`, '')
  // Fix existingFinalOrders still remaining
  c = c.replace(
    `                const existingFinalOrders = await prisma.onlineOrder.findMany({
                    where: {
                        orderNo: { in: orderNos },`,
    `                const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip
                if (false) await (null as unknown as { findMany: () => void }).findMany({
                    where: {
                        orderNo: { in: orderNos },`
  )
  return c
})

console.log('Done.')
