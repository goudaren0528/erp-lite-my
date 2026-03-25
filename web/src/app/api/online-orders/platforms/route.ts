import { NextResponse } from "next/server"
import { REGISTERED_PLATFORMS } from "@/lib/online-orders/session-manager"
import { loadConfig } from "@/lib/online-orders/zanchen"

export async function GET() {
  // Load sites from DB config — this is the source of truth for what's configured
  const config = await loadConfig()
  if (config?.sites && config.sites.length > 0) {
    return NextResponse.json({
      platforms: config.sites.map(s => ({ id: s.id, name: s.name }))
    })
  }
  // Fallback to hardcoded list if DB config not available
  return NextResponse.json({ platforms: REGISTERED_PLATFORMS })
}
