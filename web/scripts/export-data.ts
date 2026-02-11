
import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const DATA_DIR = path.join(process.cwd(), 'data');

function parseValue(value: string) {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

async function saveJson(filename: string, data: unknown[]) {
    const filePath = path.join(DATA_DIR, filename);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Saved ${data.length} records to ${filename}`);
}

async function main() {
    console.log('Starting data export...');

    // 1. Users
    const users = await prisma.user.findMany();
    // Parse permissions back to object if needed, but import expects JSON? 
    // Wait, import-data.ts reads JSON and uses it.
    // The import script expects permissions to be an array in the JSON, then it stringifies it on insert.
    // But in DB it is stored as string.
    // So we should parse it here so the JSON file is readable/editable and matches import expectation.
    const usersExport = users.map(u => ({
        ...u,
        permissions: JSON.parse(u.permissions || '[]')
    }));
    await saveJson('users.json', usersExport);

    // 2. Promoters
    const promoters = await prisma.promoter.findMany();
    await saveJson('promoters.json', promoters);

    // 3. Products
    const products = await prisma.product.findMany();
    const productsExport = products.map(p => ({
        ...p,
        variants: JSON.parse(p.variants || '[]'),
        matchKeywords: p.matchKeywords ? parseValue(p.matchKeywords) : null
    }));
    await saveJson('products.json', productsExport);

    // 4. Online Orders Config
    const onlineOrdersConfig = await prisma.appConfig.findUnique({ where: { key: "online_orders_sync_config" } });
    const onlineOrdersExport = onlineOrdersConfig?.value
        ? [{ key: "online_orders_sync_config", value: parseValue(onlineOrdersConfig.value) }]
        : [];
    await saveJson('online-orders-config.json', onlineOrdersExport);

    // 5. Account Groups
    const accountGroups = await prisma.accountGroup.findMany();
    await saveJson('account-groups.json', accountGroups);

    // 6. Channel Configs
    const channelConfigs = await prisma.channelConfig.findMany();
    await saveJson('channel-configs.json', channelConfigs);

    // 7. Commission Rules
    const commissionRules = await prisma.commissionRule.findMany();
    await saveJson('commission-rules.json', commissionRules);

    // 8. Backup Logs
    const backupLogs = await prisma.backupLog.findMany();
    await saveJson('backup-logs.json', backupLogs);

    // 9. Orders
    const orders = await prisma.order.findMany({
        include: {
            extensions: true,
            logs: true
        }
    });
    // Import script expects:
    // extensions array
    // logs array
    // dates as strings (JSON.stringify does this automatically)
    await saveJson('orders.json', orders);

    console.log('Export completed successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
