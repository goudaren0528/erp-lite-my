'use server'

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getBackupLogs() {
    const logs = await prisma.backupLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 50
    });
    return logs.map(log => ({
        ...log,
        type: log.type as 'EXPORT' | 'IMPORT',
        status: log.status as 'SUCCESS' | 'FAILED',
        timestamp: log.timestamp.toISOString()
    }));
}

export async function importData(formData: FormData) {
    try {
        const file = formData.get('file') as File;
        if (!file) {
            throw new Error('No file uploaded');
        }

        const text = await file.text();
        const data = JSON.parse(text);
        const currentUser = await getCurrentUser();
        const importedTypes: string[] = [];

        await prisma.$transaction(async (tx) => {
            // 1. Users
            if (data.users && Array.isArray(data.users)) {
                let count = 0;
                for (const u of data.users) {
                    await tx.user.upsert({
                        where: { id: u.id },
                        update: {
                             username: u.username,
                             name: u.name,
                             role: u.role,
                             permissions: typeof u.permissions === 'string' ? u.permissions : JSON.stringify(u.permissions || [])
                        },
                        create: {
                            id: u.id,
                            username: u.username,
                            password: u.password,
                            name: u.name,
                            role: u.role,
                            permissions: typeof u.permissions === 'string' ? u.permissions : JSON.stringify(u.permissions || [])
                        }
                    });
                    count++;
                }
                importedTypes.push(`Users(${count})`);
            }
            
            // 2. Promoters
            if (data.promoters && Array.isArray(data.promoters)) {
                let count = 0;
                for (const p of data.promoters) {
                    await tx.promoter.upsert({
                        where: { id: p.id },
                        update: {
                            name: p.name,
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
                    count++;
                }
                importedTypes.push(`Promoters(${count})`);
            }

            // 3. Products
            if (data.products && Array.isArray(data.products)) {
                let count = 0;
                for (const p of data.products) {
                    await tx.product.upsert({
                        where: { id: p.id },
                        update: {
                            name: p.name,
                            variants: typeof p.variants === 'string' ? p.variants : JSON.stringify(p.variants || [])
                        },
                        create: {
                            id: p.id,
                            name: p.name,
                            variants: typeof p.variants === 'string' ? p.variants : JSON.stringify(p.variants || [])
                        }
                    });
                    count++;
                }
                importedTypes.push(`Products(${count})`);
            }

            // 4. CommissionConfigs
            if (data.commissionConfigs && Array.isArray(data.commissionConfigs)) {
                 let count = 0;
                 for (const c of data.commissionConfigs) {
                     if (c.id) {
                         await tx.commissionConfig.upsert({
                             where: { id: c.id },
                             update: {
                                 role: c.role,
                                 minCount: c.minCount,
                                 maxCount: c.maxCount,
                                 percentage: c.percentage
                             },
                             create: {
                                 id: c.id,
                                 role: c.role,
                                 minCount: c.minCount,
                                 maxCount: c.maxCount,
                                 percentage: c.percentage
                             }
                         });
                     } else {
                         await tx.commissionConfig.create({
                             data: {
                                 role: c.role,
                                 minCount: c.minCount,
                                 maxCount: c.maxCount,
                                 percentage: c.percentage
                             }
                         });
                     }
                     count++;
                 }
                 importedTypes.push(`CommissionConfigs(${count})`);
            }
            
            // 5. Orders
            if (data.orders && Array.isArray(data.orders)) {
                let count = 0;
                for (const o of data.orders) {
                    const rentStartDate = o.rentStartDate ? new Date(o.rentStartDate) : null;
                    const deliveryTime = o.deliveryTime ? new Date(o.deliveryTime) : null;
                    const returnDeadline = o.returnDeadline ? new Date(o.returnDeadline) : null;
                    const createdAt = o.createdAt ? new Date(o.createdAt) : new Date();

                    await tx.order.upsert({
                        where: { orderNo: o.orderNo },
                        update: {
                            status: o.status,
                            logisticsCompany: o.logisticsCompany,
                            trackingNumber: o.trackingNumber,
                            returnLogisticsCompany: o.returnLogisticsCompany,
                            returnTrackingNumber: o.returnTrackingNumber,
                            remark: o.remark,
                            screenshot: o.screenshot
                        },
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
                             rentStartDate,
                             deliveryTime,
                             returnDeadline,
                             remark: o.remark,
                             screenshot: o.screenshot,
                             creatorId: o.creatorId || 'system',
                             creatorName: o.creatorName || 'System',
                             createdAt,
                             extensions: {
                                 create: (o.extensions || []).map((e: { days: number; price: number; createdAt?: string }) => ({
                                     days: e.days,
                                     price: e.price,
                                     createdAt: e.createdAt ? new Date(e.createdAt) : new Date()
                                 }))
                             },
                             logs: {
                                 create: (o.logs || []).map((l: { action: string; details?: string; desc?: string; operator?: string; createdAt?: string }) => ({
                                     action: l.action,
                                     desc: l.details || l.desc,
                                     operator: l.operator || 'System',
                                     createdAt: l.createdAt ? new Date(l.createdAt) : new Date()
                                 }))
                             }
                        }
                    });
                    count++;
                }
                importedTypes.push(`Orders(${count})`);
            }

        }, {
             timeout: 20000 
        });

        await prisma.backupLog.create({
            data: {
                type: 'IMPORT',
                status: 'SUCCESS',
                operator: currentUser?.name || 'Unknown',
                details: importedTypes.length > 0 ? `Imported: ${importedTypes.join(', ')}` : 'No valid data found',
                timestamp: new Date()
            }
        });

        revalidatePath('/', 'layout');
        return { success: true, message: `Import successful: ${importedTypes.join(', ')}` };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "Import failed" };
    }
}
