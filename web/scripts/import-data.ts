
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
const CONFIGS_PATH = path.join(DATA_DIR, 'commission-configs.json');
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

    // 1. Users
    const users = await readJson(USERS_PATH);
    console.log(`Migrating ${users.length} users...`);
    for (const u of users) {
        await prisma.user.upsert({
            where: { username: u.username },
            update: {},
            create: {
                id: u.id,
                username: u.username,
                password: u.password,
                name: u.name,
                role: u.role,
                permissions: JSON.stringify(u.permissions || [])
            }
        });
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

    // 4. Commission Configs
    const configs = await readJson(CONFIGS_PATH);
    console.log(`Migrating ${configs.length} commission configs...`);
    for (const c of configs) {
        // CommissionConfig doesn't have a unique field other than ID, but in JSON it might not have ID?
        // Let's check schema. CommissionConfig has id @id @default(uuid()).
        // If JSON configs don't have IDs, we can't easily upsert by ID.
        // However, usually they might be identified by role.
        // Let's assume we create them if they don't exist? Or just create.
        // If we run multiple times, we might duplicate.
        // Let's try to find by role if possible, but schema doesn't say role is unique.
        // Let's just use create for now, but maybe delete all first? 
        // Or better, let's assume if we are migrating, we can clear the table or just ignore if it fails?
        // Let's use createMany? No, sqlite.
        
        // Let's try to upsert by ID if available, else create.
        if (c.id) {
            await prisma.commissionConfig.upsert({
                where: { id: c.id },
                update: {},
                create: {
                    id: c.id,
                    role: c.role,
                    minCount: c.minCount,
                    maxCount: c.maxCount,
                    percentage: c.percentage
                }
            });
        } else {
             await prisma.commissionConfig.create({
                data: {
                    role: c.role,
                    minCount: c.minCount,
                    maxCount: c.maxCount,
                    percentage: c.percentage
                }
            });
        }
    }

    // 5. Backup Logs
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

    // 6. Orders
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
