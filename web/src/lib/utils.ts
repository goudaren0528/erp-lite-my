import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Order } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateOrderRevenue(order: Order): number {
  const extensionsTotal = order.extensions?.reduce((acc, ext) => acc + (ext.price || 0), 0) || 0;
  return (order.rentPrice || 0) 
       + (order.insurancePrice || 0) 
       + extensionsTotal 
       + (order.overdueFee || 0);
}
