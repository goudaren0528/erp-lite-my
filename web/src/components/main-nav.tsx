"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LayoutDashboard, PlusCircle, List, Settings, BarChart, Users, LogOut, User as UserIcon, Package, Shield, Database } from "lucide-react"
import { User } from "@/types"
import { logout } from "@/lib/auth"

interface MainNavProps {
  user?: User | null
}

export function MainNav({ user }: MainNavProps) {
  const pathname = usePathname()

  if (!user) return null

  const allRoutes = [
    {
      href: "/",
      label: "首页",
      icon: LayoutDashboard,
      active: pathname === "/",
      permission: null, // Always allowed
    },
    {
      href: "/orders",
      label: "订单列表",
      icon: List,
      active: pathname === "/orders",
      permission: "orders",
    },
    {
      href: "/promoters",
      label: "推广人员",
      icon: Users,
      active: pathname === "/promoters",
      permission: "promoters",
    },
    {
      href: "/stats",
      label: "结算统计",
      icon: BarChart,
      active: pathname === "/stats",
      permission: "stats",
    },
    {
      href: "/products",
      label: "商品库管理",
      icon: Package,
      active: pathname === "/products",
      permission: "products",
    },

    {
      href: "/users",
      label: "账号权限",
      icon: Shield,
      active: pathname === "/users",
      permission: "users",
    },
    {
       href: "/backup",
       label: "导出导入数据",
       icon: Database,
       active: pathname === "/backup",
       permission: "backup",
     },
  ]

  // Filter routes based on permissions
  // If user has no permissions array (legacy), maybe default to all? 
  // But we set permissions for everyone in users.json.
  // If permission is null, it's public (to authenticated users).
  const routes = allRoutes.filter(route => 
    !route.permission || (user.permissions && user.permissions.includes(route.permission))
  )

  return (
    <nav className="flex flex-col h-full w-64 border-r bg-gray-100">
      <div className="p-4 border-b">
        <div className="text-xl font-bold mb-1">米奇租赁</div>
        <div className="text-xs text-muted-foreground">ERP Lite</div>
      </div>
      
      <div className="flex-1 py-4 space-y-2 px-4">
        {routes.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            prefetch={route.href.startsWith('/api') ? false : undefined}
          >
            <Button
              variant={route.active ? "secondary" : "ghost"}
              className={cn("w-full justify-start mb-1", route.active && "bg-white shadow-sm")}
            >
              <route.icon className="mr-2 h-4 w-4" />
              {route.label}
            </Button>
          </Link>
        ))}
      </div>

      <div className="p-4 border-t bg-gray-50">
        <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 overflow-hidden">
                <div className="text-sm font-medium truncate">{user.name}</div>
                <div className="text-xs text-muted-foreground truncate">@{user.username}</div>
            </div>
        </div>
        <form action={logout}>
            <Button variant="outline" size="sm" className="w-full text-red-600 hover:text-red-700 hover:bg-red-50">
                <LogOut className="mr-2 h-4 w-4" /> 退出登录
            </Button>
        </form>
      </div>
    </nav>
  )
}
