import { OrderTable } from "@/components/orders/order-table";
import { CreateOrderDialog } from "@/components/orders/create-order-dialog";
import { getCurrentUser } from "@/lib/auth";
import { Order, OrderSource } from "@/types";
import { prisma } from "@/lib/db";
import { fetchOrders } from "@/app/actions";

type PromoterRaw = {
  id: string;
  name: string;
  phone: string | null;
  channel: string | null;
  channelConfigId: string | null;
  creatorId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProductRaw = {
  id: string;
  name: string;
  variants: string;
};

export default async function OrdersPage() {
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';
  const canViewAllOrders = isAdmin || currentUser?.permissions?.includes('view_all_orders');
  const canViewAllPromoters = isAdmin || currentUser?.permissions?.includes('view_all_promoters') || canViewAllOrders;

  // Filter promoters for dropdowns
  const promotersRaw = await prisma.promoter.findMany({
    where: canViewAllPromoters ? {} : { creatorId: currentUser?.id }
  });
  
  const promoters = promotersRaw.map((p: PromoterRaw) => ({
      ...p,
      phone: p.phone ?? undefined,
      channel: (p.channel as OrderSource) ?? undefined,
      channelConfigId: p.channelConfigId ?? undefined,
      creatorId: p.creatorId ?? undefined,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
  }));

  const productsRaw = await prisma.product.findMany();
  const products = productsRaw.map((p: ProductRaw) => ({
    ...p,
    variants: JSON.parse(p.variants)
  }));
  
  const pageSize = 20
  const initialData = await fetchOrders({
    page: 1,
    pageSize,
    sortBy: 'status',
    sortDirection: 'asc'
  })
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">订单列表</h2>
          <p className="text-muted-foreground">查看和管理所有租赁订单。</p>
        </div>
        <CreateOrderDialog products={products} promoters={promoters} />
      </div>
      <OrderTable 
        orders={initialData.orders as unknown as Order[]} 
        products={products} 
        promoters={promoters} 
        initialTotal={initialData.total}
        initialBaseTotal={initialData.baseTotal}
        initialStatusCounts={initialData.statusCounts}
        initialTodayCount={initialData.todayCount}
        initialTodayAmount={initialData.todayAmount}
      />
    </div>
  );
}
