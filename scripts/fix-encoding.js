var fs = require('fs');
var filePath = 'web/src/lib/online-orders/llxzu.ts';
var content = fs.readFileSync(filePath, 'utf8');

// Find all occurrences of \uFFFD (replacement character)
var positions = [];
for (var i = 0; i < content.length; i++) {
  if (content.charCodeAt(i) === 0xFFFD) {
    positions.push(i);
  }
}

// Show context around each occurrence
var contexts = positions.map(function(pos) {
  return pos + ': ' + JSON.stringify(content.substring(pos - 10, pos + 10));
});

fs.writeFileSync('scripts/fix-log.txt', 'total: ' + positions.length + '\n' + contexts.join('\n'));
