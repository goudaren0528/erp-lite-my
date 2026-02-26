# 诚赁 (Chenglin) 平台同步功能接入方案

## 1. 总体架构

采用 **“独立工人 + 统一调度”** 的模式。不修改现有的 `zanchen.ts` 核心逻辑，而是为诚赁平台创建独立的执行脚本 `chenglin.ts`，并通过调度器 `scheduler.ts` 进行分发。

## 2. 实施步骤

### 2.1 前端配置增强
*   **文件**: `web/src/app/online-orders/online-orders-client.tsx`
*   **改动**: 在“选择器配置”表单中，新增一个输入框：**“全部订单Tab选择器”** (key: `all_orders_tab_selector`)。
*   **目的**: 诚赁平台进入订单列表后，默认可能不显示所有订单，需要点击特定的 Tab 才能查看。

### 2.2 后端逻辑实现 (Chenglin Worker)
*   **文件**: `web/src/lib/online-orders/chenglin.ts` (新建)
*   **核心流程**:
    1.  **初始化**: 启动/连接浏览器 (Playwright)。
    2.  **登录**: 复用通用的登录检测逻辑，支持验证码等待。
    3.  **导航**: 跳转到订单列表页。
    4.  **Tab 切换 (关键)**: 检查配置中是否有 `all_orders_tab_selector`，若有则点击并等待加载。
    5.  **抓取**: 
        *   适配诚赁的表格结构进行解析。
        *   提取订单号、状态、商品、金额等关键信息。
        *   处理分页。
    6.  **保存**: 写入数据库 `OnlineOrder` 表。

### 2.3 调度器升级 (Scheduler Update)
*   **文件**: `web/src/lib/online-orders/scheduler.ts`
*   **改动**:
    *   引入 `startChenglinSync`。
    *   在任务循环中增加判断分支：
        ```typescript
        if (site.id === 'zanchen') {
            await startZanchenSync(site.id);
        } else if (site.id === 'chenglin' || site.name.includes('诚赁')) {
            await startChenglinSync(site.id);
        }
        ```

## 3. 数据结构映射 (预期)

| 诚赁字段 | 数据库字段 | 备注 |
| :--- | :--- | :--- |
| 订单编号 | orderNo | 唯一标识 |
| 状态 | status | 需映射到系统标准状态 |
| 商品信息 | productName / variantName | 可能需要文本清洗 |
| 租金/押金 | rentPrice / deposit | 数值提取 |
| 收货人 | customerName / recipientPhone | 隐私信息处理 |

## 4. 验证计划
1.  在配置界面添加“诚赁”平台，填写账号密码和选择器。
2.  填写 `all_orders_tab_selector`。
3.  手动触发同步，观察日志：
    *   是否成功登录。
    *   是否点击了 Tab。
    *   是否抓取到了订单数据。
