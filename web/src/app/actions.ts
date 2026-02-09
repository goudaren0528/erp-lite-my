'use server'

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { OrderStatus, User, Promoter, ProductVariant } from "@/types";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";

// Helper to determine query mode based on database type
// SQLite does not support 'insensitive' mode, but Postgres does.
const isPostgres = process.env.DATABASE_URL?.startsWith('postgres');
const dbMode: Prisma.QueryMode | undefined = isPostgres ? 'insensitive' : undefined;

export async function fetchOrdersForExport({
    startDate,
    endDate,
    status
}: {
    startDate?: string;
    endDate?: string;
    status?: string;
}) {
    const currentUser = await getCurrentUser();
    const isAdmin = currentUser?.role === 'ADMIN';
    const canViewAllOrders = isAdmin || currentUser?.permissions?.includes('view_all_orders');
    
    const where: Prisma.OrderWhereInput = {};
    
    // Permission filter
    if (!canViewAllOrders) {
        where.creatorId = currentUser?.id;
    }
    
    // Date filter
    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            where.createdAt.gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setDate(end.getDate() + 1);
            end.setHours(0, 0, 0, 0);
            where.createdAt.lt = end;
        }
    }
    
    // Status filter
    if (status && status !== 'ALL') {
        where.status = status;
    }
    
    const orders = await prisma.order.findMany({
        where,
        include: {
            extensions: true,
            logs: {
                orderBy: { createdAt: 'desc' },
                take: 1
            }
        },
        orderBy: { createdAt: 'desc' }
    });
    
    return orders;
}

export async function createOrder(formData: FormData) {
  try {
      const currentUser = await getCurrentUser();
      
      const creatorId = currentUser?.id || 'system'; 
      const creatorName = currentUser?.name || '系统';

      const now = new Date();
      const orderNo = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      const rawData = Object.fromEntries(formData.entries());
      
      // Validate dates
      let rentStartDate: Date | null = null;
      let returnDeadline: Date | null = null;
      let deliveryTime: Date | null = null;

      if (rawData.rentStartDate) rentStartDate = new Date(rawData.rentStartDate as string);
      if (rawData.returnDeadline) returnDeadline = new Date(rawData.returnDeadline as string);
      if (rawData.deliveryTime) deliveryTime = new Date(rawData.deliveryTime as string);

      if (rentStartDate && returnDeadline) {
          if (returnDeadline <= rentStartDate) {
              throw new Error("租期结束日期不能早于开始日期");
          }
      }

      // Calculate standard price
      let standardPrice = 0;
      const productId = rawData.productId as string;
      const variantName = rawData.variantName as string;
      const duration = Number(rawData.duration);

      if (productId && variantName && duration > 0) {
          standardPrice = await getStandardPrice(productId, variantName, duration);
      }

      const order = await prisma.order.create({
        data: {
            orderNo,
            source: rawData.source as string,
            platform: (rawData.platform as string) || null,
            status: 'PENDING_REVIEW',
            
            customerXianyuId: (rawData.customerXianyuId as string) || '',
            sourceContact: (rawData.sourceContact as string) || '',
            promoterId: (rawData.promoterId as string) || null,
            channelId: (rawData.channelId as string) || null,
            miniProgramOrderNo: (rawData.miniProgramOrderNo as string) || null,
            xianyuOrderNo: (rawData.xianyuOrderNo as string) || null,
            
            productName: (rawData.productName as string) || '',
            productId: (rawData.productId as string) || null,
            variantName: (rawData.variantName as string) || '',
            sn: (rawData.sn as string) || null,
            
            duration: Number(rawData.duration) || 0,
            rentPrice: Number(rawData.rentPrice) || 0,
            deposit: Number(rawData.deposit) || 0,
            insurancePrice: Number(rawData.insurancePrice) || 0,
            overdueFee: 0,
            totalAmount: Number(rawData.totalAmount) || 0,
            standardPrice,
            
            address: (rawData.address as string) || '',
            recipientName: (rawData.recipientName as string) || null,
            recipientPhone: (rawData.recipientPhone as string) || null,
            
            rentStartDate,
            deliveryTime,
            returnDeadline,
            
            remark: (rawData.remark as string) || null,
            screenshot: (rawData.screenshot as string) || null,
            
            creatorId,
            creatorName,
            
            logs: {
                create: [{
                    action: '创建订单',
                    operator: creatorName,
                    desc: '创建订单'
                }]
            }
        }
      });
      
      revalidatePath('/orders');
      return { success: true, message: "订单创建成功", orderId: order.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: message || "创建订单失败" };
  }
}

export async function fetchOrders(params: {
    page: number;
    pageSize: number;
    sortBy: 'status' | 'createdAt';
    sortDirection: 'asc' | 'desc';
    includeSystem?: boolean;
    filterOrderNo?: string;
    filterXianyuOrderNo?: string;
    filterCustomer?: string;
    filterPromoter?: string;
    filterProduct?: string;
    filterCreator?: string;
    filterDuration?: string;
    filterRecipientName?: string;
    filterRecipientPhone?: string;
    filterStatus?: string;
    filterSource?: string;
    filterPlatform?: string;
    startDate?: string;
    endDate?: string;
}) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error("Unauthorized");
    }

    const {
        page,
        pageSize,
        sortBy,
        sortDirection,
        includeSystem,
        filterOrderNo: rawFilterOrderNo,
        filterXianyuOrderNo: rawFilterXianyuOrderNo,
        filterCustomer: rawFilterCustomer,
        filterPromoter: rawFilterPromoter,
        filterProduct: rawFilterProduct,
        filterCreator: rawFilterCreator,
        filterDuration,
        filterRecipientName: rawFilterRecipientName,
        filterRecipientPhone: rawFilterRecipientPhone,
        filterStatus,
        filterSource,
        filterPlatform,
        startDate,
        endDate
    } = params;

    const filterOrderNo = rawFilterOrderNo?.trim();
    const filterXianyuOrderNo = rawFilterXianyuOrderNo?.trim();
    const filterCustomer = rawFilterCustomer?.trim();
    const filterPromoter = rawFilterPromoter?.trim();
    const filterProduct = rawFilterProduct?.trim();
    const filterCreator = rawFilterCreator?.trim();
    const filterRecipientName = rawFilterRecipientName?.trim();
    const filterRecipientPhone = rawFilterRecipientPhone?.trim();

    const isAdmin = currentUser.role === 'ADMIN';
    const canViewAllOrders = isAdmin || currentUser.permissions?.includes('view_all_orders');

    let baseWhere: Prisma.OrderWhereInput = canViewAllOrders ? {} : { creatorId: currentUser.id };

    if (includeSystem) {
        baseWhere = { creatorId: 'system' };
    }

    if (filterOrderNo) {
        baseWhere.OR = [
            { orderNo: { contains: filterOrderNo, mode: dbMode } },
            { miniProgramOrderNo: { contains: filterOrderNo, mode: dbMode } }
        ];
    }

    if (filterXianyuOrderNo) {
        baseWhere.xianyuOrderNo = { contains: filterXianyuOrderNo, mode: dbMode };
    }

    if (filterCustomer) {
        baseWhere.customerXianyuId = { contains: filterCustomer, mode: dbMode };
    }

    if (filterProduct) {
        baseWhere.productName = { contains: filterProduct, mode: dbMode };
    }

    if (filterDuration) {
        const durationNum = Number(filterDuration);
        if (Number.isFinite(durationNum)) {
            baseWhere.duration = durationNum;
        }
    }

    if (filterRecipientName) {
        baseWhere.recipientName = { contains: filterRecipientName, mode: dbMode };
    }

    if (filterRecipientPhone) {
        baseWhere.recipientPhone = { contains: filterRecipientPhone };
    }

    if (filterSource && filterSource !== 'ALL') {
        baseWhere.source = filterSource;
    }

    if (filterPlatform && filterPlatform !== 'ALL') {
        baseWhere.platform = filterPlatform;
    }

    if (startDate || endDate) {
        const createdAt: { gte?: Date; lt?: Date } = {};
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            createdAt.gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setDate(end.getDate() + 1);
            end.setHours(0, 0, 0, 0);
            createdAt.lt = end;
        }
        baseWhere.createdAt = createdAt;
    }

    if (filterCreator) {
        const creatorUsers = await prisma.user.findMany({
            where: {
                name: { contains: filterCreator, mode: dbMode }
            },
            select: { id: true }
        });
        const creatorIds = creatorUsers.map(u => u.id);
        if (creatorIds.length > 0) {
            baseWhere.creatorId = { in: creatorIds };
        } else {
            baseWhere.creatorId = 'no-match';
        }
    }

    if (filterPromoter) {
        const matchedPromoters = await prisma.promoter.findMany({
            where: {
                OR: [
                    { name: { contains: filterPromoter, mode: dbMode } },
                    { phone: { contains: filterPromoter } }
                ]
            },
            select: { id: true, name: true }
        });
        const promoterIds = matchedPromoters.map(p => p.id);
        const promoterNames = matchedPromoters.map(p => p.name);
        baseWhere.OR = [
            ...(baseWhere.OR || []),
            { sourceContact: { contains: filterPromoter, mode: dbMode } },
            ...(promoterIds.length > 0 ? [{ promoterId: { in: promoterIds } }] : []),
            ...(promoterNames.length > 0 ? [{ sourceContact: { in: promoterNames } }] : [])
        ];
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const overdueWhere = {
        status: 'RENTING',
        returnDeadline: { lt: todayStart }
    };

    const baseCount = await prisma.order.count({ where: baseWhere });

    const statusGroups = await prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: baseWhere
    });

    const overdueCount = await prisma.order.count({
        where: {
            ...baseWhere,
            ...overdueWhere
        }
    });

    const statusCounts: Record<string, number> = statusGroups.reduce((acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
    }, {} as Record<string, number>);

    statusCounts.OVERDUE = overdueCount;

    if (statusCounts.RENTING) {
        statusCounts.RENTING = Math.max(0, statusCounts.RENTING - overdueCount);
    }

    const where: Prisma.OrderWhereInput = { ...baseWhere };
    if (filterStatus && filterStatus !== 'ALL') {
        if (filterStatus === 'OVERDUE') {
            where.status = overdueWhere.status;
            where.returnDeadline = overdueWhere.returnDeadline;
        } else {
            where.status = filterStatus;
        }
    }

    const orderBy =
        sortBy === 'createdAt'
            ? { createdAt: sortDirection }
            : { createdAt: sortDirection };

    const [orders, total, todayOrders] = await Promise.all([
        prisma.order.findMany({
            where,
            orderBy,
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { extensions: true, logs: true }
        }),
        prisma.order.count({ where }),
        prisma.order.findMany({
            where: {
                ...baseWhere,
                creatorId: { not: 'system' }, // Exclude online orders
                createdAt: { gte: todayStart, lt: todayEnd }
            },
            select: {
                totalAmount: true,
                extensions: { select: { price: true } }
            }
        })
    ]);

    const formattedOrders = orders.map(o => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        rentStartDate: o.rentStartDate?.toISOString() || null,
        deliveryTime: o.deliveryTime?.toISOString() || null,
        returnDeadline: o.returnDeadline?.toISOString() || null,
        completedAt: o.completedAt?.toISOString() || null,
        extensions: o.extensions.map(e => ({
            ...e,
            createdAt: e.createdAt.toISOString()
        })),
        logs: o.logs.map(l => ({
            ...l,
            timestamp: l.createdAt.toISOString(),
            details: l.desc || undefined,
            createdAt: l.createdAt.toISOString()
        }))
    }));

    const todayAmount = todayOrders.reduce((sum, o) => {
        const extTotal = o.extensions.reduce((acc, e) => acc + e.price, 0);
        return sum + o.totalAmount + extTotal;
    }, 0);

    return {
        orders: formattedOrders,
        total,
        baseTotal: baseCount,
        statusCounts,
        todayCount: todayOrders.length,
        todayAmount
    };
}

export async function saveUser(user: Partial<User> & { id?: string }) {
    try {
        if (user.id) {
            // Update
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    name: user.name,
                    username: user.username,
                    password: user.password,
                    role: user.role,
                    permissions: user.permissions ? JSON.stringify(user.permissions) : undefined
                }
            });
            revalidatePath('/users');
            return { success: true, message: "用户更新成功" };
        } else {
            // Create
            await prisma.user.create({
                data: {
                    name: user.name || '',
                    username: user.username || '',
                    password: user.password || '123456',
                    role: user.role || 'SHIPPING',
                    permissions: JSON.stringify(user.permissions || []),
                    accountGroupId: user.accountGroupId
                }
            });
            revalidatePath('/users');
            return { success: true, message: "用户创建成功" };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "保存用户失败" };
    }
}

export async function deleteUser(userId: string) {
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        
        if (user?.username === 'admin') {
            throw new Error("无法删除超级管理员")
        }

        await prisma.user.delete({ where: { id: userId } });
        revalidatePath('/users');
        return { success: true, message: "用户删除成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "删除用户失败" };
    }
}


export async function savePromoter(promoter: Partial<Promoter> & { id?: string }) {
    try {
        const currentUser = await getCurrentUser()
        
        if (promoter.id) {
            await prisma.promoter.update({
                where: { id: promoter.id },
                data: {
                    name: promoter.name,
                    phone: promoter.phone,
                    channel: promoter.channel,
                    channelConfigId: promoter.channelConfigId
                }
            });
        } else {
             await prisma.promoter.create({
                data: {
                    name: promoter.name || '',
                    phone: promoter.phone,
                    channel: promoter.channel,
                    channelConfigId: promoter.channelConfigId,
                    creatorId: currentUser?.id,
                }
            });
        }
        
        revalidatePath('/promoters')
        revalidatePath('/orders') 
        return { success: true, message: promoter.id ? "推广人员更新成功" : "推广人员创建成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "保存推广人员失败" };
    }
}

export async function deletePromoter(promoterId: string) {
    try {
        await prisma.promoter.delete({ where: { id: promoterId } });
        revalidatePath('/promoters')
        revalidatePath('/orders')
        return { success: true, message: "推广人员删除成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "删除推广人员失败" };
    }
}

async function getStandardPrice(productId: string, variantName: string, duration: number): Promise<number> {
    try {
        const product = await prisma.product.findUnique({
            where: { id: productId }
        });
        if (!product || !product.variants) return 0;
        
        const variants = JSON.parse(product.variants) as ProductVariant[];
        const variant = variants.find(v => v.name === variantName);
        if (!variant || !variant.priceRules) return 0;
        
        const price = variant.priceRules[String(duration)];
        return price || 0;
    } catch (e) {
        console.error("Error calculating standard price:", e);
        return 0;
    }
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: '待审核',
  PENDING_SHIPMENT: '待发货',
  SHIPPED_PENDING_CONFIRMATION: '已发货待确认',
  PENDING_RECEIPT: '待收货',
  RENTING: '待归还',
  OVERDUE: '已逾期',
  RETURNING: '归还中',
  COMPLETED: '已完成',
  BOUGHT_OUT: '已购买',
  CLOSED: '已关闭',
}

interface ExtensionOps {
    deleteMany?: Record<string, never>;
    create?: { days: number; price: number; createdAt: Date }[];
}

export async function updateOrder(orderId: string, formData: FormData) {
    try {
        const rawData = Object.fromEntries(formData.entries());
        
        // Validate dates
        let rentStartDate: Date | null = null;
        let returnDeadline: Date | null = null;
        let deliveryTime: Date | null = null;

        if (rawData.rentStartDate) rentStartDate = new Date(rawData.rentStartDate as string);
        if (rawData.returnDeadline) returnDeadline = new Date(rawData.returnDeadline as string);
        if (rawData.deliveryTime) deliveryTime = new Date(rawData.deliveryTime as string);

        if (rentStartDate && returnDeadline) {
            if (returnDeadline <= rentStartDate) {
                throw new Error("租期结束日期不能早于开始日期");
            }
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { overdueFee: true }
        });
        if (!order) {
            throw new Error("Order not found");
        }

        // Check for duplicate Mini Program Order No
        const miniProgramOrderNo = rawData.miniProgramOrderNo as string;
        if (miniProgramOrderNo && miniProgramOrderNo.trim()) {
            const existingOrder = await prisma.order.findFirst({
                where: {
                    miniProgramOrderNo: miniProgramOrderNo.trim(),
                    id: { not: orderId } // Exclude current order
                }
            });
            if (existingOrder) {
                throw new Error("重复小程序订单号不可录入");
            }
        }

        // Handle extension modifications
        const extensionsJSON = rawData.extensionsJSON as string;
        const extensionOps: ExtensionOps = {};
        
        if (extensionsJSON) {
            try {
                const parsedExtensions = JSON.parse(extensionsJSON);
                if (Array.isArray(parsedExtensions)) {
                    // Replace all extensions
                    extensionOps.deleteMany = {};
                    extensionOps.create = parsedExtensions.map((e: { days: unknown; price: unknown; createdAt?: string }) => ({
                        days: Number(e.days),
                        price: Number(e.price),
                        createdAt: e.createdAt ? new Date(e.createdAt) : new Date()
                    }))
                }
            } catch (e) {
                console.error("Failed to parse extensions JSON", e);
            }
        }

        // Handle NEW extension addition
        const extDays = Number(rawData.extensionDays)
        const extPrice = Number(rawData.extensionPrice)
        
        if (extDays > 0) {
             if (!extensionOps.create) extensionOps.create = [];
             extensionOps.create.push({
                days: extDays,
                price: extPrice,
                createdAt: new Date()
             });
        }

        const totalAmount = Number(rawData.totalAmount) || 0

        // Calculate standard price
        let standardPrice = 0;
        const productId = rawData.productId as string;
        const variantName = rawData.variantName as string;
        const duration = Number(rawData.duration);

        if (productId && variantName && duration > 0) {
            standardPrice = await getStandardPrice(productId, variantName, duration);
        }

        await prisma.order.update({
            where: { id: orderId },
            data: {
                source: rawData.source as string,
                platform: (rawData.platform as string) || null,
                customerXianyuId: (rawData.customerXianyuId as string) || '',
                sourceContact: (rawData.sourceContact as string) || '',
                promoterId: (rawData.promoterId as string) || null,
                channelId: (rawData.channelId as string) || null,
                miniProgramOrderNo: (rawData.miniProgramOrderNo as string) || null,
                xianyuOrderNo: (rawData.xianyuOrderNo as string) || null,
                
                productName: (rawData.productName as string) || '',
                productId: (rawData.productId as string) || null,
                variantName: (rawData.variantName as string) || '',
                sn: (rawData.sn as string) || null,
                
                duration: Number(rawData.duration) || 0,
                rentPrice: Number(rawData.rentPrice) || 0,
                standardPrice,
                deposit: Number(rawData.deposit) || 0,
                insurancePrice: Number(rawData.insurancePrice) || 0,
                overdueFee: Number(rawData.overdueFee) || 0,
                totalAmount,
                
                address: (rawData.address as string) || '',
                recipientName: (rawData.recipientName as string) || null,
                recipientPhone: (rawData.recipientPhone as string) || null,
                
                rentStartDate,
                deliveryTime,
                returnDeadline,
                
                remark: (rawData.remark as string) || null,
                screenshot: (rawData.screenshot as string) || null,
                
                extensions: Object.keys(extensionOps).length > 0 ? extensionOps : undefined
            }
        });

        revalidatePath('/orders');
        return { success: true, message: "订单更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "更新订单失败" };
    }
}

export async function updateOrderSourceInfo(orderId: string, source: string, sourceContact: string, platform?: string, promoterId?: string, channelId?: string) {
    try {
        const data: { source: string; sourceContact: string; platform?: string; promoterId?: string | null; channelId?: string | null } = {
            source,
            sourceContact,
            promoterId: promoterId || null,
            channelId: channelId || null,
        }
        if (platform) {
            data.platform = platform
        }

        await prisma.order.update({
            where: { id: orderId },
            data: {
                ...data,
                logs: {
                    create: {
                        action: '更新推广信息',
                        operator: await getCurrentUser().then(u => u?.name || '系统'),
                        desc: `更新渠道为: ${source}, 推广员为: ${sourceContact}${platform ? `, 推广方式: ${platform}` : ''}`
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "推广信息更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "更新失败" };
    }
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus) {
  try {
    const currentUser = await getCurrentUser();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    
    if (!order) throw new Error("Order not found");

    const oldStatus = order.status;
    const oldStatusLabel = STATUS_LABELS[oldStatus] || oldStatus;
    const newStatusLabel = STATUS_LABELS[newStatus] || newStatus;
    
    const data: { status: OrderStatus; completedAt?: Date | null; logs: { create: { action: string; operator: string; desc: string } } } = {
        status: newStatus,
        logs: {
            create: {
                action: '状态变更',
                operator: currentUser?.name || '系统',
                desc: `${oldStatusLabel} -> ${newStatusLabel}`
            }
        }
    };

    if (newStatus === 'COMPLETED' && !order.completedAt) {
        data.completedAt = new Date();
    }

    await prisma.order.update({
        where: { id: orderId },
        data
    });

    revalidatePath('/orders');
    return { success: true, message: "订单状态更新成功" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: message || "更新状态失败" };
  }
}

export async function updateOrderRemark(orderId: string, remark: string) {
    try {
        await prisma.order.update({
            where: { id: orderId },
            data: { remark }
        });
        revalidatePath('/orders');
        return { success: true, message: "备注更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "更新备注失败" };
    }
}

export async function updateMiniProgramOrderNo(orderId: string, no: string) {
    try {
        const trimmedNo = no?.trim()
        if (trimmedNo && !/^SH\d{20}$/.test(trimmedNo)) {
             throw new Error("小程序订单号格式错误，应为 SH + 20位数字")
        }
        await prisma.order.update({
            where: { id: orderId },
            data: { miniProgramOrderNo: trimmedNo || '' }
        });
        revalidatePath('/orders');
        return { success: true, message: "小程序单号更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "更新小程序单号失败" };
    }
}

export async function updateXianyuOrderNo(orderId: string, no: string) {
    try {
        await prisma.order.update({
            where: { id: orderId },
            data: { xianyuOrderNo: no }
        });
        revalidatePath('/orders');
        return { success: true, message: "闲鱼单号更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "更新闲鱼单号失败" };
    }
}

export async function updateOrderScreenshot(orderId: string, screenshotUrl: string) {
    try {
        await prisma.order.update({
            where: { id: orderId },
            data: { screenshot: screenshotUrl }
        });
        revalidatePath('/orders');
        return { success: true, message: "截图上传成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "截图更新失败" };
    }
}

export async function extendOrder(orderId: string, days: number, price: number) {
  try {
    const currentUser = await getCurrentUser();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    
    if (!order) throw new Error("Order not found");

    let returnDeadline = order.returnDeadline;
    if (returnDeadline) {
         returnDeadline = new Date(returnDeadline);
         returnDeadline.setDate(returnDeadline.getDate() + days);
    }
    
    await prisma.order.update({
        where: { id: orderId },
        data: {
            returnDeadline,
            extensions: {
                create: {
                    days,
                    price
                }
            },
            logs: {
                create: {
                    action: '续租',
                    operator: currentUser?.name || '系统',
                    desc: `续租 ${days} 天，费用 ${price} 元`
                }
            }
        }
    });

    revalidatePath('/orders');
    return { success: true, message: "续租成功" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: message || "续租失败" };
  }
}

export async function deleteOrder(orderId: string) {
    try {
        await prisma.order.delete({ where: { id: orderId } });
        revalidatePath('/orders');
        return { success: true, message: "订单删除成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "删除订单失败" };
    }
}

export async function shipOrder(orderId: string, data: { trackingNumber?: string, logisticsCompany?: string, sn?: string }) {
    try {
        const currentUser = await getCurrentUser();
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'SHIPPED_PENDING_CONFIRMATION',
                trackingNumber: data.trackingNumber,
                logisticsCompany: data.logisticsCompany,
                sn: data.sn,
                actualDeliveryTime: new Date(),
                logs: {
                    create: {
                        action: '发货',
                        operator: currentUser?.name || '系统',
                        desc: `发货: ${data.logisticsCompany || ''} ${data.trackingNumber || ''}${data.sn ? ` SN:${data.sn}` : ''}`
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "发货成功，请确认发货信息" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "发货失败" };
    }
}

export async function confirmShipment(orderId: string) {
    try {
        const currentUser = await getCurrentUser();
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'PENDING_RECEIPT',
                logs: {
                    create: {
                        action: '确认发货',
                        operator: currentUser?.name || '系统',
                        desc: '确认发货信息，等待客户收货'
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "确认成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "确认失败" };
    }
}

export async function returnOrder(orderId: string, data: { returnTrackingNumber?: string, returnLogisticsCompany?: string }) {
    try {
        const currentUser = await getCurrentUser();
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'RETURNING',
                returnTrackingNumber: data.returnTrackingNumber,
                returnLogisticsCompany: data.returnLogisticsCompany,
                logs: {
                    create: {
                        action: '归还',
                        operator: currentUser?.name || '系统',
                        desc: `归还: ${data.returnLogisticsCompany || ''} ${data.returnTrackingNumber || ''}`
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "归还登记成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "归还登记失败" };
    }
}

export async function approveOrder(orderId: string) {
    try {
        const currentUser = await getCurrentUser();
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'PENDING_SHIPMENT',
                logs: {
                    create: {
                        action: '审核通过',
                        operator: currentUser?.name || '系统',
                        desc: '审核通过，等待发货'
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "审核通过" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "审核失败" };
    }
}

export async function rejectOrder(orderId: string) {
    try {
        const currentUser = await getCurrentUser();
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'CLOSED', // or REJECTED if enum allows? Assuming CLOSED for now or check enum
                logs: {
                    create: {
                        action: '审核拒绝',
                        operator: currentUser?.name || '系统',
                        desc: '审核拒绝，订单关闭'
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "审核拒绝" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "操作失败" };
    }
}

export async function closeOrder(orderId: string, remark?: string) {
    try {
        const currentUser = await getCurrentUser();
        await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'CLOSED',
                logs: {
                    create: {
                        action: '关闭订单',
                        operator: currentUser?.name || '系统',
                        desc: remark ? `强制关闭订单: ${remark}` : '强制关闭订单'
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "订单已关闭" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "关闭失败" };
    }
}

export async function addOverdueFee(orderId: string, fee: number) {
    try {
        const currentUser = await getCurrentUser();
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new Error("Order not found");

        const newOverdueFee = (order.overdueFee || 0) + fee;
        const totalAmount = (order.totalAmount || 0) + fee;
        
        await prisma.order.update({
            where: { id: orderId },
            data: {
                overdueFee: newOverdueFee,
                totalAmount,
                logs: {
                    create: {
                        action: '增加逾期费',
                        operator: currentUser?.name || '系统',
                        desc: `增加逾期费: ${fee}, 总计: ${newOverdueFee}`
                    }
                }
            }
        });
        revalidatePath('/orders');
        return { success: true, message: "逾期费更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "操作失败" };
    }
}

export async function saveProduct(product: { id?: string, name: string, variants: unknown[], matchKeywords?: string }) {
    try {
        const variantsStr = JSON.stringify(product.variants || []);
        
        if (product.id) {
            await prisma.product.update({
                where: { id: product.id },
                data: {
                    name: product.name,
                    variants: variantsStr,
                    matchKeywords: product.matchKeywords
                }
            });
            revalidatePath('/products');
            return { success: true, message: "商品更新成功" };
        } else {
            await prisma.product.create({
                data: {
                    name: product.name,
                    variants: variantsStr,
                    matchKeywords: product.matchKeywords
                }
            });
            revalidatePath('/products');
            return { success: true, message: "商品创建成功" };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "保存商品失败" };
    }
}

export async function migrateDeviceMappings() {
    try {
        const rawConfig = await getAppConfigValue("online_orders_sync_config")
        if (!rawConfig) return { success: false, message: "未找到配置" }
        
        const config = JSON.parse(rawConfig)
        const mappings = config.deviceMappings as { keyword: string; deviceName: string }[] | undefined
        
        if (!mappings || !Array.isArray(mappings)) {
            return { success: false, message: "未找到映射配置" }
        }

        const products = await prisma.product.findMany()
        let updatedCount = 0

        for (const product of products) {
            // Find all keywords mapping to this product name
            const productKeywords = mappings
                .filter(m => m.deviceName === product.name)
                .map(m => m.keyword)
                .filter(Boolean)
            
            if (productKeywords.length > 0) {
                // Merge with existing keywords if any
                let existingKeywords: string[] = []
                try {
                    if (product.matchKeywords) {
                        existingKeywords = JSON.parse(product.matchKeywords)
                    }
                } catch {
                    // ignore parse error
                }

                const newKeywords = Array.from(new Set([...existingKeywords, ...productKeywords]))
                
                await prisma.product.update({
                    where: { id: product.id },
                    data: {
                        matchKeywords: JSON.stringify(newKeywords)
                    }
                })
                updatedCount++
            }
        }

        revalidatePath('/products')
        return { success: true, message: `迁移成功，更新了 ${updatedCount} 个商品` }
    } catch (error) {
        console.error(error)
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: "迁移失败: " + message }
    }
}

export async function deleteProduct(productId: string) {
    try {
        await prisma.product.delete({ where: { id: productId } });
        return { success: true, message: "商品删除成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "删除商品失败" };
    }
}

export async function getAppConfigValue(key: string) {
    const appConfig = (prisma as unknown as { appConfig?: typeof prisma.appConfig }).appConfig
    if (!appConfig) {
        return null;
    }
    const config = await appConfig.findUnique({
        where: { key }
    });
    return config?.value ?? null;
}

export async function setAppConfigValue(key: string, value: string) {
    try {
        const currentUser = await getCurrentUser();
        const isAdmin = currentUser?.role === 'ADMIN';
        const canManage = isAdmin || currentUser?.permissions?.includes('online_orders');
        if (!canManage) {
            return { success: false, message: "无权限操作" };
        }
        const appConfig = (prisma as unknown as { appConfig?: typeof prisma.appConfig }).appConfig
        if (!appConfig) {
            return { success: false, message: "配置模块未就绪" };
        }
        await appConfig.upsert({
            where: { key },
            update: { value },
            create: { key, value }
        });
        revalidatePath('/online-orders');
        return { success: true, message: "配置更新成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "配置更新失败" };
    }
}
