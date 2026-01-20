"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getDb } from "./db"
import { User } from "@/types"

export async function login(prevState: any, formData: FormData) {
  const username = formData.get("username") as string
  const password = formData.get("password") as string

  if (!username || !password) {
    return { error: "请输入用户名和密码" }
  }

  const db = await getDb()
  const user = db.users.find((u) => u.username === username && u.password === password)

  if (!user) {
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

  const db = await getDb()
  const user = db.users.find((u) => u.id === userId)

  return user || null
}
