import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateOrderRevenue(order: {
  rentPrice?: number | null;
  insurancePrice?: number | null;
  overdueFee?: number | null;
  extensions?: { price: number }[];
}): number {
  const extensionsTotal = order.extensions?.reduce((acc: number, ext) => acc + (ext.price || 0), 0) || 0;
  return (order.rentPrice || 0) 
       + (order.insurancePrice || 0) 
       + extensionsTotal 
       + (order.overdueFee || 0);
}
