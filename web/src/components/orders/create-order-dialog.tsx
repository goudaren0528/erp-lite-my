"use client"

import { useState } from "react"
import { Product, User, Promoter } from "@/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus } from "lucide-react"
import { OrderForm } from "./order-form"

interface CreateOrderDialogProps {
  products: Product[]
  promoters?: Promoter[]
}

export function CreateOrderDialog({ products, promoters = [] }: CreateOrderDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> 新建订单
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新建订单</DialogTitle>
        </DialogHeader>
        <OrderForm 
          products={products} 
          promoters={promoters}
          onSuccess={() => setOpen(false)} 
        />
      </DialogContent>
    </Dialog>
  )
}
