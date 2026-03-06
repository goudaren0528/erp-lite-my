var fs = require('fs');
var filePath = 'web/src/lib/online-orders/llxzu.ts';
var raw = fs.readFileSync(filePath, 'utf8');

// Detect line ending
var crlf = raw.indexOf('\r\n') !== -1;
var sep = crlf ? '\r\n' : '\n';
var lines = raw.split(sep);

var indent = '                ';

// Find DUE_REPAYMENT line index
var dueIdx = -1;
for (var i = 0; i < lines.length; i++) {
  if (lines[i].indexOf('DUE_REPAYMENT') !== -1) { dueIdx = i; break; }
}

// Find 今日已还款 RENTING line after DUE_REPAYMENT
var jinriIdx = -1;
for (var j = dueIdx + 1; j < Math.min(dueIdx + 4, lines.length); j++) {
  if (lines[j].indexOf('RENTING') !== -1) { jinriIdx = j; break; }
}

fs.writeFileSync('scripts/fix-log.txt', 'crlf:' + crlf + ' dueIdx:' + dueIdx + ' jinriIdx:' + jinriIdx);
if (dueIdx === -1 || jinriIdx === -1) { process.exit(1); }

lines[dueIdx] = indent + '{ keywords: ["\u5f85\u7ed3\u7b97"], value: "RETURNING" },';
lines.splice(dueIdx + 1, 0, indent + '{ keywords: ["\u4eca\u65e5\u672a\u8fd8\u6b3e", "\u4eca\u65e5\u672a\u8fd8"], value: "RENTING" },');

var newJinriIdx = jinriIdx + 1;
lines[newJinriIdx] = indent + '{ keywords: ["\u4eca\u65e5\u5df2\u8fd8\u6b3e", "\u4eca\u65e5\u5df2\u8fd8"], value: "RETURNING" },';

fs.writeFileSync(filePath, lines.join(sep), 'utf8');
fs.appendFileSync('scripts/fix-log.txt', ' done');
