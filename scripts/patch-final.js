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

// Fix rrz.ts - different playwright import
const frrz = 'sync-tool/src/lib/platforms/rrz.ts'
let crrz = fs.readFileSync(frrz, 'utf8').replace(/\r\n/g, '\n')
if (!crrz.includes('sync-tool stubs')) {
  crrz = crrz.replace(
    `import { chromium, type BrowserContext, type Frame, type Page } from "playwright"`,
    `import { chromium, type BrowserContext, type Frame, type Page } from "playwright"\n${STUB}`
  )
  fs.writeFileSync(frrz, crrz, 'utf8')
  console.log('rrz stubs added')
} else {
  console.log('rrz already has stubs')
}

// Fix zanchen.ts dead code type errors - wrap the whole saveOrdersToDB body in a type-safe way
// The issue is TypeScript checks inside if(false). Use @ts-nocheck on those lines or cast.
const fzan = 'sync-tool/src/lib/platforms/zanchen.ts'
let czan = fs.readFileSync(fzan, 'utf8').replace(/\r\n/g, '\n')

// Fix rentStartDate/returnDeadline type errors (lines ~1997-2002)
czan = czan.replace(
  `      const rentStartDate = o.rentStartDate ? new Date(o.rentStartDate) : undefined
      const returnDeadline = o.returnDeadline ? new Date(o.returnDeadline) : undefined
      const rentStartDateValue =
        rentStartDate && !Number.isNaN(rentStartDate.getTime()) ? rentStartDate : undefined
      const returnDeadlineValue =
        returnDeadline && !Number.isNaN(returnDeadline.getTime()) ? returnDeadline : undefined`,
  `      const rentStartDate = o.rentStartDate ? new Date(o.rentStartDate as string) : undefined
      const returnDeadline = o.returnDeadline ? new Date(o.returnDeadline as string) : undefined
      const rentStartDateValue =
        rentStartDate && !Number.isNaN(rentStartDate.getTime()) ? rentStartDate : undefined
      const returnDeadlineValue =
        returnDeadline && !Number.isNaN(returnDeadline.getTime()) ? returnDeadline : undefined`
)

// Fix existingOnlineOrder?.specId type error
czan = czan.replace(
  `      const existingOnlineOrder = await prisma.onlineOrder.findUnique({
        where: { orderNo: o.orderNo },
        select: { specId: true }
      })
      const autoSpecId = existingOnlineOrder?.specId`,
  `      const existingOnlineOrder = await prisma.onlineOrder.findUnique({
        where: { orderNo: o.orderNo },
        select: { specId: true }
      }) as { specId: string | null } | null
      const autoSpecId = existingOnlineOrder?.specId`
)

// Fix existingOfflineOrder type error
czan = czan.replace(
  `      const existingOfflineOrder = await prisma.order.findUnique({
        where: { orderNo: o.orderNo },
        select: { status: true }
      })

      if (existingOfflineOrder) {`,
  `      const existingOfflineOrder = await prisma.order.findUnique({
        where: { orderNo: o.orderNo },
        select: { status: true }
      }) as { status: string } | null

      if (existingOfflineOrder) {`
)

fs.writeFileSync(fzan, czan, 'utf8')
console.log('zanchen type fixes applied')
