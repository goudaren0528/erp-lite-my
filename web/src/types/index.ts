export type Role = 'ADMIN' | 'SHIPPING';

export interface User {
  id: string;
  name: string;
  role: Role; // Keeping for backward compatibility or high-level grouping
  username: string;
  password?: string; // Optional for existing users, but required for login
  permissions: string[]; // List of allowed menu keys: 'orders', 'promoters', 'stats', 'products', 'users'
  accountGroupId?: string | null;
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
  matchKeywords?: string | null; // JSON string array of keywords for auto mapping
}

export type OrderSource = 'AGENT' | 'PEER' | 'RETAIL' | 'PART_TIME' | 'PART_TIME_AGENT';
export type OrderPlatform = 'XIAOHONGSHU' | 'XIANYU' | 'DOUYIN' | 'ZANCHEN' | 'OTHER' | 'OFFLINE';
export type OrderStatus = 
  | 'PENDING_REVIEW' 
  | 'PENDING_SHIPMENT' 
  | 'SHIPPED_PENDING_CONFIRMATION'
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
  promoterId?: string;
  channelId?: string;
  miniProgramOrderNo?: string; // 小程序订单号
  xianyuOrderNo?: string; // 闲鱼订单号
  
  // 设备信息
  productName: string;
  productId?: string;
  variantName: string;
  sn?: string; // SN码
  itemTitle?: string;
  itemSku?: string;
  merchantName?: string;
  
  // 租赁详情
  duration: number; // 天数
  rentPrice: number; // 租金
  deposit: number; // 租机费用/押金
  insurancePrice: number; // 保险费
  overdueFee?: number; // 逾期违约金
  totalAmount: number; // 总金额
  
  // 物流与时间
  address: string; // 送达地址
  recipientName?: string; // 收件人姓名
  recipientPhone?: string; // 收件人电话
  trackingNumber?: string; // 物流单号
  logisticsCompany?: string; // 物流公司
  latestLogisticsInfo?: string; // 最新物流信息 (预留)

  returnTrackingNumber?: string; // 归还物流单号
  returnLogisticsCompany?: string; // 归还物流公司
  returnLatestLogisticsInfo?: string; // 归还最新物流信息 (预留)
  
  rentStartDate?: string | null; // 租期开始日期 (YYYY-MM-DD)
  deliveryTime?: string | null; // 发货时间 (YYYY-MM-DD)
  actualDeliveryTime?: string; // 实际送达时间
  returnDeadline?: string | null; // 须寄回时间 (YYYY-MM-DD)
  
  remark: string;
  
  creatorId: string;
  creatorName: string;
  createdAt: string;
  
  extensions: OrderExtension[];
  
  logs?: OrderLog[];
  screenshot?: string;
}

export interface OrderLog {
  action: string; // e.g., '创建', '发货', '关闭'
  operator: string;
  timestamp: string;
  details?: string;
}

export interface Promoter {
  id: string;
  name: string;
  phone?: string;
  channel?: string;
  channelConfigId?: string;
  creatorId?: string;
  createdAt: string;
}

export interface AccountGroup {
  id: string;
  name: string;
  description?: string | null;
  settlementByCompleted?: boolean;
}

export interface ChannelConfig {
  id: string;
  name: string;
  settlementByCompleted?: boolean;
}

export interface CommissionRule {
  id: string;
  type: string;
  minCount: number;
  maxCount?: number | null;
  percentage: number;
  accountGroupId?: string | null;
  channelConfigId?: string | null;
}

export interface BackupLog {
  id: string;
  type: 'EXPORT' | 'IMPORT';
  status: 'SUCCESS' | 'FAILED';
  operator: string;
  details: string;
  timestamp: string;
}

export interface DB {
  users: User[];
  promoters: Promoter[];
  products: Product[];
  orders: Order[];
  accountGroups: AccountGroup[];
  channelConfigs: ChannelConfig[];
  commissionRules: CommissionRule[];
  backupLogs: BackupLog[];
}
