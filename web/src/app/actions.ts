'use server'

import { getDb, saveDb } from "@/lib/db";
import { Order, OrderStatus, Product, User, Promoter } from "@/types";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";

export async function createOrder(formData: FormData) {
  try {
    const db = await getDb();
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
      
      duration: Number(rawData.duration),
      rentPrice: Number(rawData.rentPrice),
      deposit: Number(rawData.deposit),
      insurancePrice: Number(rawData.insurancePrice),
      totalAmount: Number(rawData.totalAmount),
      
      deliveryTime: rawData.deliveryTime as string,
      returnDeadline: rawData.returnDeadline as string,
      rentStartDate: rawData.rentStartDate as string,
      address: rawData.address as string,
      
      remark: rawData.remark as string,
      
      creatorId,
      creatorName,
      createdAt: new Date().toISOString(),
      extensions: []
    };

    db.orders.push(newOrder);
    await saveDb(db);
    
    revalidatePath('/orders');
    return { success: true, message: "订单创建成功", orderId };
  } catch (error: any) {
    return { success: false, message: error.message || "创建订单失败" };
  }
}

export async function saveUser(user: Partial<User> & { id?: string }) {
    try {
        const db = await getDb()
        
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
        
        await saveDb(db)
        revalidatePath('/users')
        return { success: true, message: user.id ? "用户更新成功" : "用户创建成功" };
    } catch (error: any) {
        return { success: false, message: error.message || "保存用户失败" };
    }
}

export async function deleteUser(userId: string) {
    try {
        const db = await getDb()
        const userToDelete = db.users.find(u => u.id === userId)
        
        if (userToDelete?.username === 'admin') {
            throw new Error("无法删除超级管理员")
        }

        db.users = db.users.filter(u => u.id !== userId)
        await saveDb(db)
        revalidatePath('/users')
        return { success: true, message: "用户删除成功" };
    } catch (error: any) {
        return { success: false, message: error.message || "删除用户失败" };
    }
}


export async function savePromoter(promoter: Partial<Promoter> & { id?: string }) {
    try {
        const db = await getDb()
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
                channels: promoter.channels || [],
                creatorId: currentUser?.id,
                createdAt: new Date().toISOString()
            }
            db.promoters.push(newPromoter)
        }
        
        await saveDb(db)
        revalidatePath('/promoters')
        revalidatePath('/orders') // Update order form dropdown
        return { success: true, message: promoter.id ? "推广人员更新成功" : "推广人员创建成功" };
    } catch (error: any) {
        return { success: false, message: error.message || "保存推广人员失败" };
    }
}

export async function deletePromoter(promoterId: string) {
    try {
        const db = await getDb()
        db.promoters = db.promoters.filter(p => p.id !== promoterId)
        await saveDb(db)
        revalidatePath('/promoters')
        revalidatePath('/orders')
        return { success: true, message: "推广人员删除成功" };
    } catch (error: any) {
        return { success: false, message: error.message || "删除推广人员失败" };
    }
}

export async function updateOrder(orderId: string, formData: FormData) {
    try {
        const db = await getDb();
        const orderIndex = db.orders.findIndex(o => o.id === orderId);
        
        if (orderIndex === -1) {
            throw new Error("Order not found");
        }

        const rawData = Object.fromEntries(formData.entries());
        const existingOrder = db.orders[orderIndex];

        const updatedOrder: Order = {
            ...existingOrder,
            source: rawData.source as any,
            customerXianyuId: rawData.customerXianyuId as string,
            sourceContact: rawData.sourceContact as string,
            miniProgramOrderNo: rawData.miniProgramOrderNo as string,
            productName: rawData.productName as string,
            variantName: rawData.variantName as string,
            duration: Number(rawData.duration),
            rentPrice: Number(rawData.rentPrice),
            deposit: Number(rawData.deposit),
            insurancePrice: Number(rawData.insurancePrice),
            totalAmount: Number(rawData.totalAmount),
            address: rawData.address as string,
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
        await saveDb(db);
        revalidatePath('/orders');
        return { success: true, message: "订单更新成功" };
    } catch (error: any) {
        return { success: false, message: error.message || "更新订单失败" };
    }
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus) {
  try {
    const db = await getDb();
    const order = db.orders.find(o => o.id === orderId);
    if (order) {
        order.status = newStatus;
        await saveDb(db);
        revalidatePath('/orders');
        return { success: true, message: "订单状态更新成功" };
    } else {
        throw new Error("Order not found");
    }
  } catch (error: any) {
    return { success: false, message: error.message || "更新状态失败" };
  }
}

export async function updateOrderRemark(orderId: string, remark: string) {
    try {
        const db = await getDb();
        const order = db.orders.find(o => o.id === orderId);
        if (order) {
          order.remark = remark;
          await saveDb(db);
          revalidatePath('/orders');
          return { success: true, message: "备注更新成功" };
        } else {
            throw new Error("Order not found");
        }
    } catch (error: any) {
        return { success: false, message: error.message || "更新备注失败" };
    }
  }

export async function updateMiniProgramOrderNo(orderId: string, no: string) {
    try {
        const db = await getDb();
        const order = db.orders.find(o => o.id === orderId);
        if (order) {
          order.miniProgramOrderNo = no;
          await saveDb(db);
          revalidatePath('/orders');
          return { success: true, message: "小程序单号更新成功" };
        } else {
            throw new Error("Order not found");
        }
    } catch (error: any) {
        return { success: false, message: error.message || "更新小程序单号失败" };
    }
}

export async function extendOrder(orderId: string, days: number, price: number) {
  try {
    const db = await getDb();
    const order = db.orders.find(o => o.id === orderId);
    if (order) {
        order.extensions.push({
          id: Math.random().toString(36).substring(2, 9),
          days,
          price,
          createdAt: new Date().toISOString()
        });
        await saveDb(db);
        revalidatePath('/orders');
        return { success: true, message: "续租成功" };
    } else {
        throw new Error("Order not found");
    }
  } catch (error: any) {
    return { success: false, message: error.message || "续租失败" };
  }
}

export async function shipOrder(orderId: string, data: { trackingNumber: string, logisticsCompany?: string, recipientName?: string, recipientPhone?: string, address?: string }) {
    try {
        const db = await getDb();
        const order = db.orders.find(o => o.id === orderId);
        if (order) {
            order.status = 'PENDING_RECEIPT';
            order.trackingNumber = data.trackingNumber;
            if (data.logisticsCompany) order.logisticsCompany = data.logisticsCompany;
            if (data.recipientName) order.recipientName = data.recipientName;
            if (data.recipientPhone) order.recipientPhone = data.recipientPhone;
            if (data.address) order.address = data.address;
            
            // Set delivery time to today
            order.deliveryTime = new Date().toISOString().split('T')[0];

            await saveDb(db);
            revalidatePath('/orders');
            return { success: true, message: "发货成功" };
        } else {
            throw new Error("Order not found");
        }
    } catch (error: any) {
        return { success: false, message: error.message || "发货失败" };
    }
}

export async function deleteOrder(orderId: string) {
    try {
        const db = await getDb();
        db.orders = db.orders.filter(o => o.id !== orderId);
        await saveDb(db);
        revalidatePath('/orders');
        return { success: true, message: "订单删除成功" };
    } catch (error: any) {
        return { success: false, message: error.message || "删除订单失败" };
    }
}

// Product Management Actions
export async function saveProduct(product: Product) {
    try {
        const db = await getDb();
        const index = db.products.findIndex(p => p.id === product.id);
        if (index >= 0) {
            db.products[index] = product;
        } else {
            db.products.push(product);
        }
        await saveDb(db);
        revalidatePath('/products');
        revalidatePath('/orders'); // Revalidate orders in case product name is used for new orders
        return { success: true, message: "商品保存成功" };
    } catch (error: any) {
        return { success: false, message: error.message || "保存商品失败" };
    }
}

export async function deleteProduct(productId: string) {
    try {
        const db = await getDb();
        db.products = db.products.filter(p => p.id !== productId);
        await saveDb(db);
        revalidatePath('/products');
        return { success: true, message: "商品删除成功" };
    } catch (error: any) {
        return { success: false, message: error.message || "删除商品失败" };
    }
}
