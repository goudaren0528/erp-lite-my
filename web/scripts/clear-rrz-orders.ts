import { PrismaClient } from "@prisma/client"
import dotenv from "dotenv"

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  const platform = "人人租"
  const before = await prisma.onlineOrder.count({ where: { platform } })
  console.log(`[RRZ] onlineOrder count before: ${before}`)

  const result = await prisma.onlineOrder.deleteMany({ where: { platform } })
  console.log(`[RRZ] deleted: ${result.count}`)

  const after = await prisma.onlineOrder.count({ where: { platform } })
  console.log(`[RRZ] onlineOrder count after: ${after}`)
}

main()
  .catch((e) => {
    console.error("[RRZ] clear failed:", e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => void 0)
  })

