// Replace process.cwd() with a configurable base path in platform files
const fs = require('fs')

const files = [
  'sync-tool/src/lib/platforms/zanchen.ts',
  'sync-tool/src/lib/platforms/chenglin.ts',
  'sync-tool/src/lib/platforms/aolzu.ts',
  'sync-tool/src/lib/platforms/youpin.ts',
  'sync-tool/src/lib/platforms/llxzu.ts',
  'sync-tool/src/lib/platforms/rrz.ts',
]

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
  // Replace process.cwd() with _appBasePath
  c = c.replace(/process\.cwd\(\)/g, '_appBasePath()')
  // Add the _appBasePath function after the playwright import
  if (!c.includes('_appBasePath')) {
    c = c.replace(
      `import { chromium,`,
      `// sync-tool: use configurable base path instead of process.cwd()
let _basePathOverride: string | null = null
export function setAppBasePath(p: string) { _basePathOverride = p }
function _appBasePath() { return _basePathOverride || process.cwd() }

import { chromium,`
    )
  }
  fs.writeFileSync(f, c, 'utf8')
  console.log('Patched:', f)
}
