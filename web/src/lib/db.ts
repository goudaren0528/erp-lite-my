import fs from 'fs/promises';
import path from 'path';
import { DB, Product, User, CommissionConfig } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const PROMOTERS_PATH = path.join(DATA_DIR, 'promoters.json');
const PRODUCTS_PATH = path.join(DATA_DIR, 'products.json');
const ORDERS_PATH = path.join(DATA_DIR, 'orders.json');
const CONFIGS_PATH = path.join(DATA_DIR, 'commission-configs.json');

const INITIAL_DB: DB = {
  users: [
    { id: '1', name: '管理员', username: 'admin', password: '123', role: 'ADMIN', permissions: ['orders', 'promoters', 'stats', 'products', 'commissions', 'users', 'backup'] },
    { id: '2', name: '发货员小张', username: 'shipping', password: '123', role: 'SHIPPING', permissions: ['orders'] },
  ],
  promoters: [
    { id: 'p1', name: '推广员小李', createdAt: new Date().toISOString() },
  ],
  products: [], // Will be populated by seed
  orders: [],
  commissionConfigs: [
    { role: 'PART_TIME', minCount: 0, maxCount: 10, percentage: 5 },
    { role: 'PART_TIME', minCount: 11, maxCount: 100, percentage: 8 },
  ]
};

// Seed initial products based on the user provided image/requirements
const SEED_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: '大疆pocket3',
    variants: [
      {
        name: '标准版',
        accessories: '相机主机+128内存卡+快充数据线+收纳盒+保护套',
        insurancePrice: 30,
        priceRules: { "1": 48, "2": 58, "3": 68, "5": 98, "7": 118, "10": 148, "15": 198, "30": 298 }
      },
      {
        name: '长续航',
        accessories: '相机主机+128内存卡+快充数据线+收纳盒+保护套+续航手柄+三脚架',
        insurancePrice: 30,
        priceRules: { "1": 68, "2": 78, "3": 88, "5": 118, "7": 138, "10": 168, "15": 218, "30": 318 }
      },
      {
        name: '全能版',
        accessories: '长续航的基础上再增加: mic2麦克风、增广镜、磁吸背夹、防风毛套',
        insurancePrice: 30,
        priceRules: { "1": 78, "2": 98, "3": 108, "5": 138, "7": 158, "10": 188, "15": 238, "30": 338 }
      }
    ]
  },
  {
    id: 'p2',
    name: '大疆action5pro',
    variants: [
      {
        name: '标准版',
        accessories: '相机主机+电池+128G内存卡+快拆转接件+镜头保护盖+相机保护框+锁紧螺杆+快充数据线+收纳包',
        insurancePrice: 30,
        priceRules: { "1": 48, "2": 68, "3": 78, "5": 98, "7": 118, "10": 148, "15": 198, "30": 298 }
      }
    ]
  },
  {
    id: 'p3',
    name: '三星S23U',
    variants: [
      {
        name: '标准版',
        accessories: '手机主机+数据线+收纳包+保护壳',
        insurancePrice: 30,
        priceRules: { "1": 69, "2": 89, "3": 108, "5": 135, "7": 170, "10": 248, "15": 323, "30": 498 }
      }
    ]
  },
  {
    id: 'p4',
    name: 'vivoX200U单机',
    variants: [
      {
        name: '标准版',
        accessories: '手机主机+数据线+收纳包+保护壳',
        insurancePrice: 60,
        priceRules: { "1": 138, "2": 158, "3": 178, "5": 208, "7": 228, "10": 268, "15": 348, "30": 688 }
      }
    ]
  },
  {
    id: 'p5',
    name: 'vivoX200U增距镜套装',
    variants: [
      {
        name: '增距镜套装',
        accessories: '手机主机+长焦增距镜+保护壳+镜头转接环+保护盖+数据线+充电器',
        insurancePrice: 60,
        priceRules: { "1": 189, "2": 239, "3": 269, "5": 309, "7": 349, "10": 409, "15": 509, "30": 860 }
      }
    ]
  },
  {
    id: 'p6',
    name: '佳能740',
    variants: [
      {
        name: '标准版',
        accessories: '相机主机+内存卡+保护套+充电器+读卡器+收纳盒 (多加一块电池+10元)',
        insurancePrice: 30,
        priceRules: { "1": 88, "2": 118, "3": 138, "5": 168, "7": 198, "10": 258, "15": 358, "30": 488 }
      }
    ]
  },
  {
    id: 'p7',
    name: 'vivoX300U单机',
    variants: [
      {
        name: '标准版',
        accessories: '手机主机+数据线+收纳包+保护壳',
        insurancePrice: 60,
        priceRules: { "1": 158, "2": 178, "3": 198, "5": 238, "7": 288, "10": 328, "15": 428, "30": 788 }
      }
    ]
  },
  {
    id: 'p8',
    name: 'vivoX300P增距镜套装',
    variants: [
      {
        name: '增距镜套装',
        accessories: '手机主机+长焦增距镜+保护壳+镜头转接环+保护盖+数据线+充电器',
        insurancePrice: 60,
        priceRules: { "1": 208, "2": 248, "3": 278, "5": 338, "7": 398, "10": 458, "15": 728, "30": 998 }
      }
    ]
  },
  {
    id: 'p9',
    name: '大疆action4pro',
    variants: [
      {
        name: '标准版',
        accessories: '相机主机+电池+128G内存卡+快拆转接件+镜头保护盖+相机保护框+锁紧螺杆+快充数据线+收纳包',
        insurancePrice: 30,
        priceRules: { "1": 38, "2": 58, "3": 68, "5": 88, "7": 108, "10": 138, "15": 188, "30": 288 }
      }
    ]
  },
  {
    id: 'p10',
    name: '富士MINI12',
    variants: [
      {
        name: '标准版',
        accessories: '相机主机+收纳盒+保护套+手绳',
        insurancePrice: 30,
        priceRules: { "1": 28, "2": 38, "3": 48, "5": 58, "7": 68, "10": 88, "15": 108, "30": 198 }
      }
    ]
  },
  {
    id: 'p11',
    name: '富士SQ1',
    variants: [
      {
        name: '标准版',
        accessories: '相机主机+收纳盒+保护套+手绳',
        insurancePrice: 30,
        priceRules: { "1": 28, "2": 38, "3": 48, "5": 58, "7": 68, "10": 88, "15": 108, "30": 198 }
      }
    ]
  },
  {
    id: 'p12',
    name: '富士wide300',
    variants: [
      {
        name: '标准版',
        accessories: '相机主机+电池+收纳盒+保护套',
        insurancePrice: 30,
        priceRules: { "1": 58, "2": 68, "3": 78, "5": 98, "7": 118, "10": 148, "15": 198, "30": 348 }
      }
    ]
  },
  {
    id: 'p13',
    name: '富士wide400',
    variants: [
      {
        name: '标准版',
        accessories: '相机主机+收纳盒+保护套+手绳',
        insurancePrice: 30,
        priceRules: { "1": 38, "2": 48, "3": 58, "5": 68, "7": 88, "10": 118, "15": 168, "30": 318 }
      }
    ]
  },
  {
    id: 'p14',
    name: '富士MINI99',
    variants: [
      {
        name: '标准版',
        accessories: '相机主机+收纳盒+保护套+手绳',
        insurancePrice: 30,
        priceRules: { "1": 38, "2": 48, "3": 58, "5": 78, "7": 98, "10": 128, "15": 178, "30": 328 }
      }
    ]
  },
  {
    id: 'p15',
    name: '富士wideEVO',
    variants: [
      {
        name: '标准版',
        accessories: '相机主机+收纳盒+保护套+手绳',
        insurancePrice: 30,
        priceRules: { "1": 38, "2": 46, "3": 58, "5": 68, "7": 88, "10": 118, "15": 168, "30": 198 }
      }
    ]
  },
  {
    id: 'p16',
    name: '单增距镜',
    variants: [
      {
        name: '标准版',
        accessories: '手机壳+增距镜+收纳包',
        insurancePrice: 30,
        priceRules: { "1": 68, "2": 78, "3": 98, "5": 128, "7": 168, "10": 208, "15": 268, "30": 468 }
      }
    ]
  }
];

// Helper to safely read a JSON file
async function readJson<T>(filePath: string, defaultValue: T): Promise<T> {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return defaultValue;
    }
}

export async function getDb(): Promise<DB> {
    try {
        // Check if split files exist (using users.json as indicator)
        await fs.access(USERS_PATH);
        
        const [users, promoters, products, orders, commissionConfigs] = await Promise.all([
            readJson(USERS_PATH, INITIAL_DB.users),
            readJson(PROMOTERS_PATH, INITIAL_DB.promoters),
            readJson(PRODUCTS_PATH, INITIAL_DB.products),
            readJson(ORDERS_PATH, INITIAL_DB.orders),
            readJson(CONFIGS_PATH, INITIAL_DB.commissionConfigs),
        ]);
        
        return { users, promoters, products, orders, commissionConfigs };
    } catch {
        // If split files don't exist, check for legacy db.json
        try {
            const data = await fs.readFile(DB_PATH, 'utf-8');
            const legacyDb = JSON.parse(data) as DB;
            
            // Auto-migrate: save to split files
            // Ensure promoters exist if legacy db didn't have them
            if (!legacyDb.promoters) legacyDb.promoters = INITIAL_DB.promoters;
            
            await saveDb(legacyDb);
            
            return legacyDb;
        } catch {
            // Neither exists. Initialize with seed data.
            const initial = { ...INITIAL_DB, products: SEED_PRODUCTS };
            await saveDb(initial);
            return initial;
        }
    }
}

export async function saveDb(db: DB): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  
  await Promise.all([
      fs.writeFile(USERS_PATH, JSON.stringify(db.users, null, 2), 'utf-8'),
      fs.writeFile(PROMOTERS_PATH, JSON.stringify(db.promoters, null, 2), 'utf-8'),
      fs.writeFile(PRODUCTS_PATH, JSON.stringify(db.products, null, 2), 'utf-8'),
      fs.writeFile(ORDERS_PATH, JSON.stringify(db.orders, null, 2), 'utf-8'),
      fs.writeFile(CONFIGS_PATH, JSON.stringify(db.commissionConfigs, null, 2), 'utf-8'),
  ]);
}
