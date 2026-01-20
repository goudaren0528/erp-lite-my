import { getDb } from "@/lib/db"
import { ProductList } from "@/components/settings/product-list"

export default async function ProductsPage() {
    const db = await getDb()
    return (
        <div className="space-y-6 p-8">
            <h2 className="text-3xl font-bold tracking-tight">商品库管理</h2>
            <ProductList products={db.products} />
        </div>
    )
}
