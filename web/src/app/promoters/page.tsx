import { getDb } from "@/lib/db"
import { PromoterList } from "@/components/promoters/promoter-list"
import { getCurrentUser } from "@/lib/auth"

export default async function PromotersPage() {
    const db = await getDb()
    const currentUser = await getCurrentUser()

    const isAdmin = currentUser?.role === 'ADMIN'
    const canViewAll = isAdmin || currentUser?.permissions?.includes('view_all_promoters')
    
    const filteredPromoters = canViewAll 
        ? db.promoters 
        : db.promoters.filter(p => p.creatorId === currentUser?.id)

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-6">推广人员管理</h1>
            <PromoterList promoters={filteredPromoters} users={db.users} />
        </div>
    )
}
