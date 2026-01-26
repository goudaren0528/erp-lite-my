"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LayoutDashboard, List, BarChart, Users, LogOut, User as UserIcon, Package, Shield, Database, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { User } from "@/types"
import { logout } from "@/lib/auth"
import { useState } from "react"

interface MainNavProps {
  user?: User | null
}

export function MainNav({ user }: MainNavProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

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
    <nav className={cn("flex flex-col h-full border-r bg-gray-100 transition-all duration-300", isCollapsed ? "w-16" : "w-64")}>
      <div className={cn("p-4 border-b flex items-center h-[69px] overflow-hidden")}>
        <div 
            className={cn(
                "transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap",
                isCollapsed ? "w-0 opacity-0" : "w-40 opacity-100"
            )}
        >
            <div className="text-xl font-bold mb-1">米奇租赁</div>
            <div className="text-xs text-muted-foreground">ERP Lite</div>
        </div>
        <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 ml-auto shrink-0"
            onClick={() => setIsCollapsed(!isCollapsed)}
        >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>
      
      <div className={cn("flex-1 py-4 space-y-2", isCollapsed ? "px-2" : "px-4")}>
        {routes.map((route) => (
          <div key={route.href} className="relative group">
            <Link
              href={route.href}
              prefetch={route.href.startsWith('/api') ? false : undefined}
            >
              <Button
                variant={route.active ? "secondary" : "ghost"}
                className={cn(
                  "w-full mb-1",
                  route.active && "bg-white shadow-sm",
                  isCollapsed ? "justify-center px-0" : "justify-start"
                )}
              >
                <route.icon className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
                {!isCollapsed && route.label}
              </Button>
            </Link>
            {isCollapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                {route.label}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={cn("p-4 border-t bg-gray-50 transition-all", isCollapsed && "p-2")}>
        <div 
            className={cn(
                "transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap",
                isCollapsed ? "h-0 opacity-0 mb-0" : "h-12 opacity-100 mb-4"
            )}
        >
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 overflow-hidden">
                    <div className="text-sm font-medium truncate">{user.name}</div>
                    <div className="text-xs text-muted-foreground truncate">@{user.username}</div>
                </div>
            </div>
        </div>
        <form action={logout}>
            <Button 
                variant="outline" 
                size="sm" 
                className={cn("w-full text-red-600 hover:text-red-700 hover:bg-red-50", isCollapsed && "px-0 justify-center")}
            >
                <LogOut className={cn("h-4 w-4", !isCollapsed && "mr-2")} /> 
                {!isCollapsed && "退出登录"}
            </Button>
        </form>
      </div>
    </nav>
  )
}
