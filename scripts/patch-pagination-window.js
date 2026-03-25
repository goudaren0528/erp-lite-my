const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
let lines = content.split('\n');

// Find the Array.from({ length: totalPages }) line (0-indexed 1726)
const mapIdx = lines.findIndex(l => l.includes('Array.from({ length: totalPages }).map'));
const mapEndIdx = lines.findIndex((l, i) => i > mapIdx && l.trim() === '))}');
console.log('map at', mapIdx+1, 'end at', mapEndIdx+1);

const newPageNumbers = [
`                                    {(() => {`,
`                                        const windowSize = 10`,
`                                        const half = Math.floor(windowSize / 2)`,
`                                        let startPage = Math.max(1, currentPage - half)`,
`                                        let endPage = Math.min(totalPages, startPage + windowSize - 1)`,
`                                        if (endPage - startPage + 1 < windowSize) {`,
`                                            startPage = Math.max(1, endPage - windowSize + 1)`,
`                                        }`,
`                                        return Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map(page => (`,
`                                            <PaginationItem key={page}>`,
`                                                <PaginationLink`,
`                                                    href="#"`,
`                                                    onClick={(e) => { e.preventDefault(); setCurrentPage(page) }}`,
`                                                    isActive={currentPage === page}`,
`                                                >`,
`                                                    {page}`,
`                                                </PaginationLink>`,
`                                            </PaginationItem>`,
`                                        ))`,
`                                    })()}`,
];

lines.splice(mapIdx, mapEndIdx - mapIdx + 1, ...newPageNumbers);
fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done, lines:', lines.length);
