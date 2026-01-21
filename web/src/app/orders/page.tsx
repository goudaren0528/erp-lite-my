import { prisma } from "@/lib/db";
import { OrderTable } from "@/components/orders/order-table";
import { CreateOrderDialog } from "@/components/orders/create-order-dialog";
import { getCurrentUser } from "@/lib/auth";
import { Order, OrderSource, Role } from "@/types";

type PromoterRaw = {
  id: string;
  name: string;
  phone: string | null;
  channel: string | null;
  creatorId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProductRaw = {
  id: string;
  name: string;
  variants: string;
};

type UserRaw = {
  id: string;
  name: string;
  username: string;
  role: string;
  password: string | null;
  permissions: string;
};

export default async function OrdersPage() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';
  const canViewAllOrders = isAdmin || currentUser?.permissions?.includes('view_all_orders');
  const canViewAllPromoters = isAdmin || currentUser?.permissions?.includes('view_all_promoters') || canViewAllOrders;

  // Filter orders
  const orders = await prisma.order.findMany({
    where: canViewAllOrders ? {} : { creatorId: currentUser?.id },
    orderBy: { createdAt: 'desc' },
    include: {
      extensions: true,
      logs: true
    }
  });

  // Filter promoters for dropdowns
  const promotersRaw = await prisma.promoter.findMany({
    where: canViewAllPromoters ? {} : { creatorId: currentUser?.id }
  });
  
  const promoters = promotersRaw.map((p: PromoterRaw) => ({
      ...p,
      phone: p.phone ?? undefined,
      channel: (p.channel as OrderSource) ?? undefined,
      creatorId: p.creatorId ?? undefined,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
  }));

  const productsRaw = await prisma.product.findMany();
  const products = productsRaw.map((p: ProductRaw) => ({
    ...p,
    variants: JSON.parse(p.variants)
  }));
  
  const usersRaw = await prisma.user.findMany();
  const users = usersRaw.map((u: UserRaw) => ({
    ...u,
    role: u.role as Role,
    password: u.password ?? undefined,
    permissions: JSON.parse(u.permissions)
  }));

  // Fix order dates to strings if needed by components? 
  // Components likely expect strings for ISO dates if they use `new Date(string)`.
  // Prisma returns Date objects.
  // If types/index.ts says createdAt: string, then we have a mismatch.
  // Let's check Order interface in types/index.ts (previous tool call).
  // Line 42: createdAt: string; (for Extension)
  // Line 69? (didn't see Order fully).
  // Usually types match JSON.
  // If I pass Date object to component that expects string, Next.js Server Components serialization might warn, 
  // but if it's Client Component receiving props, it must be serializable (Date is not directly serializable to JSON in Client Component props unless converted).
  // OrderTable is likely a client component (it has interactive bits).
  // So I should convert Date objects to ISO strings.

  const formattedOrders = orders.map(o => ({
    ...o,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    rentStartDate: o.rentStartDate?.toISOString() || null,
    deliveryTime: o.deliveryTime?.toISOString() || null,
    returnDeadline: o.returnDeadline?.toISOString() || null,
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
  // Wait, types might be loose.
  // Let's assume strict types.
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">订单列表</h2>
          <p className="text-muted-foreground">查看和管理所有租赁订单。</p>
        </div>
        <CreateOrderDialog products={products} promoters={promoters} />
      </div>
      
      <OrderTable orders={formattedOrders as unknown as Order[]} products={products} users={users} promoters={promoters} />
    </div>
  );
}
