export type Role = 'ADMIN' | 'SHIPPING';

export interface User {
  id: string;
  name: string;
  role: Role; // Keeping for backward compatibility or high-level grouping
  username: string;
  password?: string; // Optional for existing users, but required for login
  permissions: string[]; // List of allowed menu keys: 'orders', 'promoters', 'stats', 'products', 'commissions', 'users'
}

export interface ProductVariant {
  name: string;
  accessories: string; // 配件内容
  insurancePrice: number; // 激光险/安心保
  priceRules: Record<string, number>; // "1": 48, "2": 58...
}

export interface Product {
  id: string;
  name: string; // 型号
  variants: ProductVariant[];
}

export type OrderSource = 'AGENT' | 'PEER' | 'RETAIL' | 'PART_TIME';
export type OrderPlatform = 'XIAOHONGSHU' | 'XIANYU' | 'DOUYIN' | 'OTHER';
export type OrderStatus = 
  | 'PENDING_REVIEW' 
  | 'PENDING_SHIPMENT' 
  | 'PENDING_RECEIPT' 
  | 'RENTING' 
  | 'OVERDUE' 
  | 'RETURNING' 
  | 'COMPLETED' 
  | 'BOUGHT_OUT' 
  | 'CLOSED';

export interface OrderExtension {
  id: string;
  days: number;
  price: number;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNo: string;
  source: OrderSource;
  platform?: OrderPlatform; // 客户来源/平台
  status: OrderStatus;
  
  // 客户信息
  customerXianyuId: string;
  sourceContact: string;
  miniProgramOrderNo?: string; // 小程序订单号
  
  // 设备信息
  productName: string;
  variantName: string;
  
  // 租赁详情
  duration: number; // 天数
  rentPrice: number; // 租金
  deposit: number; // 租机费用/押金
  insurancePrice: number; // 保险费
  totalAmount: number; // 总金额
  
  // 物流与时间
  address: string; // 送达地址
  rentStartDate: string; // 租期开始日期 (YYYY-MM-DD)
  deliveryTime: string; // 发货时间 (YYYY-MM-DD)
  returnDeadline: string; // 须寄回时间 (YYYY-MM-DD)
  
  remark: string;
  
  creatorId: string;
  creatorName: string;
  createdAt: string;
  
  extensions: OrderExtension[];
}

export interface CommissionConfig {
  role: OrderSource; // 针对兼职/代理等
  minCount: number;
  maxCount: number;
  percentage: number;
}

export interface Promoter {
  id: string;
  name: string;
  phone?: string;
  channels?: OrderSource[]; // 推广渠道
  creatorId?: string;
  createdAt: string;
}

export interface DB {
  users: User[];
  promoters: Promoter[];
  products: Product[];
  orders: Order[];
  commissionConfigs: CommissionConfig[];
}
