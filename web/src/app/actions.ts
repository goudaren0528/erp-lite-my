'use server'

import { getDb, saveDb } from "@/lib/db";
import { Order, OrderStatus, Product, User, Promoter } from "@/types";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";

export async function createOrder(formData: FormData) {
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
  // Return success indicator or orderId if needed by client component
  return { success: true, orderId };
}

export async function saveUser(user: Partial<User> & { id?: string }) {
    const db = await getDb()
    
    if (user.id) {
        // Update
        const index = db.users.findIndex(u => u.id === user.id)
        if (index !== -1) {
            db.users[index] = { ...db.users[index], ...user } as User
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
}

export async function deleteUser(userId: string) {
    const db = await getDb()
    const userToDelete = db.users.find(u => u.id === userId)
    
    if (userToDelete?.username === 'admin') {
        throw new Error("Cannot delete super admin")
    }

    db.users = db.users.filter(u => u.id !== userId)
    await saveDb(db)
    revalidatePath('/users')
}


export async function savePromoter(promoter: Partial<Promoter> & { id?: string }) {
    const db = await getDb()
    const currentUser = await getCurrentUser()
    
    if (promoter.id) {
        // Update
        const index = db.promoters.findIndex(p => p.id === promoter.id)
        if (index !== -1) {
            db.promoters[index] = { ...db.promoters[index], ...promoter } as Promoter
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
}

export async function deletePromoter(promoterId: string) {
    const db = await getDb()
    db.promoters = db.promoters.filter(p => p.id !== promoterId)
    await saveDb(db)
    revalidatePath('/promoters')
    revalidatePath('/orders')
}

export async function updateOrder(orderId: string, formData: FormData) {
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
    return { success: true };
}

export async function updateOrderStatus(orderId: string, newStatus: OrderStatus) {
  const db = await getDb();
  const order = db.orders.find(o => o.id === orderId);
  if (order) {
    order.status = newStatus;
    await saveDb(db);
    revalidatePath('/orders');
  }
}

export async function updateOrderRemark(orderId: string, remark: string) {
    const db = await getDb();
    const order = db.orders.find(o => o.id === orderId);
    if (order) {
      order.remark = remark;
      await saveDb(db);
      revalidatePath('/orders');
    }
  }

export async function updateMiniProgramOrderNo(orderId: string, no: string) {
    const db = await getDb();
    const order = db.orders.find(o => o.id === orderId);
    if (order) {
      order.miniProgramOrderNo = no;
      await saveDb(db);
      revalidatePath('/orders');
    }
}

export async function extendOrder(orderId: string, days: number, price: number) {
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
  }
}

export async function deleteOrder(orderId: string) {
    const db = await getDb();
    db.orders = db.orders.filter(o => o.id !== orderId);
    await saveDb(db);
    revalidatePath('/orders');
}

// Product Management Actions
export async function saveProduct(product: Product) {
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
}

export async function deleteProduct(productId: string) {
    const db = await getDb();
    db.products = db.products.filter(p => p.id !== productId);
    await saveDb(db);
    revalidatePath('/products');
}



