import { getDb } from "@/lib/db"
import { UserList } from "@/components/settings/user-list"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function UsersPage() {
    const db = await getDb()
    const user = await getCurrentUser()
    
    // Double check permission on server side, though middleware/layout might handle it
    const canManageUsers = user?.permissions?.includes('users') || user?.role === 'ADMIN'
    
    if (!canManageUsers) {
        redirect('/')
    }

    return (
        <div className="space-y-6 p-8">
            <h2 className="text-3xl font-bold tracking-tight">账号权限管理</h2>
            <UserList users={db.users} />
        </div>
    )
}
