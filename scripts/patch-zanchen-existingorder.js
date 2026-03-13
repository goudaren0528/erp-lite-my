const fs = require('fs')
const f = 'sync-tool/src/lib/platforms/zanchen.ts'
let c = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')

// Remove the broken if(false) block for existingOrder
// Replace the whole block from "const existingOrder = null" to the closing })"
c = c.replace(
  `        const existingOrder = null // sync-tool: no DB
        if (false) {
          where: { orderNo: base.orderNo },
          select: {
            status: true,
            logisticsCompany: true,
            trackingNumber: true,
            returnLogisticsCompany: true,
            returnTrackingNumber: true
          }
        })
        if (existingOrder?.status === "COMPLETED") {
          addLog(\`Skip completed order \${base.orderNo}\`)
          continue
        }`,
  `        // sync-tool: skip existingOrder DB check`
)

fs.writeFileSync(f, c, 'utf8')
console.log('Fixed existingOrder block in zanchen.ts')
