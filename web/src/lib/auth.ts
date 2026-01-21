"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "./db"
import { Role, User } from "@/types"

export async function login(_prevState: unknown, formData: FormData) {
  void _prevState
  const username = formData.get("username") as string
  const password = formData.get("password") as string

  if (!username || !password) {
    return { error: "请输入用户名和密码" }
  }

  const user = await prisma.user.findUnique({
    where: { username },
  })

  if (!user || user.password !== password) {
    return { error: "用户名或密码错误" }
  }

  const cookieStore = await cookies()
  // In a real app, use a secure session token
  cookieStore.set("userId", user.id, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  redirect("/")
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete("userId")
  redirect("/login")
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const userId = cookieStore.get("userId")?.value

  if (!userId) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!user) {
    return null
  }

  return {
    ...user,
    role: user.role as Role,
    password: user.password ?? undefined,
    permissions: JSON.parse(user.permissions || '[]'),
  }
}
