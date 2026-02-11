import { NextResponse } from "next/server"
import { getSchedulerStatus } from "@/lib/online-orders/scheduler"

export async function GET() {
  const status = getSchedulerStatus()
  return NextResponse.json(status)
}
