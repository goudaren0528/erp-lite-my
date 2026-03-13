// Fix extra closing brace in all platform files
const fs = require('fs')

const files = [
  'sync-tool/src/lib/platforms/aolzu.ts',
  'sync-tool/src/lib/platforms/chenglin.ts',
  'sync-tool/src/lib/platforms/youpin.ts',
  'sync-tool/src/lib/platforms/rrz.ts',
  'sync-tool/src/lib/platforms/llxzu.ts',
  'sync-tool/src/lib/platforms/zanchen.ts',
]

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
  // The issue: we have "  } // end disabled DB save\n}\n}" - extra brace
  // Should be: "  } // end disabled DB save\n}"
  c = c.replace(/  \} \/\/ end disabled DB save\n\}\n\}/g, '  } // end disabled DB save\n}')
  fs.writeFileSync(f, c, 'utf8')
  console.log('Fixed:', f)
}
