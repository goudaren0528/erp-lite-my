'use server'

import { prisma } from "@/lib/db";
import type { ChannelConfig, PrismaClient } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export async function getBackupLogs() {
    const logs = await prisma.backupLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 50
    });
    return logs.map((log: { id: string; operator: string; details: string; type: string; status: string; timestamp: Date }) => ({
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

        await prisma.$transaction(async (tx: TransactionClient) => {
            const accountGroupIdMap = new Map<string, string>();
            const channelIdMap = new Map<string, string>();

            if (data.onlineOrdersConfig) {
                const appConfigClient = (tx as unknown as { appConfig?: typeof prisma.appConfig }).appConfig
                if (appConfigClient) {
                    const configValue = Array.isArray(data.onlineOrdersConfig)
                        ? data.onlineOrdersConfig[0]
                        : data.onlineOrdersConfig
                    
                    if (configValue && typeof configValue === "object") {
                        // Handle both old format (array of key-value objects) and new direct format
                        const rawValue = (configValue as { value?: unknown }).value ?? configValue
                        
                        // If it's the full config object directly (from new export)
                        // it won't have a 'value' wrapper property, so we use it as is.
                        // But if it's from the DB export format { key: "...", value: "..." }, we unwrap it.
                        
                        let valueToStore = rawValue
                        
                        // Compatibility: If importing old data where value might be a stringified JSON
                        if (typeof rawValue === "string") {
                            try {
                                // Try to parse to check if it's valid JSON, but store as string
                                JSON.parse(rawValue)
                                valueToStore = rawValue
                            } catch {
                                // If not valid JSON, wrap it (unlikely for this specific config)
                                valueToStore = JSON.stringify({ value: rawValue })
                            }
                        } else {
                            // If it's an object, stringify it for the DB text field
                            valueToStore = JSON.stringify(rawValue)
                        }

                        await appConfigClient.upsert({
                            where: { key: "online_orders_sync_config" },
                            update: { value: valueToStore },
                            create: { key: "online_orders_sync_config", value: valueToStore }
                        })
                        importedTypes.push("OnlineOrdersConfig(1)")
                    }
                }
            }

            if (data.accountGroups && Array.isArray(data.accountGroups)) {
                let count = 0;
                const accountGroupCache = new Map<string, string>();

                for (const g of data.accountGroups) {
                    // Check if we already processed this name
                    if (g.name && accountGroupCache.has(g.name)) {
                        const cachedId = accountGroupCache.get(g.name);
                        if (g.id && cachedId) {
                            accountGroupIdMap.set(g.id, cachedId);
                        }
                        continue;
                    }

                    const updateData = {
                        name: g.name,
                        description: g.description ?? null,
                        settlementByCompleted: g.settlementByCompleted ?? true
                    };

                    let finalId = g.id;

                    if (g.name) {
                        const existingByName = await tx.accountGroup.findUnique({ where: { name: g.name } });
                        if (existingByName) {
                            await tx.accountGroup.update({
                                where: { id: existingByName.id },
                                data: updateData
                            });
                            finalId = existingByName.id;
                        } else if (g.id) {
                            const existingById = await tx.accountGroup.findUnique({ where: { id: g.id } });
                            if (existingById) {
                                await tx.accountGroup.update({
                                    where: { id: existingById.id },
                                    data: updateData
                                });
                                finalId = existingById.id;
                            } else {
                                const created = await tx.accountGroup.create({
                                    data: {
                                        id: g.id,
                                        ...updateData
                                    }
                                });
                                finalId = created.id;
                            }
                        } else {
                            const created = await tx.accountGroup.create({
                                data: updateData
                            });
                            finalId = created.id;
                        }
                        accountGroupCache.set(g.name, finalId!);
                    } else if (g.id) {
                         // Fallback for ID-only update (shouldn't happen for AccountGroup creation usually)
                         await tx.accountGroup.upsert({
                            where: { id: g.id },
                            update: updateData,
                            create: { id: g.id, ...updateData }
                         });
                         finalId = g.id;
                    }

                    if (g.id && finalId) {
                        accountGroupIdMap.set(g.id, finalId);
                    }
                    count++;
                }
                importedTypes.push(`AccountGroups(${count})`);
            }

            if (data.channelConfigs && Array.isArray(data.channelConfigs)) {
                let count = 0;
                const channelConfigCache = new Map<string, string>();

                for (const c of data.channelConfigs) {
                    if (c.name && channelConfigCache.has(c.name)) {
                        const cachedId = channelConfigCache.get(c.name);
                        if (c.id && cachedId) {
                            channelIdMap.set(c.id, cachedId);
                        }
                        continue;
                    }

                    const updateData = {
                        name: c.name,
                        settlementByCompleted: c.settlementByCompleted ?? true
                    };

                    let finalId = c.id;

                    if (c.name) {
                        const existingByName = await tx.channelConfig.findUnique({ where: { name: c.name } });
                        if (existingByName) {
                            await tx.channelConfig.update({
                                where: { id: existingByName.id },
                                data: updateData
                            });
                            finalId = existingByName.id;
                        } else if (c.id) {
                            const existingById = await tx.channelConfig.findUnique({ where: { id: c.id } });
                            if (existingById) {
                                await tx.channelConfig.update({
                                    where: { id: existingById.id },
                                    data: updateData
                                });
                                finalId = existingById.id;
                            } else {
                                const created = await tx.channelConfig.create({
                                    data: {
                                        id: c.id,
                                        ...updateData
                                    }
                                });
                                finalId = created.id;
                            }
                        } else {
                            const created = await tx.channelConfig.create({
                                data: updateData
                            });
                            finalId = created.id;
                        }
                        channelConfigCache.set(c.name, finalId!);
                    } else if (c.id) {
                        await tx.channelConfig.upsert({
                            where: { id: c.id },
                            update: updateData,
                            create: { id: c.id, ...updateData }
                        });
                        finalId = c.id;
                    }

                    if (c.id && finalId) {
                        channelIdMap.set(c.id, finalId);
                    }
                    count++;
                }
                importedTypes.push(`ChannelConfigs(${count})`);
            }

            if (data.commissionRules && Array.isArray(data.commissionRules)) {
                let count = 0;
                for (const r of data.commissionRules) {
                    const updateData = {
                        type: r.type || "QUANTITY",
                        minCount: r.minCount,
                        maxCount: r.maxCount ?? null,
                        percentage: r.percentage,
                        accountGroupId: (r.accountGroupId && accountGroupIdMap.get(r.accountGroupId)) || r.accountGroupId || null,
                        channelConfigId: (r.channelConfigId && channelIdMap.get(r.channelConfigId)) || r.channelConfigId || null
                    };
                    if (r.id) {
                        await tx.commissionRule.upsert({
                            where: { id: r.id },
                            update: updateData,
                            create: {
                                id: r.id,
                                ...updateData
                            }
                        });
                    } else {
                        await tx.commissionRule.create({
                            data: updateData
                        });
                    }
                    count++;
                }
                importedTypes.push(`CommissionRules(${count})`);
            }

            if (data.commissionConfigs && Array.isArray(data.commissionConfigs)) {
                const roleMap: Record<string, string> = {
                    PEER: "同行",
                    PART_TIME_AGENT: "兼职代理",
                    AGENT: "代理",
                    PART_TIME: "兼职",
                    RETAIL: "零售"
                };
                const channelConfigCache = new Map<string, ChannelConfig>();
                let count = 0;
                for (const c of data.commissionConfigs) {
                    const channelName = roleMap[c.role] || c.role;
                    if (!channelName) continue;

                    let channelConfig = channelConfigCache.get(channelName);
                    if (!channelConfig) {
                        const existing = await tx.channelConfig.findUnique({ where: { name: channelName }, select: { id: true, name: true, settlementByCompleted: true, isEnabled: true, createdAt: true, updatedAt: true } });
                        if (existing) {
                            channelConfig = await tx.channelConfig.update({
                                where: { id: existing.id },
                                data: { settlementByCompleted: true },
                                select: { id: true, name: true, settlementByCompleted: true, isEnabled: true, createdAt: true, updatedAt: true }
                            });
                        } else {
                            channelConfig = await tx.channelConfig.create({
                                data: { name: channelName, settlementByCompleted: true },
                                select: { id: true, name: true, settlementByCompleted: true, isEnabled: true, createdAt: true, updatedAt: true }
                            });
                        }
                        channelConfigCache.set(channelName, channelConfig);
                    }
                    if (c.id) {
                        await tx.commissionRule.upsert({
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
                        await tx.commissionRule.create({
                            data: {
                                type: "QUANTITY",
                                minCount: c.minCount,
                                maxCount: c.maxCount ?? null,
                                percentage: c.percentage,
                                channelConfigId: channelConfig.id
                            }
                        });
                    }
                    count++;
                }
                importedTypes.push(`LegacyCommissionConfigs(${count})`);
            }

            if (data.users && Array.isArray(data.users)) {
                let count = 0;
                for (const u of data.users) {
                    const existingUser = await tx.user.findFirst({
                        where: {
                            username: u.username
                        }
                    });

                    if (existingUser) {
                        await tx.user.update({
                            where: { id: existingUser.id },
                            data: {
                                name: u.name,
                                role: u.role,
                                permissions: typeof u.permissions === 'string' ? u.permissions : JSON.stringify(u.permissions || []),
                                accountGroupId: u.accountGroupId || null
                            }
                        });
                    } else {
                        await tx.user.upsert({
                            where: { id: u.id },
                            update: {
                                username: u.username,
                                name: u.name,
                                role: u.role,
                                permissions: typeof u.permissions === 'string' ? u.permissions : JSON.stringify(u.permissions || []),
                                accountGroupId: u.accountGroupId || null
                            },
                            create: {
                                id: u.id,
                                username: u.username,
                                password: u.password,
                                name: u.name,
                                role: u.role,
                                permissions: typeof u.permissions === 'string' ? u.permissions : JSON.stringify(u.permissions || []),
                                accountGroupId: u.accountGroupId || null
                            }
                        });
                    }
                    count++;
                }
                importedTypes.push(`Users(${count})`);
            }
            
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

            if (data.products && Array.isArray(data.products)) {
                let count = 0;
                for (const p of data.products) {
                    const matchKeywordsValue = p.matchKeywords == null
                        ? null
                        : typeof p.matchKeywords === "string"
                            ? p.matchKeywords
                            : JSON.stringify(p.matchKeywords || [])
                    await tx.product.upsert({
                        where: { id: p.id },
                        update: {
                            name: p.name,
                            variants: typeof p.variants === 'string' ? p.variants : JSON.stringify(p.variants || []),
                            matchKeywords: matchKeywordsValue,
                            totalStock: p.totalStock || 100
                        },
                        create: {
                            id: p.id,
                            name: p.name,
                            variants: typeof p.variants === 'string' ? p.variants : JSON.stringify(p.variants || []),
                            matchKeywords: matchKeywordsValue,
                            totalStock: p.totalStock || 100
                        }
                    });
                    count++;
                }
                importedTypes.push(`Products(${count})`);
            }

            if (data.inventory && typeof data.inventory === 'object') {
                const inv = data.inventory as {
                    warehouses?: { id: string; name: string; isDefault?: boolean }[];
                    itemTypes?: { id: string; name: string; isSerialized: boolean; unit?: string | null; category?: string | null; purchasePrice?: number | null }[];
                    stocks?: { id: string; itemTypeId: string; warehouseId: string; quantity: number }[];
                    items?: { id: string; itemTypeId: string; warehouseId: string; sn?: string | null; status?: string }[];
                };
                const warehouseIdMap = new Map<string, string>();
                const itemTypeIdMap = new Map<string, string>();

                if (inv.warehouses && Array.isArray(inv.warehouses)) {
                    for (const w of inv.warehouses) {
                        const existing = await tx.warehouse.findUnique({ where: { name: w.name } });
                        if (existing) {
                            warehouseIdMap.set(w.id, existing.id);
                        } else {
                            const created = await tx.warehouse.create({
                                data: { id: w.id, name: w.name, isDefault: w.isDefault ?? false }
                            });
                            warehouseIdMap.set(w.id, created.id);
                        }
                    }
                }

                if (inv.itemTypes && Array.isArray(inv.itemTypes)) {
                    for (const t of inv.itemTypes) {
                        const existing = await tx.inventoryItemType.findFirst({ where: { name: t.name } });
                        if (existing) {
                            await tx.inventoryItemType.update({
                                where: { id: existing.id },
                                data: { isSerialized: t.isSerialized, unit: t.unit ?? null, category: t.category ?? null, purchasePrice: t.purchasePrice ?? null }
                            });
                            itemTypeIdMap.set(t.id, existing.id);
                        } else {
                            const created = await tx.inventoryItemType.create({
                                data: { id: t.id, name: t.name, isSerialized: t.isSerialized, unit: t.unit ?? null, category: t.category ?? null, purchasePrice: t.purchasePrice ?? null }
                            });
                            itemTypeIdMap.set(t.id, created.id);
                        }
                    }
                }

                let stockCount = 0;
                if (inv.stocks && Array.isArray(inv.stocks)) {
                    for (const s of inv.stocks) {
                        const itemTypeId = itemTypeIdMap.get(s.itemTypeId) ?? s.itemTypeId;
                        const warehouseId = warehouseIdMap.get(s.warehouseId) ?? s.warehouseId;
                        await tx.inventoryStock.upsert({
                            where: { itemTypeId_warehouseId: { itemTypeId, warehouseId } },
                            update: { quantity: s.quantity },
                            create: { id: s.id, itemTypeId, warehouseId, quantity: s.quantity }
                        });
                        stockCount++;
                    }
                }

                let itemCount = 0;
                if (inv.items && Array.isArray(inv.items)) {
                    for (const i of inv.items) {
                        const itemTypeId = itemTypeIdMap.get(i.itemTypeId) ?? i.itemTypeId;
                        const warehouseId = warehouseIdMap.get(i.warehouseId) ?? i.warehouseId;
                        await tx.inventoryItem.upsert({
                            where: { id: i.id },
                            update: { itemTypeId, warehouseId, sn: i.sn ?? null, status: i.status ?? 'AVAILABLE' },
                            create: { id: i.id, itemTypeId, warehouseId, sn: i.sn ?? null, status: i.status ?? 'AVAILABLE' }
                        });
                        itemCount++;
                    }
                }

                importedTypes.push(`Inventory(warehouses:${warehouseIdMap.size}, itemTypes:${itemTypeIdMap.size}, stocks:${stockCount}, items:${itemCount})`);
            }

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
