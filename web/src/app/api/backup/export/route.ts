import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { format } from "date-fns";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const typesParam = searchParams.get('types');
    const types = typesParam ? typesParam.split(',') : null;
    
    const currentUser = await getCurrentUser();
    
    const exportData: Record<string, unknown> = {};
    
    // Helper to check if type is requested
    const shouldExport = (type: string) => !types || types.includes(type);

    if (shouldExport('users')) {
        const users = await prisma.user.findMany();
        exportData.users = users.map((u: Record<string, unknown> & { permissions: string }) => ({
            ...u,
            permissions: JSON.parse(u.permissions)
        }));
    }

    if (shouldExport('promoters')) {
        exportData.promoters = await prisma.promoter.findMany();
    }

    if (shouldExport('products')) {
        const products = await prisma.product.findMany();
        exportData.products = products.map((p: Record<string, unknown> & { variants: string; matchKeywords: string | null }) => {
            let matchKeywords: unknown = null
            if (p.matchKeywords) {
                try {
                    matchKeywords = JSON.parse(p.matchKeywords)
                } catch {
                    matchKeywords = p.matchKeywords
                }
            }
            return {
                ...p,
                variants: JSON.parse(p.variants),
                matchKeywords
            }
        });
    }

    if (shouldExport('orders')) {
        const batchSize = 500;
        let page = 0;
        const allOrders: unknown[] = [];
        while (true) {
            const batch = await prisma.order.findMany({
                include: { extensions: true, logs: true },
                orderBy: { createdAt: 'asc' },
                skip: page * batchSize,
                take: batchSize
            });
            if (batch.length === 0) {
                break;
            }
            allOrders.push(...batch);
            if (batch.length < batchSize) {
                break;
            }
            page += 1;
        }
        exportData.orders = allOrders;
    }

    if (shouldExport('accountGroups')) {
        exportData.accountGroups = await prisma.accountGroup.findMany();
    }

    if (shouldExport('channelConfigs')) {
        exportData.channelConfigs = await prisma.channelConfig.findMany();
    }

    if (shouldExport('commissionRules')) {
        exportData.commissionRules = await prisma.commissionRule.findMany();
    }

    if (shouldExport('onlineOrdersConfig')) {
        const appConfigClient = (prisma as unknown as { appConfig?: typeof prisma.appConfig }).appConfig
        if (appConfigClient) {
            const record = await appConfigClient.findUnique({ where: { key: "online_orders_sync_config" } })
            if (record?.value) {
                let value: unknown = record.value
                try {
                    value = JSON.parse(record.value)
                } catch {
                    value = record.value
                }
                exportData.onlineOrdersConfig = { key: record.key, value }
            }
        }
    }

    if (shouldExport('backupLogs')) {
        exportData.backupLogs = await prisma.backupLog.findMany();
    }

    // Log the export operation
    await prisma.backupLog.create({
        data: {
            type: 'EXPORT',
            status: 'SUCCESS',
            operator: currentUser?.name || 'Unknown',
            details: types ? `Exported: ${types.join(', ')}` : 'Full Export',
            timestamp: new Date()
        }
    });

    const data = JSON.stringify(exportData, null, 2);
    
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="erp-lite-export-${format(new Date(), 'yyyyMMdd-HHmmss')}.json"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export database' }, { status: 500 });
  }
}
