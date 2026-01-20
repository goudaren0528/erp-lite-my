import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Force dynamic to ensure we always get the latest data
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    
    // Filter orders that have a miniProgramOrderNo
    // You might want to filter out completed/closed orders if synchronization isn't needed for them
    // For now, we return all orders with a mapped SN to ensure full coverage
    const ordersToSync = db.orders
      .filter(order => order.miniProgramOrderNo && order.miniProgramOrderNo.trim() !== '')
      .map(order => order.miniProgramOrderNo as string);

    return NextResponse.json({
      code: 200,
      data: ordersToSync
    });
  } catch (error: any) {
    return NextResponse.json({
      code: 500,
      message: error.message || 'Internal Server Error'
    }, { status: 500 });
  }
}
