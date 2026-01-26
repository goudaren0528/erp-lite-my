import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';

// Map external Chinese status to internal Enum
const STATUS_MAP: Record<string, 'PENDING_SHIPMENT' | 'PENDING_RECEIPT' | 'RENTING' | 'COMPLETED' | 'CLOSED'> = {
  '待发货': 'PENDING_SHIPMENT',
  '待收货': 'PENDING_RECEIPT',
  '已发货': 'PENDING_RECEIPT', // Alias
  '待归还': 'RENTING',
  '租赁中': 'RENTING', // Alias
  '已完成': 'COMPLETED',
  '已关闭': 'CLOSED',
  '已取消': 'CLOSED', // Alias
};

type StatusValue = typeof STATUS_MAP[keyof typeof STATUS_MAP];

type OrderLogCreateInput = {
  action: string;
  operator: string;
  desc: string;
};

type OrderUpdateData = {
  status?: StatusValue;
  logisticsCompany?: string;
  trackingNumber?: string;
  latestLogisticsInfo?: string;
  completedAt?: Date | null;
  logs?: {
    create: OrderLogCreateInput[];
  };
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      order_sn, 
      status, 
      logistics_company, 
      tracking_number, 
      latest_logistics_info 
    } = body;

    if (!order_sn) {
       return NextResponse.json({ code: 400, message: 'Missing order_sn' }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
        where: { miniProgramOrderNo: order_sn }
    });

    if (!order) {
         return NextResponse.json({
            code: 404,
            message: `Order with SN ${order_sn} not found`
        }, { status: 404 });
    }

    let updated = false;
    const dataToUpdate: OrderUpdateData = {};
    const logsToCreate: OrderLogCreateInput[] = [];

    // Update status if provided and valid
    if (status && STATUS_MAP[status]) {
        const newStatus = STATUS_MAP[status];
        if (order.status !== newStatus) {
            dataToUpdate.status = newStatus;
            updated = true;

            if (newStatus === 'COMPLETED' && !order.completedAt) {
                dataToUpdate.completedAt = new Date();
            }
            
            logsToCreate.push({
                action: '外部同步',
                operator: 'system',
                desc: `状态更新为: ${status}`
            });
        }
    }
    
    // Update logistics info
    if (logistics_company && order.logisticsCompany !== logistics_company) {
        dataToUpdate.logisticsCompany = logistics_company;
        updated = true;
    }
    
    if (tracking_number && order.trackingNumber !== tracking_number) {
        dataToUpdate.trackingNumber = tracking_number;
        updated = true;
    }
    
    if (latest_logistics_info && order.latestLogisticsInfo !== latest_logistics_info) {
        dataToUpdate.latestLogisticsInfo = latest_logistics_info;
        updated = true;
    }

    if (updated) {
        if (logsToCreate.length > 0) {
            dataToUpdate.logs = {
                create: logsToCreate
            };
        }
        
        await prisma.order.update({
            where: { id: order.id },
            data: dataToUpdate
        });
    }

    return NextResponse.json({
      code: 200,
      message: 'Success',
      data: { success: true, updated, orderId: order.id }
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({
      code: 500,
      message: message || 'Internal Server Error'
    }, { status: 500 });
  }
}
