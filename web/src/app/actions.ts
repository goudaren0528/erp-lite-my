'use server'

import { getDb, updateDb } from "@/lib/db";
import { Order, OrderStatus, Product, User, Promoter } from "@/types";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";

export async function createOrder(formData: FormData) {
  try {
    return await updateDb(async (db) => {
      const currentUser = await getCurrentUser();
      
      const creatorId = currentUser?.id || 'system'; 
      const creatorName = currentUser?.name || '系统';

      const orderId = Math.random().toString(36).substring(2, 9);
      
      // Simple sequence order number: find max existing numeric part or default to 1000
      const maxOrderNo = db.orders.reduce((max, order) => {
          const num = parseInt(order.orderNo)
          return !isNaN(num) && num > max ? num : max
      }, 1000)
      const orderNo = String(maxOrderNo + 1)

      const rawData = Object.fromEntries(formData.entries());
      
      // Validate dates
      if (rawData.rentStartDate && rawData.returnDeadline) {
          const start = new Date(rawData.rentStartDate as string);
          const deadline = new Date(rawData.returnDeadline as string);
          if (deadline <= start) {
              throw new Error("租期结束日期不能早于开始日期");
          }
      }

      const newOrder: Order = {
        id: orderId,
        orderNo: orderNo,
        source: rawData.source as any,
        platform: rawData.platform as any,
        status: 'PENDING_REVIEW',
        
        customerXianyuId: rawData.customerXianyuId as string,
        sourceContact: rawData.sourceContact as string,
        miniProgramOrderNo: rawData.miniProgramOrderNo as string,
        
        productName: rawData.productName as string,
        variantName: rawData.variantName as string,
        sn: rawData.sn as string,
        
        duration: Number(rawData.duration),
        rentPrice: Number(rawData.rentPrice),
        deposit: Number(rawData.deposit),
        insurancePrice: Number(rawData.insurancePrice),
        totalAmount: Number(rawData.totalAmount),
        
        deliveryTime: rawData.deliveryTime as string,
        returnDeadline: rawData.returnDeadline as string,
        rentStartDate: rawData.rentStartDate as string,
        address: rawData.address as string,
        recipientName: rawData.recipientName as string,
        recipientPhone: rawData.recipientPhone as string,
        
        remark: rawData.remark as string,
        
        creatorId,
        creatorName,
        createdAt: new Date().toISOString(),
        extensions: [],
        logs: [{
          action: '创建订单',
          operator: creatorName,
          timestamp: new Date().toISOString()
        }]
      };

      db.orders.push(newOrder);
      
      revalidatePath('/orders');
      return { success: true, message: "订单创建成功", orderId };
    });
  } catch (error: any) {
    return { success: false, message: error.message || "创建订单失败" };
  }
}

export async function saveUser(user: Partial<User> & { id?: string }) {
    try {
        return await updateDb(async (db) => {
            if (user.id) {
                // Update
                const index = db.users.findIndex(u => u.id === user.id)
                if (index !== -1) {
                    db.users[index] = { ...db.users[index], ...user } as User
                } else {
                    throw new Error("User not found");
                }
            } else {
                // Create
                const newUser: User = {
                    id: Math.random().toString(36).substring(2, 9),
                    name: user.name || '',
                    username: user.username || '',
                    password: user.password || '123456',
                    role: user.role || 'SHIPPING', // Default to SHIPPING
                    permissions: user.permissions || []
                }
                db.users.push(newUser)
            }
            
            revalidatePath('/users')
            return { success: true, message: user.id ? "用户更新成功" : "用户创建成功" };
        })
    } catch (error: any) {
        return { success: false, message: error.message || "保存用户失败" };
    }
}

export async function deleteUser(userId: string) {
    try {
        return await updateDb(async (db) => {
            const userToDelete = db.users.find(u => u.id === userId)
            
            if (userToDelete?.username === 'admin') {
                throw new Error("无法删除超级管理员")
            }

            db.users = db.users.filter(u => u.id !== userId)
            revalidatePath('/users')
            return { success: true, message: "用户删除成功" };
        })
    } catch (error: any) {
        return { success: false, message: error.message || "删除用户失败" };
    }
}


export async function savePromoter(promoter: Partial<Promoter> & { id?: string }) {
    try {
        return await updateDb(async (db) => {
            const currentUser = await getCurrentUser()
            
            if (promoter.id) {
                // Update
                const index = db.promoters.findIndex(p => p.id === promoter.id)
                if (index !== -1) {
                    db.promoters[index] = { ...db.promoters[index], ...promoter } as Promoter
                } else {
                    throw new Error("Promoter not found");
                }
            } else {
                // Create
                const newPromoter: Promoter = {
                    id: Math.random().toString(36).substring(2, 9),
                    name: promoter.name || '',
                    phone: promoter.phone || '',
                    channel: promoter.channel,
                    creatorId: currentUser?.id,
                    createdAt: new Date().toISOString()
                }
                db.promoters.push(newPromoter)
            }
            
            revalidatePath('/promoters')
            revalidatePath('/orders') // Update order form dropdown
            return { success: true, message: promoter.id ? "推广人员更新成功" : "推广人员创建成功" };
        })
    } catch (error: any) {
        return { success: false, message: error.message || "保存推广人员失败" };
    }
}

export async function deletePromoter(promoterId: string) {
    try {
        return await updateDb(async (db) => {
            db.promoters = db.promoters.filter(p => p.id !== promoterId)
            revalidatePath('/promoters')
            revalidatePath('/orders')
            return { success: true, message: "推广人员删除成功" };
        })
    } catch (error: any) {
        return { success: false, message: error.message || "删除推广人员失败" };
    }
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: '待审核',
  PENDING_SHIPMENT: '待发货',
  PENDING_RECEIPT: '待收货',
  RENTING: '待归还',
  OVERDUE: '已逾期',
  RETURNING: '归还中',
  COMPLETED: '已完成',
  BOUGHT_OUT: '已购买',
  CLOSED: '已关闭',
}

export async function updateOrder(orderId: string, formData: FormData) {
    try {
        return await updateDb(async (db) => {
            const orderIndex = db.orders.findIndex(o => o.id === orderId);
            
            if (orderIndex === -1) {
                throw new Error("Order not found");
            }

            const rawData = Object.fromEntries(formData.entries());
            
            // Validate dates
            if (rawData.rentStartDate && rawData.returnDeadline) {
                const start = new Date(rawData.rentStartDate as string);
                const deadline = new Date(rawData.returnDeadline as string);
                if (deadline <= start) {
                    throw new Error("租期结束日期不能早于开始日期");
                }
            }

            const existingOrder = db.orders[orderIndex];

            const updatedOrder: Order = {
                ...existingOrder,
                source: rawData.source as any,
                platform: rawData.platform as any,
                customerXianyuId: rawData.customerXianyuId as string,
                sourceContact: rawData.sourceContact as string,
                miniProgramOrderNo: rawData.miniProgramOrderNo as string,
                productName: rawData.productName as string,
                variantName: rawData.variantName as string,
                sn: rawData.sn as string,
                duration: Number(rawData.duration),
                rentPrice: Number(rawData.rentPrice),
                deposit: Number(rawData.deposit),
                insurancePrice: Number(rawData.insurancePrice),
                totalAmount: Number(rawData.totalAmount),
                address: rawData.address as string,
                recipientName: rawData.recipientName as string,
                recipientPhone: rawData.recipientPhone as string,
                rentStartDate: rawData.rentStartDate as string,
                deliveryTime: rawData.deliveryTime as string,
                returnDeadline: rawData.returnDeadline as string,
                remark: rawData.remark as string,
            };

            // Handle extension modifications (Full replacement from JSON if present)
            const extensionsJSON = rawData.extensionsJSON as string;
            if (extensionsJSON) {
                try {
                    const parsedExtensions = JSON.parse(extensionsJSON);
                    if (Array.isArray(parsedExtensions)) {
                        updatedOrder.extensions = parsedExtensions;
                    }
                } catch (e) {
                    console.error("Failed to parse extensions JSON", e);
                }
            }

            // Handle NEW extension addition (merged into the list)
            const extDays = Number(rawData.extensionDays)
            const extPrice = Number(rawData.extensionPrice)
            
            if (extDays > 0) {
                // Ensure extensions array exists
                if (!updatedOrder.extensions) updatedOrder.extensions = [];
                
                updatedOrder.extensions.push({
                    id: Math.random().toString(36).substring(2, 9),
                    days: extDays,
                    price: extPrice,
                    createdAt: new Date().toISOString()
                })
            }

            db.orders[orderIndex] = updatedOrder;
            
            revalidatePath('/orders');
            return { success: true, message: "订单更新成功" };
        });
    } catch (error: any) {
        return { success: false, message: error.message || "更新订单失败" };
    }
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus) {
  try {
    return await updateDb(async (db) => {
        const currentUser = await getCurrentUser();
        const order = db.orders.find(o => o.id === orderId);
        if (order) {
            const oldStatus = order.status;
            order.status = newStatus;
            
            if (!order.logs) order.logs = [];
            const oldStatusLabel = STATUS_LABELS[oldStatus] || oldStatus;
            const newStatusLabel = STATUS_LABELS[newStatus] || newStatus;
            
            order.logs.push({
                action: '状态变更',
                operator: currentUser?.name || '系统',
                timestamp: new Date().toISOString(),
                details: `${oldStatusLabel} -> ${newStatusLabel}`
            });

            revalidatePath('/orders');
            return { success: true, message: "订单状态更新成功" };
        } else {
            throw new Error("Order not found");
        }
    });
  } catch (error: any) {
    return { success: false, message: error.message || "更新状态失败" };
  }
}

export async function updateOrderRemark(orderId: string, remark: string) {
    try {
        return await updateDb(async (db) => {
            const order = db.orders.find(o => o.id === orderId);
            if (order) {
              order.remark = remark;
              revalidatePath('/orders');
              return { success: true, message: "备注更新成功" };
            } else {
                throw new Error("Order not found");
            }
        });
    } catch (error: any) {
        return { success: false, message: error.message || "更新备注失败" };
    }
  }

export async function updateMiniProgramOrderNo(orderId: string, no: string) {
    try {
        return await updateDb(async (db) => {
            const order = db.orders.find(o => o.id === orderId);
            if (order) {
              order.miniProgramOrderNo = no;
              revalidatePath('/orders');
              return { success: true, message: "小程序单号更新成功" };
            } else {
                throw new Error("Order not found");
            }
        });
    } catch (error: any) {
        return { success: false, message: error.message || "更新小程序单号失败" };
    }
}

export async function extendOrder(orderId: string, days: number, price: number) {
  try {
    return await updateDb(async (db) => {
        const currentUser = await getCurrentUser();
        const order = db.orders.find(o => o.id === orderId);
        if (order) {
            order.extensions.push({
              id: Math.random().toString(36).substring(2, 9),
              days,
              price,
              createdAt: new Date().toISOString()
            });
            
            // Update returnDeadline
            if (order.returnDeadline) {
                 const deadline = new Date(order.returnDeadline);
                 deadline.setDate(deadline.getDate() + days);
                 order.returnDeadline = deadline.toISOString().split('T')[0];
            }
            
            if (!order.logs) order.logs = [];
            order.logs.push({
                action: '续租',
                operator: currentUser?.name || '系统',
                timestamp: new Date().toISOString(),
                details: `续租 ${days} 天，费用 ${price} 元`
            });

            revalidatePath('/orders');
            return { success: true, message: "续租成功" };
        } else {
            throw new Error("Order not found");
        }
    });
  } catch (error: any) {
    return { success: false, message: error.message || "续租失败" };
  }
}

export async function addOverdueFee(orderId: string, fee: number) {
    try {
        return await updateDb(async (db) => {
            const currentUser = await getCurrentUser();
            const order = db.orders.find(o => o.id === orderId);
            if (order) {
                const oldFee = order.overdueFee || 0;
                order.overdueFee = oldFee + fee;
                order.totalAmount = (order.totalAmount || 0) + fee;

                if (!order.logs) order.logs = [];
                order.logs.push({
                    action: '逾期补价',
                    operator: currentUser?.name || '系统',
                    timestamp: new Date().toISOString(),
                    details: `增加违约金 ${fee} 元`
                });

                revalidatePath('/orders');
                return { success: true, message: "补价成功" };
            } else {
                throw new Error("Order not found");
            }
        });
    } catch (error: any) {
        return { success: false, message: error.message || "操作失败" };
    }
}

export async function shipOrder(orderId: string, data: { trackingNumber?: string, logisticsCompany?: string }) {
    try {
        return await updateDb(async (db) => {
            const currentUser = await getCurrentUser();
            const order = db.orders.find(o => o.id === orderId);
            if (order) {
                order.status = 'PENDING_RECEIPT';
                order.trackingNumber = data.trackingNumber || '';
                order.logisticsCompany = data.logisticsCompany || '顺丰速运';
                
                // Set delivery time to today
                order.deliveryTime = new Date().toISOString().split('T')[0];

                if (!order.logs) order.logs = [];
                order.logs.push({
                    action: '发货',
                    operator: currentUser?.name || '系统',
                    timestamp: new Date().toISOString(),
                    details: `${order.logisticsCompany} ${order.trackingNumber}`
                });

                revalidatePath('/orders');
                return { success: true, message: "发货成功" };
            } else {
                throw new Error("Order not found");
            }
        });
    } catch (error: any) {
        return { success: false, message: error.message || "发货失败" };
    }
}

export async function returnOrder(orderId: string, data: { returnTrackingNumber?: string, returnLogisticsCompany?: string }) {
    try {
        return await updateDb(async (db) => {
            const currentUser = await getCurrentUser();
            const order = db.orders.find(o => o.id === orderId);
            if (order) {
                order.status = 'RETURNING';
                order.returnTrackingNumber = data.returnTrackingNumber || '';
                order.returnLogisticsCompany = data.returnLogisticsCompany || '顺丰速运';
                
                if (!order.logs) order.logs = [];
                order.logs.push({
                    action: '归还',
                    operator: currentUser?.name || '系统',
                    timestamp: new Date().toISOString(),
                    details: `${order.returnLogisticsCompany} ${order.returnTrackingNumber}`
                });

                revalidatePath('/orders');
                return { success: true, message: "归还操作成功" };
            } else {
                throw new Error("Order not found");
            }
        });
    } catch (error: any) {
        return { success: false, message: error.message || "归还操作失败" };
    }
}

export async function approveOrder(orderId: string) {
    try {
        return await updateDb(async (db) => {
            const currentUser = await getCurrentUser();
            const order = db.orders.find(o => o.id === orderId);
            if (order) {
                order.status = 'PENDING_SHIPMENT';
                
                if (!order.logs) order.logs = [];
                order.logs.push({
                    action: '审核通过',
                    operator: currentUser?.name || '系统',
                    timestamp: new Date().toISOString()
                });

                revalidatePath('/orders');
                return { success: true, message: "审核通过" };
            } else {
                throw new Error("Order not found");
            }
        });
    } catch (error: any) {
        return { success: false, message: error.message || "操作失败" };
    }
}

export async function rejectOrder(orderId: string) {
    try {
        return await updateDb(async (db) => {
            const currentUser = await getCurrentUser();
            const order = db.orders.find(o => o.id === orderId);
            if (order) {
                order.status = 'CLOSED';
                
                if (!order.logs) order.logs = [];
                order.logs.push({
                    action: '审核拒绝',
                    operator: currentUser?.name || '系统',
                    timestamp: new Date().toISOString(),
                    details: '订单已关闭'
                });

                revalidatePath('/orders');
                return { success: true, message: "已拒绝并关闭订单" };
            } else {
                throw new Error("Order not found");
            }
        });
    } catch (error: any) {
        return { success: false, message: error.message || "操作失败" };
    }
}

export async function closeOrder(orderId: string, remark?: string) {
    try {
        return await updateDb(async (db) => {
            const currentUser = await getCurrentUser();
            const order = db.orders.find(o => o.id === orderId);
            if (order) {
                order.status = 'CLOSED';
                
                if (!order.logs) order.logs = [];
                order.logs.push({
                    action: '关闭订单',
                    operator: currentUser?.name || '系统',
                    timestamp: new Date().toISOString(),
                    details: remark || '无备注'
                });

                revalidatePath('/orders');
                return { success: true, message: "订单已关闭" };
            } else {
                throw new Error("Order not found");
            }
        });
    } catch (error: any) {
        return { success: false, message: error.message || "操作失败" };
    }
}

export async function deleteOrder(orderId: string) {
    try {
        return await updateDb(async (db) => {
            db.orders = db.orders.filter(o => o.id !== orderId);
            revalidatePath('/orders');
            return { success: true, message: "订单删除成功" };
        });
    } catch (error: any) {
        return { success: false, message: error.message || "删除订单失败" };
    }
}

// Product Management Actions
export async function saveProduct(product: Product) {
    try {
        return await updateDb(async (db) => {
            const index = db.products.findIndex(p => p.id === product.id);
            if (index >= 0) {
                db.products[index] = product;
            } else {
                db.products.push(product);
            }
            revalidatePath('/products');
            revalidatePath('/orders'); // Revalidate orders in case product name is used for new orders
            return { success: true, message: "商品保存成功" };
        });
    } catch (error: any) {
        return { success: false, message: error.message || "保存商品失败" };
    }
}

export async function deleteProduct(productId: string) {
    try {
        return await updateDb(async (db) => {
            db.products = db.products.filter(p => p.id !== productId);
            revalidatePath('/products');
            return { success: true, message: "商品删除成功" };
        });
    } catch (error: any) {
        return { success: false, message: error.message || "删除商品失败" };
    }
}
