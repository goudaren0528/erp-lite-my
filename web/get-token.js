const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
p.appConfig.findUnique({ where: { key: 'api_token' } }).then(r => {
  console.log('TOKEN:', r?.value ?? 'NOT FOUND')
  p.$disconnect()
})
