// Second pass: fix remaining issues in platform files
const fs = require('fs')

function patchFile(filePath, fn) {
  let c = fs.readFileSync(filePath, 'utf8')
  c = fn(c)
  fs.writeFileSync(filePath, c, 'utf8')
  console.log('Patched:', filePath)
}

// ─── Fix llxzu.ts ─────────────────────────────────────────────────────────────
patchFile('sync-tool/src/lib/platforms/llxzu.ts', c => {
  // Remove remaining bad imports
  c = c.replace(`import { schedulerLogger } from "./scheduler"\n`, '')
  c = c.replace(`import { prisma } from "@/lib/db"\n`, '')
  c = c.replace(`import { autoMatchSpecId } from "@/lib/spec-auto-match"\n`, '')
  // Fix the misplaced closing brace in saveOrdersBatch
  // The pattern is: return\n  if (false) { ... }\n\n  } // end disabled
  // Should be:      return\n  if (false) { ... }\n  } // end disabled
  c = c.replace(
    `    }
        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
}

  } // end disabled DB save`,
    `    }
        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
  } // end disabled DB save
}`
  )
  // Fix existingFinalOrders - different indentation in llxzu
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

// ─── Fix chenglin.ts ──────────────────────────────────────────────────────────
patchFile('sync-tool/src/lib/platforms/chenglin.ts', c => {
  // Fix misplaced closing brace in saveOrdersBatch
  c = c.replace(
    `        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
}

  } // end disabled DB save`,
    `        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
  } // end disabled DB save
}`
  )
  // Fix existingFinalOrders
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

// ─── Fix aolzu.ts ─────────────────────────────────────────────────────────────
patchFile('sync-tool/src/lib/platforms/aolzu.ts', c => {
  c = c.replace(
    `        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
}

  } // end disabled DB save`,
    `        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
  } // end disabled DB save
}`
  )
  return c
})

// ─── Fix youpin.ts ────────────────────────────────────────────────────────────
patchFile('sync-tool/src/lib/platforms/youpin.ts', c => {
  c = c.replace(
    `        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
}

  } // end disabled DB save`,
    `        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
  } // end disabled DB save
}`
  )
  return c
})

// ─── Fix rrz.ts ───────────────────────────────────────────────────────────────
patchFile('sync-tool/src/lib/platforms/rrz.ts', c => {
  c = c.replace(
    `        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
}

  } // end disabled DB save`,
    `        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
  } // end disabled DB save
}`
  )
  return c
})

console.log('Done.')
