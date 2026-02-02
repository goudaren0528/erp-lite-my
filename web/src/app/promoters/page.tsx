import { prisma } from "@/lib/db"
import { PromoterList } from "@/components/promoters/promoter-list"
import { getCurrentUser } from "@/lib/auth"
import { OrderSource, Role } from "@/types"

type PromoterRaw = {
  id: string;
  name: string;
  phone: string | null;
  channel: string | null;
  creatorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type UserRaw = {
  id: string;
  name: string;
  role: string;
  username: string;
  password?: string | null;
  permissions: string;
};

export default async function PromotersPage() {
    const currentUser = await getCurrentUser()

    const isAdmin = currentUser?.role === 'ADMIN'
    const canViewAll = isAdmin || currentUser?.permissions?.includes('view_all_promoters')
    
    const promoters = await prisma.promoter.findMany({
        where: canViewAll ? {} : { creatorId: currentUser?.id },
        orderBy: { createdAt: 'desc' }
    });
    
    const usersRaw = await prisma.user.findMany();
    const users = usersRaw.map((u: UserRaw) => ({
        ...u,
        role: u.role as Role,
        password: u.password ?? undefined,
        permissions: JSON.parse(u.permissions)
    }));

    const channelConfigs = await prisma.channelConfig.findMany({
        orderBy: { createdAt: 'desc' }
    });

    const formattedPromoters = promoters.map((p: any) => ({
        ...p,
        phone: p.phone ?? undefined,
        channel: (p.channel as any) ?? undefined, // Cast to any to avoid type mismatch if OrderSource is strict
        creatorId: p.creatorId ?? undefined,
        channelConfigId: p.channelConfigId ?? undefined,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString()
    }));

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-6">推广人员管理</h1>
            <PromoterList promoters={formattedPromoters} users={users} channels={channelConfigs} />
        </div>
    )
}
