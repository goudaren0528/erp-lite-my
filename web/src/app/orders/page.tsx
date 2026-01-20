import { getDb } from "@/lib/db";
import { OrderTable } from "@/components/orders/order-table";
import { CreateOrderDialog } from "@/components/orders/create-order-dialog";
import { getCurrentUser } from "@/lib/auth";

export default async function OrdersPage() {
  const db = await getDb();
  const currentUser = await getCurrentUser();
  const isAdmin = currentUser?.role === 'ADMIN';
  const canViewAllOrders = isAdmin || currentUser?.permissions?.includes('view_all_orders');
  const canViewAllPromoters = isAdmin || currentUser?.permissions?.includes('view_all_promoters') || canViewAllOrders;

  // Filter orders
  let orders = [...db.orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (!canViewAllOrders) {
    orders = orders.filter(o => o.creatorId === currentUser?.id);
  }

  // Filter promoters for dropdowns
  const promoters = canViewAllPromoters 
    ? db.promoters 
    : db.promoters.filter(p => p.creatorId === currentUser?.id);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">订单列表</h2>
          <p className="text-muted-foreground">查看和管理所有租赁订单。</p>
        </div>
        <CreateOrderDialog products={db.products} promoters={promoters} />
      </div>
      
      <OrderTable orders={orders} products={db.products} users={db.users} promoters={promoters} />
    </div>
  );
}
