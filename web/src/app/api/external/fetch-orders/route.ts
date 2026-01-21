import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type OrderWithMiniProgram = {
  miniProgramOrderNo: string | null;
};

// Force dynamic to ensure we always get the latest data
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const orders = await prisma.order.findMany({
        where: {
            miniProgramOrderNo: {
                not: null
            }
        },
        select: {
            miniProgramOrderNo: true
        }
    });
    
    // Filter orders that have a miniProgramOrderNo
    const ordersToSync = orders
      .filter((order: OrderWithMiniProgram) => order.miniProgramOrderNo && order.miniProgramOrderNo.trim() !== '')
      .map((order: OrderWithMiniProgram) => order.miniProgramOrderNo as string);

    return NextResponse.json({
      code: 200,
      data: ordersToSync
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({
      code: 500,
      message: message || 'Internal Server Error'
    }, { status: 500 });
  }
}
