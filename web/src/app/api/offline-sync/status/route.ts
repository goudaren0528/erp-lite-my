import { NextRequest, NextResponse } from "next/server"
import { getSyncStatus, ensureScheduler, getLogsFromFile } from "@/lib/offline-sync/service"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get("siteId") || "zanchen"
  const date = searchParams.get("date")
  
  // Ensure scheduler is running (lazy init)
  await ensureScheduler(siteId)
  
  const status = getSyncStatus(siteId)
  
  if (date) {
    // If date is provided, replace logs with file logs
    const fileLogs = getLogsFromFile(siteId, date)
    return NextResponse.json({
      ...status,
      logs: fileLogs
    })
  }
  
  // If no date (live view) and memory logs are empty, try to load today's logs from file
  // This ensures logs are visible even after server restart
  if (status.logs.length === 0) {
      const today = new Date().toISOString().split('T')[0]
      const fileLogs = getLogsFromFile(siteId, today)
      if (fileLogs.length > 0) {
          // Slice to keep reasonable size for payload if file is huge
          const recentLogs = fileLogs.slice(-2000) 
          return NextResponse.json({
              ...status,
              logs: recentLogs
          })
      }
  }
  
  return NextResponse.json(status)
}
