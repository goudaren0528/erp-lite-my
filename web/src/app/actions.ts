'use server'

import { prisma } from "@/lib/db";
import { OrderStatus, User, Promoter } from "@/types";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";

export async function createOrder(formData: FormData) {
  try {
      const currentUser = await getCurrentUser();
      
      const creatorId = currentUser?.id || 'system'; 
      const creatorName = currentUser?.name || '系统';

      // Simple sequence order number
      // Note: In high concurrency, this needs a better strategy (e.g. database sequence or transaction)
      // For SQLite/Postgres migration, we could use an atomic increment or just query max.
      // const lastOrder = await prisma.order.findFirst({
      //    orderBy: { createdAt: 'desc' } // heuristic, or try to parse orderNo
      // });
      // Actually we want max(orderNo). But orderNo is string.
      // Let's stick to the logic: find max numeric orderNo.
      // Fetching all orders is bad.
      // Let's assume orderNo is incrementing.
      // For now, let's use a simpler approach or fetch recent ones?
      // fetching all orders ids/orderNos is better than full objects.
      const allOrders = await prisma.order.findMany({ select: { orderNo: true } });
      const maxOrderNo = allOrders.reduce((max: number, o: { orderNo: string }) => {
          const num = parseInt(o.orderNo)
          return !isNaN(num) && num > max ? num : max
      }, 1000)
      const orderNo = String(maxOrderNo + 1)

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

      const order = await prisma.order.create({
        data: {
            orderNo,
            source: rawData.source as string,
            platform: (rawData.platform as string) || null,
            status: 'PENDING_REVIEW',
            
            customerXianyuId: (rawData.customerXianyuId as string) || '',
            sourceContact: (rawData.sourceContact as string) || '',
            miniProgramOrderNo: (rawData.miniProgramOrderNo as string) || null,
            xianyuOrderNo: (rawData.xianyuOrderNo as string) || null,
            
            productName: (rawData.productName as string) || '',
            variantName: (rawData.variantName as string) || '',
            sn: (rawData.sn as string) || null,
            
            duration: Number(rawData.duration) || 0,
            rentPrice: Number(rawData.rentPrice) || 0,
            deposit: Number(rawData.deposit) || 0,
            insurancePrice: Number(rawData.insurancePrice) || 0,
            overdueFee: 0,
            totalAmount: Number(rawData.totalAmount) || 0,
            
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
                    permissions: JSON.stringify(user.permissions || [])
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
                    channel: promoter.channel
                }
            });
        } else {
             await prisma.promoter.create({
                data: {
                    name: promoter.name || '',
                    phone: promoter.phone,
                    channel: promoter.channel,
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

        await prisma.order.update({
            where: { id: orderId },
            data: {
                source: rawData.source as string,
                platform: (rawData.platform as string) || null,
                customerXianyuId: (rawData.customerXianyuId as string) || '',
                sourceContact: (rawData.sourceContact as string) || '',
                miniProgramOrderNo: (rawData.miniProgramOrderNo as string) || null,
                xianyuOrderNo: (rawData.xianyuOrderNo as string) || null,
                
                productName: (rawData.productName as string) || '',
                variantName: (rawData.variantName as string) || '',
                sn: (rawData.sn as string) || null,
                
                duration: Number(rawData.duration) || 0,
                rentPrice: Number(rawData.rentPrice) || 0,
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

export async function updateOrderSourceInfo(orderId: string, source: string, sourceContact: string, platform?: string) {
    try {
        const data: { source: string; sourceContact: string; platform?: string } = {
            source,
            sourceContact,
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
    
    await prisma.order.update({
        where: { id: orderId },
        data: {
            status: newStatus,
            logs: {
                create: {
                    action: '状态变更',
                    operator: currentUser?.name || '系统',
                    desc: `${oldStatusLabel} -> ${newStatusLabel}`
                }
            }
        }
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

export async function saveProduct(product: { id?: string, name: string, variants: unknown[] }) {
    try {
        const variantsStr = JSON.stringify(product.variants || []);
        
        if (product.id) {
            await prisma.product.update({
                where: { id: product.id },
                data: {
                    name: product.name,
                    variants: variantsStr
                }
            });
            revalidatePath('/products');
            return { success: true, message: "商品更新成功" };
        } else {
            await prisma.product.create({
                data: {
                    name: product.name,
                    variants: variantsStr
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

export async function deleteProduct(productId: string) {
    try {
        await prisma.product.delete({ where: { id: productId } });
        return { success: true, message: "商品删除成功" };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: message || "删除商品失败" };
    }
}
