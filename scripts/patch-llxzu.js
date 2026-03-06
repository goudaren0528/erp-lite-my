const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, '../web/src/lib/online-orders/llxzu.ts')
let content = fs.readFileSync(filePath, 'utf8')

const target = `export function stopLlxzuSync() {
    runtime.shouldStop = true
    appendLog("User requested stop.")
    updateStatus({ status: "idle", message: "Stopping..." })
}`

const replacement = `export function stopLlxzuSync() {
    runtime.shouldStop = true
    appendLog("User requested stop.")
    updateStatus({ status: "idle", message: "Stopping..." })
}

export async function restartLlxzuBrowser() {
    appendLog("Browser restart requested.")
    runtime.shouldStop = true
    try {
        if (runtime.context) {
            await runtime.context.close().catch(() => void 0)
            runtime.context = undefined
            runtime.page = undefined
            appendLog("Browser context closed.")
        }
    } catch { void 0 }
    updateStatus({ status: "idle", message: "\\u6d4f\\u89c8\\u5668\\u5df2\\u91cd\\u542f\\uff0c\\u53ef\\u91cd\\u65b0\\u5f00\\u59cb\\u540c\\u6b65" })
    return { success: true }
}`

if (!content.includes('restartLlxzuBrowser')) {
  if (content.includes(target)) {
    content = content.replace(target, replacement)
    fs.writeFileSync(filePath, content, 'utf8')
    console.log('Patched successfully')
  } else {
    console.log('Target not found, trying normalized search...')
    // Normalize whitespace and try again
    const normalized = content.replace(/\r\n/g, '\n')
    if (normalized.includes(target)) {
      const patched = normalized.replace(target, replacement)
      fs.writeFileSync(filePath, patched, 'utf8')
      console.log('Patched with normalized content')
    } else {
      console.log('Still not found. Appending at end of file instead.')
      content += '\n\nexport async function restartLlxzuBrowser() {\n    appendLog("Browser restart requested.")\n    runtime.shouldStop = true\n    try {\n        if (runtime.context) {\n            await runtime.context.close().catch(() => void 0)\n            runtime.context = undefined\n            runtime.page = undefined\n            appendLog("Browser context closed.")\n        }\n    } catch { void 0 }\n    updateStatus({ status: "idle", message: "\\u6d4f\\u89c8\\u5668\\u5df2\\u91cd\\u542f\\uff0c\\u53ef\\u91cd\\u65b0\\u5f00\\u59cb\\u540c\\u6b65" })\n    return { success: true }\n}\n'
      fs.writeFileSync(filePath, content, 'utf8')
      console.log('Appended at end of file')
    }
  }
} else {
  console.log('restartLlxzuBrowser already exists, checking for duplicates...')
  const matches = (content.match(/restartLlxzuBrowser/g) || []).length
  console.log(`Found ${matches} occurrences`)
}
