var n = '                { keywords: ["\u5f85\u7ed3\u7b97", "\u7ed3\u7b97\u5f85\u652f\u4ed8"], value: "RETURNING" },\n' +
        '                { keywords: ["\u4eca\u65e5\u672a\u8fd8\u6b3e", "\u4eca\u65e5\u672a\u8fd8"], value: "RENTING" },\n' +
        '                { keywords: ["\u4eca\u65e5\u5df2\u8fd8\u6b3e", "\u4eca\u65e5\u5df2\u8fd8"], value: "RETURNING" },\n';
require('fs').writeFileSync('scripts/fix-log.txt', Buffer.from(n, 'utf8').toString('hex'));
