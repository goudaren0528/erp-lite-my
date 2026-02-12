import { prisma } from "@/lib/db"
import { ProductList } from "@/components/settings/product-list"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"

type ProductRaw = {
  id: string;
  name: string;
  variants: string;
  matchKeywords: string | null;
  specs?: {
    id: string;
    specId: string;
    name: string;
    accessories: string;
    insurancePrice: number;
    priceRules: string;
    bomItems: { itemTypeId: string; quantity: number }[];
  }[];
};

export default async function ProductsPage() {
    const user = await getCurrentUser()
    const canView = user?.role === 'ADMIN' || user?.permissions?.includes('products') || user?.permissions?.includes('product_specs')

    if (!canView) {
        redirect('/')
    }

    const products = await prisma.product.findMany({
        include: {
            specs: {
                include: {
                    bomItems: true
                }
            }
        }
    })
    const itemTypes = await prisma.inventoryItemType.findMany()
    
    const parsedProducts = products.map((p: ProductRaw) => {
        const specs = p.specs || []
        if (specs.length > 0) {
            return {
                id: p.id,
                name: p.name,
                matchKeywords: p.matchKeywords,
                variants: specs.map(spec => ({
                    name: spec.name,
                    accessories: spec.accessories,
                    insurancePrice: spec.insurancePrice,
                    priceRules: JSON.parse(spec.priceRules || "{}"),
                    specId: spec.specId,
                    bomItems: spec.bomItems.map(b => ({ itemTypeId: b.itemTypeId, quantity: b.quantity }))
                }))
            }
        }
        return {
            id: p.id,
            name: p.name,
            matchKeywords: p.matchKeywords,
            variants: JSON.parse(p.variants)
        }
    })

    return (
        <div className="space-y-6 p-8">
            <h2 className="text-3xl font-bold tracking-tight">商品规格管理</h2>
            <ProductList products={parsedProducts} itemTypes={itemTypes} />
        </div>
    )
}
