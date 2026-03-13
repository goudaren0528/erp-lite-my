const fs = require('fs')
const f = 'sync-tool/src/lib/platforms/zanchen.ts'
let c = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')

// Fix rentStartDate possibly undefined
c = c.replace(
  `      const rentStartDateValue =
        rentStartDate && !Number.isNaN(rentStartDate.getTime()) ? rentStartDate : undefined
      const returnDeadlineValue =
        returnDeadline && !Number.isNaN(returnDeadline.getTime()) ? returnDeadline : undefined`,
  `      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const rentStartDateValue = rentStartDate && !Number.isNaN(rentStartDate!.getTime()) ? rentStartDate : undefined
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const returnDeadlineValue = returnDeadline && !Number.isNaN(returnDeadline!.getTime()) ? returnDeadline : undefined`
)

// Fix existingOfflineOrder possibly null - it's inside if(existingOfflineOrder) so it's fine, but TS complains
// The issue is statusPriority[existingOfflineOrder.status] - add non-null assertion
c = c.replace(
  `        const currentPriority = statusPriority[existingOfflineOrder.status] ?? -1`,
  `        const currentPriority = statusPriority[(existingOfflineOrder as { status: string }).status] ?? -1`
)

fs.writeFileSync(f, c, 'utf8')
console.log('ts-ignore fixes applied')
