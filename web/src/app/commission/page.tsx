import { Metadata } from "next";
import { getAccountGroups, getChannelConfigs } from "./actions";
import CommissionClient from "./commission-client";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "推广渠道 - ERP Lite",
};

export default async function CommissionPage() {
  const accountGroups = await getAccountGroups();
  const users = await prisma.user.findMany({
    select: { id: true, name: true, username: true }
  });

  // Ensure default channels exist
  const defaultChannels = ['兼职代理', '同行'];
  for (const name of defaultChannels) {
    const exists = await prisma.channelConfig.findFirst({ where: { name } });
    if (!exists) {
      await prisma.channelConfig.create({
        data: { name }
      });
    }
  }
  
  // Re-fetch channel configs if we potentially created new ones
  const finalChannelConfigs = await getChannelConfigs();

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">推广渠道</h2>
      </div>
      <CommissionClient 
        initialAccountGroups={accountGroups} 
        initialChannelConfigs={finalChannelConfigs} 
        users={users}
      />
    </div>
  );
}
