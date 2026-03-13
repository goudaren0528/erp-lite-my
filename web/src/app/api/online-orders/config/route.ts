import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { CONFIG_KEY, type OnlineOrdersConfig } from "@/lib/online-orders/zanchen"
import { validateBearerToken } from "@/lib/api-token"

export async function GET(req: NextRequest) {
  // Allow session-based access (browser) or Bearer token (desktop tool)
  const authHeader = req.headers.get("authorization")
  if (authHeader) {
    const valid = await validateBearerToken(authHeader)
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const config = await prisma.appConfig.findUnique({
    where: { key: CONFIG_KEY }
  })
  
  if (!config?.value) {
    const defaultConfig: OnlineOrdersConfig = {
      autoSyncEnabled: false,
      interval: 60,
      headless: true,
      nightMode: false,
      nightPeriod: { start: 22, end: 6 },
      webhookUrls: [],
      sites: []
    }
    return NextResponse.json(defaultConfig)
  }
  
  try {
    return NextResponse.json(JSON.parse(config.value))
  } catch {
    return NextResponse.json({})
  }
}

export async function POST(req: NextRequest) {
  // Allow session-based access or Bearer token
  const authHeader = req.headers.get("authorization")
  if (authHeader) {
    const valid = await validateBearerToken(authHeader)
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const data: unknown = await req.json()
    
    // Sanitize incoming data URLs
    const sanitizeUrl = (value: string) => {
        let u = value.trim()
        u = u.replace(/\s+/g, "")
        u = u.replace(/^http\/\//, "http://")
        u = u.replace(/^https\/\//, "https://")
        u = u.replace(/^https?:\/\/(https?:\/\/)/, "$1")
        u = u.replace(/^https?:\/\/(https?)\/\//, "$1://")
        return u
    }
    if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>

        if (Array.isArray(obj.sites)) {
            obj.sites.forEach((site) => {
                if (!site || typeof site !== "object") return
                const siteObj = site as Record<string, unknown>
                const loginUrl = siteObj.loginUrl
                if (typeof loginUrl === "string" && loginUrl.trim()) {
                    siteObj.loginUrl = sanitizeUrl(loginUrl)
                }
            })
        }

        if (Array.isArray(obj.webhookUrls)) {
            obj.webhookUrls = obj.webhookUrls
                .map((url) => (typeof url === "string" ? sanitizeUrl(url) : ""))
                .filter(Boolean)
        }
    }

    // Validate or merge? For now just overwrite or merge top level
    const existing = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } })
    let newConfig = data
    if (existing?.value) {
        try {
            const old = JSON.parse(existing.value)
            if (typeof old === 'object' && old !== null) {
                newConfig = { ...old, ...(data as object) }
            } else {
                newConfig = { ...(data as object) }
            }
        } catch {}
    }

    await prisma.appConfig.upsert({
      where: { key: CONFIG_KEY },
      update: { value: JSON.stringify(newConfig) },
      create: { key: CONFIG_KEY, value: JSON.stringify(newConfig) }
    })
    
    return NextResponse.json(newConfig)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
