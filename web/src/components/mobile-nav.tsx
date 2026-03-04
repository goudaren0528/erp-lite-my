"use client"

import { useState } from "react"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { MainNav } from "@/components/main-nav"
import type { User } from "@/types"

export function MobileNav({ user }: { user: User }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="md:hidden">
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-64">
        <div
          className="h-full"
          onClick={e => {
            const target = e.target as HTMLElement
            if (target.closest("a")) setOpen(false)
          }}
        >
          <MainNav user={user} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

