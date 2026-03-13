import { prisma } from "@/lib/db"
import { randomBytes } from "crypto"

const TOKEN_KEY = "api_token"

export async function getApiToken(): Promise<string | null> {
  const record = await prisma.appConfig.findUnique({ where: { key: TOKEN_KEY } })
  return record?.value ?? null
}

export async function generateApiToken(): Promise<string> {
  const token = randomBytes(32).toString("hex")
  await prisma.appConfig.upsert({
    where: { key: TOKEN_KEY },
    update: { value: token },
    create: { key: TOKEN_KEY, value: token },
  })
  return token
}

/** Validate Bearer token from Authorization header. Returns true if valid. */
export async function validateBearerToken(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false
  const token = authHeader.slice(7)
  const stored = await getApiToken()
  if (!stored) return false
  return token === stored
}
