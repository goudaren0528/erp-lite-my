var fs = require('fs');
var filePath = 'web/src/lib/online-orders/llxzu.ts';
var buf = fs.readFileSync(filePath);

// The two corrupted lines as hex (from fix-log.txt)
var oldHex = '202020202020202020202020202020207b206b6579776f7264733a205b22e4bb8ae697a5e69caae8bf98efbfbd3f2c2022e5be85e7bb93efbfbd3f2c2022e7bb93e7ae97e5be85e694afefbfbd3f5d2c2076616c75653a20224455455f52455041594d454e5422207d2c0a202020202020202020202020202020207b206b6579776f7264733a205b22e4bb8ae697a5e5b7b2e8bf98efbfbd3f5d2c2076616c75653a202252454e54494e4722207d2c';
var oldBuf = Buffer.from(oldHex, 'hex');

// New replacement: 待结算/结算待支付 -> RETURNING, 今日未还款/今日未还 -> RENTING, 今日已还款/今日已还 -> RETURNING
var newStr = '                { keywords: ["\u5f85\u7ed3\u7b97", "\u7ed3\u7b97\u5f85\u652f\u4ed8"], value: "RETURNING" },\n' +
             '                { keywords: ["\u4eca\u65e5\u672a\u8fd8\u6b3e", "\u4eca\u65e5\u672a\u8fd8"], value: "RENTING" },\n' +
             '                { keywords: ["\u4eca\u65e5\u5df2\u8fd8\u6b3e", "\u4eca\u65e5\u5df2\u8fd8"], value: "RETURNING" },';
var newBuf = Buffer.from(newStr, 'utf8');

var idx = buf.indexOf(oldBuf);
fs.writeFileSync('scripts/fix-log.txt', 'idx: ' + idx);
if (idx === -1) { process.exit(1); }

var result = Buffer.concat([buf.slice(0, idx), newBuf, buf.slice(idx + oldBuf.length)]);
fs.writeFileSync(filePath, result);
fs.appendFileSync('scripts/fix-log.txt', '\ndone, new DUE idx: ' + result.indexOf(Buffer.from('DUE_REPAYMENT')));
