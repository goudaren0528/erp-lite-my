
import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const PROMOTERS_PATH = path.join(DATA_DIR, 'promoters.json');
const PRODUCTS_PATH = path.join(DATA_DIR, 'products.json');
const ORDERS_PATH = path.join(DATA_DIR, 'orders.json');
const ACCOUNT_GROUPS_PATH = path.join(DATA_DIR, 'account-groups.json');
const CHANNEL_CONFIGS_PATH = path.join(DATA_DIR, 'channel-configs.json');
const COMMISSION_RULES_PATH = path.join(DATA_DIR, 'commission-rules.json');
const LEGACY_CONFIGS_PATH = path.join(DATA_DIR, 'commission-configs.json');
const BACKUP_LOGS_PATH = path.join(DATA_DIR, 'backup-logs.json');

// Helper to safely read a JSON file
async function readJson(filePath: string) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        console.warn(`Could not read ${filePath}, skipping...`);
        return [];
    }
}

async function main() {
    console.log('Starting migration...');

    const accountGroups = await readJson(ACCOUNT_GROUPS_PATH);
    console.log(`Migrating ${accountGroups.length} account groups...`);
    for (const g of accountGroups) {
        const data = {
            name: g.name,
            description: g.description ?? null,
            settlementByCompleted: g.settlementByCompleted ?? true
        };
        if (g.id) {
            await prisma.accountGroup.upsert({
                where: { id: g.id },
                update: data,
                create: { id: g.id, ...data }
            });
        } else if (g.name) {
            await prisma.accountGroup.upsert({
                where: { name: g.name },
                update: data,
                create: data
            });
        }
    }

    const channelConfigs = await readJson(CHANNEL_CONFIGS_PATH);
    console.log(`Migrating ${channelConfigs.length} channel configs...`);
    for (const c of channelConfigs) {
        const data = {
            name: c.name,
            settlementByCompleted: c.settlementByCompleted ?? true
        };
        if (c.id) {
            await prisma.channelConfig.upsert({
                where: { id: c.id },
                update: data,
                create: { id: c.id, ...data }
            });
        } else if (c.name) {
            await prisma.channelConfig.upsert({
                where: { name: c.name },
                update: data,
                create: data
            });
        }
    }

    const commissionRules = await readJson(COMMISSION_RULES_PATH);
    console.log(`Migrating ${commissionRules.length} commission rules...`);
    for (const r of commissionRules) {
        const data = {
            type: r.type || "QUANTITY",
            minCount: r.minCount,
            maxCount: r.maxCount ?? null,
            percentage: r.percentage,
            accountGroupId: r.accountGroupId || null,
            channelConfigId: r.channelConfigId || null
        };
        if (r.id) {
            await prisma.commissionRule.upsert({
                where: { id: r.id },
                update: data,
                create: { id: r.id, ...data }
            });
        } else {
            await prisma.commissionRule.create({ data });
        }
    }

    const legacyConfigs = await readJson(LEGACY_CONFIGS_PATH);
    console.log(`Migrating ${legacyConfigs.length} legacy commission configs...`);
    const roleMap: Record<string, string> = {
        PEER: "同行",
        PART_TIME_AGENT: "兼职代理",
        AGENT: "代理",
        PART_TIME: "兼职",
        RETAIL: "零售"
    };
    for (const c of legacyConfigs) {
        const channelName = roleMap[c.role] || c.role;
        if (!channelName) continue;
        const channelConfig = await prisma.channelConfig.upsert({
            where: { name: channelName },
            update: { name: channelName, settlementByCompleted: true },
            create: { name: channelName, settlementByCompleted: true }
        });
        if (c.id) {
            await prisma.commissionRule.upsert({
                where: { id: c.id },
                update: {
                    type: "QUANTITY",
                    minCount: c.minCount,
                    maxCount: c.maxCount ?? null,
                    percentage: c.percentage,
                    channelConfigId: channelConfig.id,
                    accountGroupId: null
                },
                create: {
                    id: c.id,
                    type: "QUANTITY",
                    minCount: c.minCount,
                    maxCount: c.maxCount ?? null,
                    percentage: c.percentage,
                    channelConfigId: channelConfig.id
                }
            });
        } else {
            await prisma.commissionRule.create({
                data: {
                    type: "QUANTITY",
                    minCount: c.minCount,
                    maxCount: c.maxCount ?? null,
                    percentage: c.percentage,
                    channelConfigId: channelConfig.id
                }
            });
        }
    }

    const users = await readJson(USERS_PATH);
    console.log(`Migrating ${users.length} users...`);
    for (const u of users) {
        const existingUser = await prisma.user.findFirst({
            where: {
                username: {
                    equals: u.username
                }
            }
        });

        if (existingUser) {
            console.log(`User ${u.username} already exists, skipping...`);
            continue;
        }

        try {
            await prisma.user.create({
                data: {
                    id: u.id,
                    username: u.username,
                    password: u.password,
                    name: u.name,
                    role: u.role,
                    permissions: JSON.stringify(u.permissions || []),
                    accountGroupId: u.accountGroupId || null
                }
            });
        } catch (error) {
            console.error(`Failed to import user ${u.username}:`, error);
        }
    }

    // 2. Promoters
    const promoters = await readJson(PROMOTERS_PATH);
    console.log(`Migrating ${promoters.length} promoters...`);
    for (const p of promoters) {
        await prisma.promoter.upsert({
            where: { id: p.id },
            update: {
                phone: p.phone,
                channel: p.channel
            },
            create: {
                id: p.id,
                name: p.name,
                phone: p.phone,
                channel: p.channel,
                creatorId: p.creatorId,
                createdAt: p.createdAt ? new Date(p.createdAt) : new Date()
            }
        });
    }

    // 3. Products
    const products = await readJson(PRODUCTS_PATH);
    console.log(`Migrating ${products.length} products...`);
    for (const p of products) {
        await prisma.product.upsert({
            where: { id: p.id },
            update: {},
            create: {
                id: p.id,
                name: p.name,
                variants: JSON.stringify(p.variants || [])
            }
        });
    }

    // 4. Backup Logs
    const backupLogs = await readJson(BACKUP_LOGS_PATH);
    console.log(`Migrating ${backupLogs.length} backup logs...`);
    for (const b of backupLogs) {
        if (b.id) {
             await prisma.backupLog.upsert({
                where: { id: b.id },
                update: {},
                create: {
                    id: b.id,
                    type: b.type,
                    status: b.status,
                    operator: b.operator,
                    details: b.details || b.message || '',
                    timestamp: b.timestamp ? new Date(b.timestamp) : new Date()
                }
            });
        } else {
            await prisma.backupLog.create({
                data: {
                    type: b.type,
                    status: b.status,
                    operator: b.operator,
                    details: b.details || b.message || '',
                    timestamp: b.timestamp ? new Date(b.timestamp) : new Date()
                }
            });
        }
    }

    // 5. Orders
    const orders = await readJson(ORDERS_PATH);
    console.log(`Migrating ${orders.length} orders...`);
    for (const o of orders) {
        // Parse dates
        const rentStartDate = o.rentStartDate ? new Date(o.rentStartDate) : null;
        const deliveryTime = o.deliveryTime ? new Date(o.deliveryTime) : null;
        const returnDeadline = o.returnDeadline ? new Date(o.returnDeadline) : null;
        const createdAt = o.createdAt ? new Date(o.createdAt) : new Date();

        // Extensions
        const extensions = (o.extensions || []).map((e: { id: string; days: number; price: number; createdAt: string }) => ({
            id: e.id, // Ensure ID is preserved
            days: e.days,
            price: e.price,
            createdAt: e.createdAt ? new Date(e.createdAt) : new Date()
        }));

        // Logs
        const logs = (o.logs || []).map((l: { action: string; details?: string; desc?: string; operator?: string; timestamp?: string }) => ({
            action: l.action,
            desc: l.details || l.desc, 
            operator: l.operator || 'System',
            createdAt: l.timestamp ? new Date(l.timestamp) : new Date()
        }));

        try {
            await prisma.order.upsert({
                where: { orderNo: o.orderNo },
                update: {}, // Don't update if exists
                create: {
                    id: o.id,
                    orderNo: o.orderNo,
                    source: o.source,
                    platform: o.platform,
                    status: o.status,
                    
                    customerXianyuId: o.customerXianyuId || '',
                    sourceContact: o.sourceContact || '',
                    miniProgramOrderNo: o.miniProgramOrderNo,
                    xianyuOrderNo: o.xianyuOrderNo,
                    
                    productName: o.productName || '',
                    variantName: o.variantName || '',
                    sn: o.sn,
                    
                    duration: Number(o.duration) || 0,
                    rentPrice: Number(o.rentPrice) || 0,
                    deposit: Number(o.deposit) || 0,
                    insurancePrice: Number(o.insurancePrice) || 0,
                    overdueFee: Number(o.overdueFee) || 0,
                    totalAmount: Number(o.totalAmount) || 0,
                    
                    address: o.address || '',
                    recipientName: o.recipientName,
                    recipientPhone: o.recipientPhone,
                    trackingNumber: o.trackingNumber,
                    logisticsCompany: o.logisticsCompany,
                    
                    returnTrackingNumber: o.returnTrackingNumber,
                    returnLogisticsCompany: o.returnLogisticsCompany,
                    
                    rentStartDate,
                    deliveryTime,
                    returnDeadline,
                    
                    remark: o.remark,
                    screenshot: o.screenshot,
                    
                    creatorId: o.creatorId || 'system',
                    creatorName: o.creatorName || 'System',
                    createdAt,
                    
                    extensions: {
                        create: extensions
                    },
                    logs: {
                        create: logs
                    }
                }
            });
        } catch (e) {
            console.error(`Failed to migrate order ${o.orderNo}:`, e);
        }
    }

    console.log('Migration completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
