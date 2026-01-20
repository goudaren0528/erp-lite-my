import { NextResponse } from 'next/server';
import { updateDb } from '@/lib/db';
import { OrderStatus } from '@/types';

// Force dynamic to prevent caching
export const dynamic = 'force-dynamic';

// Map external Chinese status to internal Enum
const STATUS_MAP: Record<string, OrderStatus> = {
  '待发货': 'PENDING_SHIPMENT',
  '待收货': 'PENDING_RECEIPT',
  '已发货': 'PENDING_RECEIPT', // Alias
  '待归还': 'RENTING',
  '租赁中': 'RENTING', // Alias
  '已完成': 'COMPLETED',
  '已关闭': 'CLOSED',
  '已取消': 'CLOSED', // Alias
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

    const result = await updateDb((db) => {
      const order = db.orders.find(o => o.miniProgramOrderNo === order_sn);
      
      if (!order) {
        // We throw a specific error to catch it below, but returning null here makes TS unhappy if we want to distinguish 404
        throw new Error(`ORDER_NOT_FOUND`);
      }

      let updated = false;

      // Update status if provided and valid
      if (status && STATUS_MAP[status]) {
        const newStatus = STATUS_MAP[status];
        if (order.status !== newStatus) {
            order.status = newStatus;
            updated = true;
            
            // Add log
            if (!order.logs) order.logs = [];
            order.logs.push({
                action: '外部同步',
                operator: 'system',
                timestamp: new Date().toISOString(),
                details: `状态更新为: ${status}`
            });
        }
      }
      
      // Update logistics info
      if (logistics_company && order.logisticsCompany !== logistics_company) {
        order.logisticsCompany = logistics_company;
        updated = true;
      }
      
      if (tracking_number && order.trackingNumber !== tracking_number) {
        order.trackingNumber = tracking_number;
        updated = true;
      }
      
      if (latest_logistics_info && order.latestLogisticsInfo !== latest_logistics_info) {
        order.latestLogisticsInfo = latest_logistics_info;
        updated = true;
      }

      return { success: true, updated, orderId: order.id };
    });

    return NextResponse.json({
      code: 200,
      message: 'Success',
      data: result
    });

  } catch (error: any) {
    if (error.message === 'ORDER_NOT_FOUND') {
        return NextResponse.json({
            code: 404,
            message: `Order with SN ${request.body} not found` // request body is a stream, can't print it easily here without re-parsing, but error message is enough
        }, { status: 404 });
    }

    return NextResponse.json({
      code: 500,
      message: error.message || 'Internal Server Error'
    }, { status: 500 });
  }
}
