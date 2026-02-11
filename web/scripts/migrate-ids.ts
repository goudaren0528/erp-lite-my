
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    console.log('Starting ID migration...');

    // 1. Fetch all reference data
    const promoters = await prisma.promoter.findMany();
    const products = await prisma.product.findMany();
    const channelConfigs = await prisma.channelConfig.findMany();

    // Ensure '零售' channel exists
    let retailChannel = channelConfigs.find(c => c.name === '零售');
    if (!retailChannel) {
        console.log("Creating '零售' channel config...");
        retailChannel = await prisma.channelConfig.create({
            data: {
                name: '零售',
                isEnabled: true,
                settlementByCompleted: true
            }
        });
        channelConfigs.push(retailChannel);
    }

    console.log(`Loaded ${promoters.length} promoters, ${products.length} products, ${channelConfigs.length} channels.`);
    console.log('Channel Config Names:', channelConfigs.map(c => c.name).join(', '));
    console.log('Product Names (first 10):', products.map(p => p.name).slice(0, 10).join(', '));

    // 2. Fetch orders that need migration
    const orders = await prisma.order.findMany({
        where: {
            OR: [
                { promoterId: null },
                { productId: null },
                { channelId: null }
            ]
        }
    });

    console.log(`Found ${orders.length} orders to migrate.`);

    // 2.5 Migrate Promoters channelConfigId
    let updatedPromoters = 0;
    for (const p of promoters) {
        if (!p.channelConfigId && p.channel) {
             const channel = channelConfigs.find(c => c.name === p.channel);
             if (channel) {
                 await prisma.promoter.update({
                     where: { id: p.id },
                     data: { channelConfigId: channel.id }
                 });
                 updatedPromoters++;
             }
        }
    }
    console.log(`Updated ${updatedPromoters} promoters with channelConfigId.`);

    let updatedCount = 0;
    let logCount = 0;

    // Helper for smart normalization
    const normalize = (s: string) => s.toLowerCase()
        .replace(/\s+/g, '') // Remove spaces
        .replace(/pro/g, 'p') // Normalize Pro -> p
        .replace(/plus/g, '+'); // Normalize Plus -> +

    // Manual mappings for edge cases
    const manualProductMap: Record<string, string> = {
        'vivoX300U单机': 'vivoX300Pro单机',
        // Add other manual mappings here if needed
    };

    for (const order of orders) {
        let promoterId = order.promoterId;
        let productId = order.productId;
        let channelId = order.channelId;

        let needsUpdate = false;

        const debugLog = logCount < 20;

        // Match Promoter
        if (!promoterId && order.sourceContact && order.sourceContact !== 'self') {
            const contactName = order.sourceContact.trim();
            let promoter = promoters.find(p => p.name.trim() === contactName);
            
            // Try case-insensitive match
            if (!promoter) {
                promoter = promoters.find(p => p.name.trim().toLowerCase() === contactName.toLowerCase());
            }

            // Try fuzzy match (contains)
            if (!promoter) {
                promoter = promoters.find(p => p.name.includes(contactName) || contactName.includes(p.name));
            }

            // Try normalized match
            if (!promoter) {
                const nContact = normalize(contactName);
                promoter = promoters.find(p => normalize(p.name) === nContact || normalize(p.name).includes(nContact) || nContact.includes(normalize(p.name)));
            }

            if (promoter) {
                promoterId = promoter.id;
                needsUpdate = true;
                // Try to infer channel from promoter
                if (!channelId && promoter.channel) {
                     const channel = channelConfigs.find(c => c.name === promoter.channel);
                     if (channel) {
                         channelId = channel.id;
                     }
                }
            } else if (debugLog) {
                console.log(`[Order ${order.orderNo}] Failed to match promoter: "${contactName}".`);
                logCount++;
            }
        }

        // Match Product
        if (!productId && order.productName) {
            let pName = order.productName.trim();
            
            // Apply manual mapping
            if (manualProductMap[pName]) {
                pName = manualProductMap[pName];
            }

            // Try exact match first
            let product = products.find(p => p.name.trim() === pName);
            
            // Try case-insensitive match
            if (!product) {
                product = products.find(p => p.name.trim().toLowerCase() === pName.toLowerCase());
            }
            
            // Try contains if exact fails
            if (!product) {
                product = products.find(p => p.name.includes(pName) || pName.includes(p.name));
            }

            // Try normalized match
            if (!product) {
                const nPName = normalize(pName);
                product = products.find(p => {
                    const nDbName = normalize(p.name);
                    return nDbName === nPName || nDbName.includes(nPName) || nPName.includes(nDbName);
                });
            }
            
            if (product) {
                productId = product.id;
                needsUpdate = true;
            } else if (debugLog) {
                 console.log(`[Order ${order.orderNo}] Failed to match product: "${pName}".`);
                 logCount++;
            }
        }

        // Match Channel (if not set by promoter)
        if (!channelId && order.source) {
            const source = order.source.trim();
            const potentialNames: string[] = [];
            
            if (source === 'PEER') potentialNames.push('PEER', '同行');
            if (source === 'PART_TIME_AGENT') potentialNames.push('PART_TIME_AGENT', '兼职代理', '代理', '兼职');
            if (source === 'RETAIL') potentialNames.push('RETAIL', '零售');
            
            potentialNames.push(source);

            const channel = channelConfigs.find(c => potentialNames.includes(c.name));
            if (channel) {
                channelId = channel.id;
                needsUpdate = true;
            } else if (debugLog) {
                 console.log(`[Order ${order.orderNo}] Failed to match channel source: "${source}". Potential: ${potentialNames.join(',')}`);
                 logCount++;
            }
        }

        if (needsUpdate) {
            console.log(`Updating order ${order.orderNo} with P:${promoterId} C:${channelId} Pr:${productId}`);
            await prisma.order.update({
                where: { id: order.id },
                data: {
                    promoterId,
                    productId,
                    channelId
                }
            });
            updatedCount++;
            if (updatedCount % 100 === 0) {
                console.log(`Updated ${updatedCount} orders...`);
            }
        }
    }

    console.log(`Migration completed. Updated ${updatedCount} orders.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
