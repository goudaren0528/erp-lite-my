import { prisma } from "@/lib/db"
import { ProductList } from "@/components/settings/product-list"

type ProductRaw = {
  id: string;
  name: string;
  variants: string;
};

export default async function ProductsPage() {
    const products = await prisma.product.findMany()
    
    const parsedProducts = products.map((p: ProductRaw) => ({
        ...p,
        variants: JSON.parse(p.variants)
    }))

    return (
        <div className="space-y-6 p-8">
            <h2 className="text-3xl font-bold tracking-tight">商品库管理</h2>
            <ProductList products={parsedProducts} />
        </div>
    )
}
