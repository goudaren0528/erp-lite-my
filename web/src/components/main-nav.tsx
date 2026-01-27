"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LayoutDashboard, List, BarChart, Users, LogOut, User as UserIcon, Package, Shield, Database, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, Percent, ChevronDown, ChevronUp, Megaphone } from "lucide-react"
import { User } from "@/types"
import { logout } from "@/lib/auth"
import { useState } from "react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface MainNavProps {
  user?: User | null
}

export function MainNav({ user }: MainNavProps) {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [openGroups, setOpenGroups] = useState<string[]>(["promotion"])

  if (!user) return null

  const toggleGroup = (group: string) => {
    setOpenGroups(prev => 
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    )
  }

  const allRoutes = [
    {
      href: "/",
      label: "首页",
      icon: LayoutDashboard,
      active: pathname === "/",
      permission: null,
    },
    {
      href: "/orders",
      label: "订单列表",
      icon: List,
      active: pathname === "/orders",
      permission: "orders",
    },
    {
      label: "推广管理",
      icon: Megaphone,
      id: "promotion",
      permission: "promotion_group",
      children: [
        {
          href: "/promoters",
          label: "推广人员",
          icon: Users,
          active: pathname === "/promoters",
          permission: "promoters",
        },
        {
          href: "/commission",
          label: "推广渠道",
          icon: Percent,
          active: pathname === "/commission",
          permission: "commission",
        },
      ]
    },
    {
      label: "结算统计",
      icon: BarChart,
      id: "settlement",
      permission: "settlement_group",
      children: [
        {
          href: "/stats/accounts",
          label: "账号结算",
          icon: UserIcon,
          active: pathname.startsWith("/stats/accounts"),
          permission: "stats_accounts",
        },
        {
          href: "/stats/promoters",
          label: "推广员结算",
          icon: Users,
          active: pathname.startsWith("/stats/promoters"),
          permission: "stats_promoters",
        },
      ]
    },
    {
      href: "/products",
      label: "商品库管理",
      icon: Package,
      active: pathname === "/products",
      permission: "products",
    },
    {
      label: "系统管理",
      icon: Shield,
      id: "system",
      permission: "system_group",
      children: [
        {
          href: "/users",
          label: "账号权限管理",
          icon: UserIcon,
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
    },
  ]

  const hasPermission = (permission: string | null): boolean => {
    if (user.role === 'ADMIN') return true
    
    if (!permission) return true
    if (permission === "promotion_group") {
        return hasPermission("promoters") || hasPermission("commission")
    }
    if (permission === "system_group") {
        return hasPermission("users") || hasPermission("backup")
    }
    if (permission === "settlement_group") {
        return hasPermission("stats_accounts") || hasPermission("stats_promoters")
    }
    return user.permissions && user.permissions.includes(permission)
  }

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
      
      <div className={cn("flex-1 py-4 space-y-2 overflow-y-auto", isCollapsed ? "px-2" : "px-4")}>
        {allRoutes.map((route: any) => {
            if (!hasPermission(route.permission)) return null;

            if (route.children) {
                const isOpen = openGroups.includes(route.id);
                const isActive = route.children.some((child: any) => child.active);
                
                if (isCollapsed) {
                    // When collapsed, just show icon with popover (simplified: just link to first child or show nothing?)
                    // For now, let's just show the children as flat items if collapsed, or just the group icon?
                    // Better UX: Show group icon, hovering shows children. 
                    // MVP: Just flatten children or hide group header.
                    // Let's flatten for collapsed view or just show children directly
                    return route.children.map((child: any) => {
                        if (!hasPermission(child.permission)) return null;
                        return (
                            <div key={child.href} className="relative group">
                                <Link href={child.href}>
                                    <Button
                                        variant={child.active ? "secondary" : "ghost"}
                                        className={cn(
                                            "w-full mb-1 justify-center px-0",
                                            child.active && "bg-white shadow-sm"
                                        )}
                                        title={child.label}
                                    >
                                        <child.icon className="h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        )
                    })
                }

                return (
                    <Collapsible
                        key={route.id}
                        open={isOpen}
                        onOpenChange={() => toggleGroup(route.id)}
                        className="space-y-1"
                    >
                        <CollapsibleTrigger asChild>
                            <Button
                                variant="ghost"
                                className={cn("w-full justify-between font-normal hover:bg-gray-200/50", isActive && "text-primary")}
                            >
                                <span className="flex items-center">
                                    <route.icon className="h-4 w-4 mr-2" />
                                    {route.label}
                                </span>
                                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1 pl-4">
                            {route.children.map((child: any) => {
                                if (!hasPermission(child.permission)) return null;
                                return (
                                    <Link key={child.href} href={child.href}>
                                        <Button
                                            variant={child.active ? "secondary" : "ghost"}
                                            className={cn(
                                                "w-full justify-start h-9",
                                                child.active && "bg-white shadow-sm"
                                            )}
                                        >
                                            <child.icon className="h-4 w-4 mr-2" />
                                            {child.label}
                                        </Button>
                                    </Link>
                                )
                            })}
                        </CollapsibleContent>
                    </Collapsible>
                )
            }

            return (
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
            )
        })}
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
