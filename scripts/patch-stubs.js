// Add stubs for prisma/autoMatchSpecId in all platform files (except zanchen which has its own)
// Also fix the if(false) findMany pattern
const fs = require('fs')

const STUB = `
// sync-tool stubs (dead code, never executed)
const prisma = null as unknown as {
  onlineOrder: { upsert: (...a: unknown[]) => Promise<unknown>; findUnique: (...a: unknown[]) => Promise<unknown>; findMany: (...a: unknown[]) => Promise<unknown[]> }
  order: { findUnique: (...a: unknown[]) => Promise<unknown>; update: (...a: unknown[]) => Promise<unknown>; findMany: (...a: unknown[]) => Promise<unknown[]> }
  product: { findMany: (...a: unknown[]) => Promise<unknown[]> }
  $transaction: (...a: unknown[]) => Promise<unknown>
}
async function autoMatchSpecId(_t: unknown, _s: unknown): Promise<string | null> { return null }
`

const files = [
  'sync-tool/src/lib/platforms/aolzu.ts',
  'sync-tool/src/lib/platforms/chenglin.ts',
  'sync-tool/src/lib/platforms/youpin.ts',
  'sync-tool/src/lib/platforms/rrz.ts',
  'sync-tool/src/lib/platforms/llxzu.ts',
]

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
  // Insert stubs after the playwright import line
  c = c.replace(
    `import { chromium, type BrowserContext, type Page } from "playwright"`,
    `import { chromium, type BrowserContext, type Page } from "playwright"\n${STUB}`
  )
  // Fix the bad if(false) findMany pattern - just replace with empty array directly
  c = c.replace(
    /const existingFinalOrders: \{ orderNo: string; status: string \}\[\] = \[\] \/\/ sync-tool: skip\s*if \(false\) await \(null as unknown as \{ findMany: \(\) => void \}\)\.findMany\(\{[\s\S]*?\}\)/g,
    'const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip incremental stop'
  )
  fs.writeFileSync(f, c, 'utf8')
  console.log('Patched:', f)
}

// zanchen needs different stubs (matchDeviceMapping/matchProductByTitle already stubbed, but prisma/autoMatchSpecId needed)
const fzan = 'sync-tool/src/lib/platforms/zanchen.ts'
let czan = fs.readFileSync(fzan, 'utf8').replace(/\r\n/g, '\n')
// Add prisma/autoMatchSpecId stubs after the existing stubs block
czan = czan.replace(
  `// Stub: matchDeviceMapping / matchProductByTitle (not needed in sync-tool)
function matchDeviceMapping(_t: unknown, _s: unknown, _p: unknown) { return null }
function matchProductByTitle(_t: unknown, _s: unknown, _p: unknown) { return null }`,
  `// Stub: matchDeviceMapping / matchProductByTitle (not needed in sync-tool)
function matchDeviceMapping(_t: unknown, _s: unknown, _p: unknown) { return null as unknown as { deviceName: string } | null }
function matchProductByTitle(_t: unknown, _s: unknown, _p: unknown) { return null as unknown as { productName: string; variantName: string; productId: string } | null }
${STUB}`
)
// Fix the bad if(false) findMany pattern in zanchen
czan = czan.replace(
  /const existingFinalOrders: \{ orderNo: string; status: string \}\[\] = \[\] \/\/ sync-tool: skip incremental stop\s*if \(false\) await \(null as unknown as \{ findMany: \(\) => void \}\)\.findMany\(\{[\s\S]*?\}\)/g,
  'const existingFinalOrders: { orderNo: string; status: string }[] = [] // sync-tool: skip incremental stop'
)
// Fix the existingOrder if(false) pattern in zanchen
czan = czan.replace(
  `        const existingOrder = null // sync-tool: no DB\n        if (false) await (null as unknown as { findUnique: () => void }).findUnique({`,
  `        const existingOrder = null // sync-tool: no DB\n        if (false) {`
)
fs.writeFileSync(fzan, czan, 'utf8')
console.log('Patched zanchen')
