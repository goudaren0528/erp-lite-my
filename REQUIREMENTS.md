# 米奇租赁订单管理后台 - 需求分析文档

## 1. 项目概述
构建一个基于 Next.js 的订单管理后台，用于管理租赁业务。系统需支持多角色协作（管理员、发货员、推广员），核心功能包括快速建单、订单全生命周期管理、商品库管理以及基于阶梯的提成结算统计。

## 2. 角色与权限 (RBAC)

| 角色 | 权限描述 | 可见数据范围 | 关键操作 |
| :--- | :--- | :--- | :--- |
| **Admin (管理员)** | 最高权限 | 所有数据 | 配置菜单、查看结算统计、管理所有订单、商品管理、用户管理 |
| **发货员工** | 订单执行 | 所有订单 | 查看订单详情、修改订单状态（如：待发货->已发货）、备注 |
| **推广员工** | 业务录入 | 仅自己创建的订单 | 创建订单、查看自己订单状态、申请续租（可能） |

## 3. 功能模块详解

### 3.1 快速建单 (Order Creation)
- **订单来源标记**：必须字段，选项包括：
  - 代理
  - 同行
  - 零售
  - 兼职
- **核心表单字段**：
  - 咸鱼号 (客户ID/标识)
  - 机器设备名称 (关联商品库)
  - 版本 (SKU)
  - 租期 (天数)
  - 租金 (自动计算或手动输入)
  - 租机费用 (押金/其他费用?)
  - 送达城市
  - 发货时间
  - 须寄回时间 (根据发货时间+租期自动计算建议值?)
  - 合同签约人
- **交互要求**：
  - 表单需高效，支持键盘操作为佳。
  - 选择商品和版本后，应能联动显示参考价格（基于提供的价格表图片）。

### 3.2 商品库管理 (Product Management)
结合图片价格表分析，商品结构需支持：
- **商品层 (Product)**：型号 (如：大疆pocket3, 三星S23U)。
- **SKU/版本层 (Variant)**：
  - 版本名称 (如：标准版, 长续航, 全能版)。
  - **配件内容**：富文本或多行文本，描述该版本包含的配件。
- **价格配置 (Pricing)**：
  - 基础租金阶梯：1天, 2天, 3天, 5天, 7天, 10天, 15天, 30天。
  - 保险费用：激光险/安心保 (固定金额)。
  - 增值服务：如“长焦增距镜”等单独计费项。

### 3.3 订单列表与管理 (Order Management)
- **列表展示**：
  - 关键列：订单号, 来源, 客户(咸鱼号), 设备信息, 租期, 状态, 备注, 续租状态。
- **快捷操作**：
  - **状态修改**：列表中直接通过下拉菜单修改 (如：待付款, 待发货, 租赁中, 已归还, 已结算)。
  - **备注修改**：列表中点击可直接编辑备注。
- **续租功能 (Extension)**：
  - 触发：修改订单租期时/点击“续租”按钮。
  - 交互：弹窗输入 **续租天数** 和 **续租价格**。
  - 展示：列表需有标识显示该订单有续租，并展示续租详情。

### 3.4 结算与提成 (Settlement & Commission)
- **阶梯提成配置**：
  - 维度：针对不同来源类型 (兼职/代理/零售/同行)。
  - 规则：设置订单数量区间对应提成百分比 (例如：0-10单 5%, 11-30单 8%)。
- **统计报表 (Admin only)**：
  - 按来源/员工统计周期内的订单总数。
  - 根据阶梯规则自动计算提成金额。

## 4. 数据模型设计 (Draft Schema)

### User
- id, username, password_hash, role (ADMIN, SHIPPING, PROMOTER), name

### Product
- id, name (型号), image_url
- Relations: hasMany Variants

### ProductVariant (SKU)
- id, product_id, name (版本), accessories_content (配件内容)
- insurance_price (安心保价格)
- Relations: hasMany PriceRules

### PriceRule (可选，若价格逻辑复杂)
- id, variant_id, duration_days (1,2,3...), price

### Order
- id, order_no
- source_type (AGENT, PEER, RETAIL, PART_TIME)
- creator_id (User)
- customer_xianyu_id (咸鱼号)
- contract_signer (签约人)
- delivery_city, delivery_time, return_deadline
- status (PENDING, DELIVERED, RENTING, RETURNED, COMPLETED, CANCELLED)
- remark
- Total Amount breakdown:
  - base_rent (租金)
  - deposit (租机费用/押金)
  - insurance (保险费)
- Snapshot of Product info (Product Name, Version Name) at time of order

### OrderExtension (续租记录)
- id, order_id, days, price, created_at

### CommissionConfig
- id, target_role (PART_TIME, etc.), min_count, max_count, percentage

## 5. 技术栈规划
- **Framework**: Next.js 14/15 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL (推荐) 或 SQLite (轻量级启动)
- **ORM**: Prisma
- **UI Components**: Shadcn/ui + Tailwind CSS
- **State Management**: React Query (TanStack Query) for server state, Zustand for client state.
- **Auth**: NextAuth.js (Auth.js) v5

