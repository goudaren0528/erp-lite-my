# 独立抓取工具改造计划

## 背景

当前线上订单抓取（赞晨、诚赁、奥租、优品、零零享、人人租）嵌在 ERP 系统内部，依赖 ERP 的数据库和服务器环境。

目标：将抓取能力抽离为一个**独立的 Electron 桌面工具**，可在本地运行 Playwright 抓取，抓取结果通过 HTTP 推送到 ERP import 接口写入数据库。

**重要原则**：ERP 原有抓取能力完全保留，桌面工具是额外新增的独立工具，不是替代。

---

## 架构方案

```
桌面工具启动
  └─ 填写 ERP URL + API Token（本地 config.json 存储）
  └─ 从 ERP GET /api/online-orders/config 拉取站点配置（账号密码等）
  └─ 展示平台列表，用户点击启动抓取

抓取流程（本地执行）
  └─ 本地 Playwright 抓取各平台订单
  └─ 抓完后序列化为 CSV
  └─ POST /api/online-orders/import（带 Bearer Token）
  └─ ERP 写入数据库，返回结果

配置管理
  └─ 账号密码等配置统一在 ERP 里管理
  └─ 桌面工具只存 ERP URL + Token（本地 config.json）
```

---

## 完成状态

### 一、ERP 侧 ✅

#### API Token 机制
- `web/src/lib/api-token.ts` — Token 生成/验证
- `web/src/app/actions.ts` — `getApiTokenAction`, `generateApiTokenAction`

#### 接口鉴权（Bearer Token）
- `GET /api/online-orders/config` — 支持 Bearer token
- `POST /api/online-orders/import` — 支持 Bearer token
- `POST /api/online-orders/zanchen/sync` — 支持 Bearer token（预留）
- `GET /api/online-orders/zanchen/status` — 支持 Bearer token（预留）
- 逻辑：有 Authorization 头则校验 token，无则走原有 session 鉴权（浏览器正常使用不受影响）

#### 系统设置页 Token 管理 UI
- 位置：`/system/settings`
- 功能：显示/复制/重新生成 Token，显示接口地址
- 导航：系统管理 → 系统设置（仅 ADMIN 可见）

---

### 二、Electron 桌面工具 ✅

#### 目录结构

```
sync-tool/
├── package.json   playwright + vite
├── vite.config.ts
├── tsconfig.json
├── electron/
│   ├── main.ts           # 主进程：IPC handlers
│   └── preload.ts        # contextBridge 暴露 API
└── src/
    ├── main.tsx
    ├── App.tsx            # 侧边栏导航（订单同步 / 连接配置）
    ├── electron.d.ts      # window.electronAPI 类型声明
    ├── index.css
    ├── pages/
    │   ├── Settings.tsx   # ERP URL + Token 配置，测试连接
    │   └── Sync.tsx       # 平台列表 + 触发抓取 + 日志面板
    └── lib/platforms/
        ├── zanchen.ts     # 赞晨（含共享 loadConfig / _appBasePath）
        ├── chenglin.ts    # 诚赁
        ├── aolzu.ts       # 奥租
        ├── youpin.ts      # 优品
        ├── llxzu.ts       # 零零享
        └── rrz.ts         # 人人租
```

#### IPC handlers（electron/main.ts）
| IPC channel | 说明 |
|---|---|
| `config:load` | 读取本地 config.json |
| `config:save` | 保存本地 config.json |
| `erp:fetchConfig` | GET /api/online-orders/config（Bearer） |
| `platform:sync` | 本地 Playwright 抓取 → CSV → POST /api/online-orders/import |
| `erp:importOrders` | 直接推送 CSV 到 ERP（手动用） |
进程 → 渲染进程实时日志推送 |

#### 平台文件迁移要点
- 去掉 prisma / Next.js imports
- `loadConfig()` 从 zanchen 模块共享，通过 `setExternalConfig(cfg)` 注入 ERP 拉取的配置
- `_appBasePath()` 从 zanchen 模块共享，通过 `setAppBasePath(p)` 注入 Electron userData 路径
- `saveOrdersBatch()` 改为收集到 `_collectedOrders` 数组（`getCollectedOrders()` / `clearCollectedOrders()`）
- `existingFinalOrders` prisma 查询替换为空数组（跳过增量停止检测）
- `isEnabled` 检查已移除（sync-tool 里用户手动触发，不需要检查 autoSync.enabled）
- `schedulerLogger` 调用已移除
- TypeScript 编译通过（`npx tsc --noEmit` 无错误）

---

## 待完成

# 本地测试
1. 安装 Playwright 浏览器（首次需要）：
   ```
   cd sync-tool
   npx playwright install chromium
   ```
2. 启动开发模式：
   ```
   cd sync-tool
   npm run electron:dev
   ```
3. 测试流程：
   - 在"连接配置"页填写 ERP URL + Token，点击"测试连接"
   - 切换到"订单同步"页，确认平台列表加载
   - 点击某平台"抓取"，观察日志面板
   - 验证 ERP 数据库是否有新订单写入

### 打包分发
```
cd sync-tool
npm run build
```

---

## 注意事项

- 桌面工具的 Playwright 需要单独安装浏览器：`npx playwright install chromium`
- ERP import 接口无 session 时必须带 Bearer Token，否则 401
- Token 重新生成后，桌面工具需要重新填写新 Token
- 账号密码等敏感信息只存在 ERP 数据库，不落到桌面工具本地
- ERP 原有抓取能力完全保留，桌面工具是额外新增，互不影响
- `fsWrite` 工具在此项目中多次出现写入不生效的问题，需要用 PowerShell `Set-Content` 强制写入
