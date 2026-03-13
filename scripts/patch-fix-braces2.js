// Fix llxzu and zanchen specific brace issues
const fs = require('fs')

// llxzu: has "    }\n}\n\n  } // end disabled DB save\n}"
const fllxzu = 'sync-tool/src/lib/platforms/llxzu.ts'
let cllxzu = fs.readFileSync(fllxzu, 'utf8').replace(/\r\n/g, '\n')
cllxzu = cllxzu.replace(
  `        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
}

  } // end disabled DB save
}`,
  `        appendLog(\`Recovered \${savedCount}/\${orders.length} orders in fallback mode.\`)
    }
  } // end disabled DB save
}`
)
fs.writeFileSync(fllxzu, cllxzu, 'utf8')
console.log('llxzu fixed:', !cllxzu.includes('    }\n}\n\n  } // end disabled'))

// zanchen: has "addLog(...)\n}\n\n  } // end disabled DB save\n}"
const fzan = 'sync-tool/src/lib/platforms/zanchen.ts'
let czan = fs.readFileSync(fzan, 'utf8').replace(/\r\n/g, '\n')
czan = czan.replace(
  `  addLog(\`保存完成，共处理 \${savedCount} 个订单\`)
}

  } // end disabled DB save
}`,
  `  addLog(\`保存完成，共处理 \${savedCount} 个订单\`)
  } // end disabled DB save
}`
)
fs.writeFileSync(fzan, czan, 'utf8')
console.log('zanchen fixed:', !czan.includes('addLog(`保存完成\n}\n\n  } // end disabled'))
