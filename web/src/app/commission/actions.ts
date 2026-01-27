'use server'

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type CommissionRuleInput = {
  id?: string;
  type?: string;
  minCount: number;
  maxCount: number | null;
  percentage: number;
  target?: string; // USER | PROMOTER
  channelConfigId?: string;
}

// --- Account Groups ---

export async function getAccountGroups() {
  return await prisma.accountGroup.findMany({
    include: {
      rules: {
        orderBy: { minCount: 'asc' }
      },
      users: {
        select: { id: true, name: true, username: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function upsertAccountGroup(data: {
  id?: string;
  name: string;
  description?: string;
  settlementByCompleted?: boolean;
  rules?: CommissionRuleInput[]; // Optional now as we might only update name
  userIds?: string[];
}) {
  try {
    const { id, name, description, settlementByCompleted, rules, userIds } = data;

    if (id) {
      // Update
      const updateData: any = {
        name,
        description,
        settlementByCompleted,
      };

      if (rules) {
        updateData.rules = {
          deleteMany: {}, // Clear old rules
          create: rules.map(r => ({
            type: r.type || "QUANTITY",
            minCount: r.minCount,
            maxCount: r.maxCount,
            percentage: r.percentage,
            target: r.target || "USER",
            channelConfigId: r.channelConfigId
          }))
        };
      }

      if (userIds) {
         updateData.users = {
            disconnect: await prisma.user.findMany({ 
                where: { accountGroupId: id },
                select: { id: true }
            }).then(users => users.map(u => ({ id: u.id }))), 
            connect: userIds.map(uid => ({ id: uid }))
         };
      }

      await prisma.accountGroup.update({
        where: { id },
        data: updateData
      });
    } else {
      // Create
      await prisma.accountGroup.create({
        data: {
          name,
          description,
          settlementByCompleted,
          rules: {
            create: (rules || []).map(r => ({
              type: r.type || "QUANTITY",
              minCount: r.minCount,
              maxCount: r.maxCount,
              percentage: r.percentage,
              target: r.target || "USER",
              channelConfigId: r.channelConfigId
            }))
          },
          users: userIds ? {
            connect: userIds.map(uid => ({ id: uid }))
          } : undefined
        }
      });
    }

    revalidatePath('/commission');
    return { success: true };
  } catch (error: any) {
    console.error("Error saving account group:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteAccountGroup(id: string) {
  try {
    await prisma.accountGroup.delete({ where: { id } });
    revalidatePath('/commission');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- Channel Configs ---

export async function getChannelConfigs() {
  const channels = await prisma.channelConfig.findMany({
    include: {
      rules: {
        orderBy: { minCount: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  try {
      const promoters = await prisma.promoter.findMany({
        select: { id: true, name: true, channel: true }
      });
      const promoterMap = new Map<string, { id: string; name: string }[]>();
      promoters.forEach(p => {
        if (!p.channel) return;
        const list = promoterMap.get(p.channel) || [];
        list.push({ id: p.id, name: p.name });
        promoterMap.set(p.channel, list);
      });

      return channels.map(c => {
        const list = promoterMap.get(c.name) || [];
        return {
          ...c,
          promoterCount: list.length,
          promoters: list
        };
      });
  } catch (e) {
      console.error("Error fetching promoter counts:", e);
      return channels.map(c => ({ ...c, promoterCount: 0, promoters: [] }));
  }
}

export async function upsertChannelConfig(data: {
  id?: string;
  name: string;
  isEnabled?: boolean;
  settlementByCompleted?: boolean;
  rules?: CommissionRuleInput[];
}) {
  try {
    const { id, name, isEnabled, settlementByCompleted, rules } = data;

    if (id) {
      const updateData: any = { name, settlementByCompleted };
      if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
      
      if (rules) {
          updateData.rules = {
            deleteMany: {},
            create: rules.map(r => ({
              type: r.type || "QUANTITY",
              minCount: r.minCount,
              maxCount: r.maxCount,
              percentage: r.percentage
            }))
          };
      }

      await prisma.channelConfig.update({
        where: { id },
        data: updateData
      });
    } else {
      await prisma.channelConfig.create({
        data: {
          name,
          isEnabled: isEnabled ?? true,
          settlementByCompleted,
          rules: {
            create: (rules || []).map(r => ({
              type: r.type || "QUANTITY",
              minCount: r.minCount,
              maxCount: r.maxCount,
              percentage: r.percentage
            }))
          }
        }
      });
    }

    revalidatePath('/commission');
    return { success: true };
  } catch (error: any) {
    console.error("Error saving channel config:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteChannelConfig(id: string) {
  try {
    await prisma.channelConfig.delete({ where: { id } });
    revalidatePath('/commission');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
