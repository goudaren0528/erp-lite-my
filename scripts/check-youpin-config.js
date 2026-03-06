const { PrismaClient } = require('../web/node_modules/@prisma/client')
const prisma = new PrismaClient({ datasources: { db: { url: 'file:D:/erp-lite/web/data/db.sqlite' } } })

async function main() {
  const rows = await prisma.appConfig.findMany()
  console.log('All keys:', rows.map(r => r.key))
  
  const onlineConfig = rows.find(r => r.key.includes('online') || r.key.includes('order'))
  if (!onlineConfig) { console.log('No online orders config found'); return }
  
  console.log('Config key:', onlineConfig.key)
  const config = JSON.parse(onlineConfig.value)
  const youpin = config.sites?.find(s => s.name?.includes('优品') || s.id?.includes('youpin'))
  if (!youpin) { 
    console.log('Youpin not found. Sites:', config.sites?.map(s => s.id + '/' + s.name))
    return 
  }
  console.log('username:', youpin.username)
  console.log('password type:', typeof youpin.password)
  console.log('password value:', JSON.stringify(youpin.password))
}

main().catch(console.error).finally(() => prisma.$disconnect())
