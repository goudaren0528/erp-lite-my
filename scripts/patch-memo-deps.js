const fs = require('fs');
let content = fs.readFileSync('web/src/app/inventory-calendar/client.tsx', 'utf8');
let lines = content.split('\n');

// Line 790 (0-indexed 789): filteredOrders - add getOrderOccupancyRange
lines[789] = lines[789].replace(
    '}, [orders, activeTab, selectedItemTypeId, selectedVariantId, products, allVariants, specsByItemType])',
    '}, [orders, activeTab, selectedItemTypeId, selectedVariantId, products, allVariants, specsByItemType, getOrderOccupancyRange])'
);

// Line 986 (0-indexed 985): productOrderMap - add getOrderOccupancyRange
lines[985] = lines[985].replace(
    '}, [orders, products])',
    '}, [orders, products, getOrderOccupancyRange])'
);

// Line 1086 (0-indexed 1085): tableData - add getOrderOccupancyRange, getOrderRentRange
lines[1085] = lines[1085].replace(
    '}, [viewMode, activeTab, itemTypes, allVariants, productOrderMap, selectedItemTypeId, selectedVariantId])',
    '}, [viewMode, activeTab, itemTypes, allVariants, productOrderMap, selectedItemTypeId, selectedVariantId, getOrderOccupancyRange, getOrderRentRange])'
);

// Verify
console.log('790:', lines[789]);
console.log('986:', lines[985]);
console.log('1086:', lines[1085]);

fs.writeFileSync('web/src/app/inventory-calendar/client.tsx', lines.join('\n'), 'utf8');
console.log('done');
