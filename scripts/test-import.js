// 测试 import 接口是否正常写入
// 用法: node scripts/test-import.js <token>
const token = process.argv[2]
if (!token) { console.error('Usage: node test-import.js <token>'); process.exit(1) }

const csv = [
  'orderNo,platform,status,itemTitle',
  `TEST-DEBUG-${Date.now()},CHENGLIN,RENTING,测试商品`
].join('\n')

const boundary = '----TestBoundary123'
const body = Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="orders.csv"\r\nContent-Type: text/csv\r\n\r\n`),
  Buffer.from(csv, 'utf-8'),
  Buffer.from(`\r\n--${boundary}--\r\n`)
])

fetch('http://localhost:3000/api/online-orders/import', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': `multipart/form-data; boundary=${boundary}`
  },
  body
}).then(async res => {
  console.log('HTTP Status:', res.status)
  const text = await res.text()
  console.log('Response body:')
  console.log(text)
}).catch(e => console.error('Fetch error:', e))
