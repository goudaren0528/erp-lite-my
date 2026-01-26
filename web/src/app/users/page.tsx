import { prisma } from "@/lib/db"
import { UserList } from "@/components/settings/user-list"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Role } from "@/types"

type UserRaw = {
  id: string;
  name: string;
  role: string;
  username: string;
  password?: string | null;
  permissions: string;
  accountGroupId?: string | null;
};

export default async function UsersPage() {
    const user = await getCurrentUser()
    
    // Double check permission on server side, though middleware/layout might handle it
    const canManageUsers = user?.permissions?.includes('users') || user?.role === 'ADMIN'
    
    if (!canManageUsers) {
        redirect('/')
    }

    const usersRaw = await prisma.user.findMany();

    const users = usersRaw.map((u: UserRaw) => ({
        ...u,
        role: u.role as Role,
        password: u.password ?? undefined,
        permissions: JSON.parse(u.permissions)
    }));

    return (
        <div className="space-y-6 p-8">
            <h2 className="text-3xl font-bold tracking-tight">账号权限管理</h2>
            <UserList users={users} />
        </div>
    )
}
