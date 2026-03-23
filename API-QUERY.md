# 订单查询 API 文档

所有接口均为只读（GET），需要在请求头携带 Bearer Token 鉴权。

Token 在系统设置页面生成和查看。

---

## 鉴权

所有请求必须携带：

```
Authorization: Bearer <your-token>
```

---

## 1. 线下订单查询

```
GET /api/orders
```

> 注意：仅返回人工创建的订单，系统自动同步生成的订单（`creatorId = "system"`）不在此接口返回范围内。

### 查询参数

| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码，默认 1 |
| pageSize | number | 每页条数，默认 50，最大 200 |
| status | string | 订单状态，见下方枚举 |
| platform | string | 平台，如 `ZANCHEN` |
| source | string | 来源，如 `RETAIL`、`PEER` |
| orderNo | string | 订单号（模糊匹配） |
| startDate | string | 创建时间起始，格式 `YYYY-MM-DD` |
| endDate | string | 创建时间截止，格式 `YYYY-MM-DD` |

### 状态枚举

| 值 | 说明 |
|----|------|
| PENDING_REVIEW | 待审核 |
| PENDING_SHIPMENT | 待发货 |
| RENTING | 租用中 |
| RETURNING | 归还中 |
| COMPLETED | 已完成 |
| CLOSED | 已关闭 |

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 数据库 UUID |
| orderNo | string | 订单号 |
| source | string | 来源（RETAIL / PEER / PART_TIME_AGENT） |
| platform | string | 平台 |
| status | string | 订单状态 |
| customerXianyuId | string\|null | 客户闲鱼 ID / 昵称 |
| sourceContact | string\|null | 来源联系人 |
| productName | string\|null | 商品名称 |
| variantName | string\|null | 规格名称 |
| sn | string\|null | 设备序列号 |
| duration | number\|null | 租期（天） |
| rentPrice | number\|null | 租金 |
| deposit | number\|null | 押金 |
| insurancePrice | number\|null | 保险费 |
| overdueFee | number\|null | 逾期费 |
| totalAmount | number\|null | 总金额 |
| address | string\|null | 收货地址 |
| recipientName | string\|null | 收件人姓名 |
| recipientPhone | string\|null | 收件人电话 |
| logisticsCompany | string\|null | 发货物流公司 |
| trackingNumber | string\|null | 发货快递单号 |
| latestLogisticsInfo | string\|null | 最新物流信息 |
| returnLogisticsCompany | string\|null | 归还物流公司 |
| returnTrackingNumber | string\|null | 归还快递单号 |
| returnLatestLogisticsInfo | string\|null | 归还最新物流信息 |
| rentStartDate | string\|null | 租期开始日期（ISO 8601） |
| returnDeadline | string\|null | 应还日期（ISO 8601） |
| deliveryTime | string\|null | 预计发货时间（ISO 8601） |
| actualDeliveryTime | string\|null | 实际发货时间（ISO 8601） |
| completedAt | string\|null | 完成时间（ISO 8601） |
| remark | string\|null | 备注 |
| creatorName | string\|null | 创建人姓名 |
| specId | string\|null | 匹配规格的数据库 UUID，未匹配为 null |
| spec | object\|null | 规格信息，未匹配为 null |
| spec.specId | string | 业务规格编号 |
| spec.name | string | 规格名称 |
| createdAt | string | 订单创建时间（ISO 8601） |
| updatedAt | string | 最后更新时间（ISO 8601） |

### 响应示例

```json
{
  "total": 120,
  "page": 1,
  "pageSize": 50,
  "data": [
    {
      "id": "uuid",
      "orderNo": "20260313120000001",
      "source": "RETAIL",
      "platform": "ZANCHEN",
      "status": "RENTING",
      "customerXianyuId": "用户昵称",
      "sourceContact": "联系人",
      "productName": "iPhone 15 Pro",
      "variantName": "256G 黑色",
      "sn": null,
      "duration": 30,
      "rentPrice": 300.0,
      "deposit": 500.0,
      "insurancePrice": 30.0,
      "overdueFee": null,
      "totalAmount": 830.0,
      "address": "广东省深圳市...",
      "recipientName": "张三",
      "recipientPhone": "138****0000",
      "logisticsCompany": "顺丰速运",
      "trackingNumber": "SF1234567890",
      "latestLogisticsInfo": null,
      "returnLogisticsCompany": null,
      "returnTrackingNumber": null,
      "returnLatestLogisticsInfo": null,
      "rentStartDate": "2026-02-01T00:00:00.000Z",
      "returnDeadline": "2026-03-01T00:00:00.000Z",
      "deliveryTime": null,
      "actualDeliveryTime": null,
      "completedAt": null,
      "remark": null,
      "creatorName": "管理员",
      "specId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "spec": {
        "specId": "iphone15pro-256g-black",
        "name": "iPhone 15 Pro 256G 黑色"
      },
      "createdAt": "2026-02-01T08:00:00.000Z",
      "updatedAt": "2026-02-01T08:00:00.000Z"
    }
  ]
}
```

---

## 2. 线上订单查询

```
GET /api/online-orders
```

### 查询参数

| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码，默认 1 |
| pageSize | number | 每页条数，默认 50，最大 200 |
| status | string | 订单状态，见下方枚举 |
| platform | string | 平台，见下方枚举 |
| orderNo | string | 订单号（模糊匹配） |
| startDate | string | 创建时间起始，格式 `YYYY-MM-DD` |
| endDate | string | 创建时间截止，格式 `YYYY-MM-DD` |

### 平台枚举

| 值 | 说明 |
|----|------|
| ZANCHEN | 赞晨 |
| AOLZU | 奥租 |
| LLXZU | 乐乐享租 |
| YOUPIN | 有品 |
| CHENGLIN | 诚林 |
| RRZ | 人人租 |

### 状态枚举

| 值 | 说明 |
|----|------|
| WAIT_PAY | 待付款 |
| PENDING_REVIEW | 待审核 |
| PENDING_SHIPMENT | 待发货 |
| RENTING | 租用中 |
| RETURNING | 归还中 |
| OVERDUE | 已逾期 |
| COMPLETED | 已完成 |
| BOUGHT_OUT | 已买断 |
| CLOSED | 已关闭 |

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 数据库 UUID |
| orderNo | string | 订单号 |
| platform | string | 平台（见平台枚举） |
| status | string | 订单状态（见状态枚举） |
| merchantName | string\|null | 商户名称 |
| productName | string\|null | 商品名称 |
| variantName | string\|null | 规格名称 |
| itemTitle | string\|null | 平台商品标题（原始） |
| itemSku | string\|null | 平台 SKU（原始） |
| totalAmount | number\|null | 总金额 |
| rentPrice | number\|null | 租金 |
| deposit | number\|null | 押金 |
| insurancePrice | number\|null | 保险费 |
| duration | number\|null | 租期（天） |
| promotionChannel | string\|null | 推广渠道 |
| source | string\|null | 来源（RETAIL / PEER 等） |
| customerName | string\|null | 客户姓名 |
| recipientPhone | string\|null | 收件人电话 |
| address | string\|null | 收货地址 |
| logisticsCompany | string\|null | 发货物流公司 |
| trackingNumber | string\|null | 发货快递单号 |
| latestLogisticsInfo | string\|null | 最新物流信息 |
| returnLogisticsCompany | string\|null | 归还物流公司 |
| returnTrackingNumber | string\|null | 归还快递单号 |
| returnLatestLogisticsInfo | string\|null | 归还最新物流信息 |
| rentStartDate | string\|null | 租期开始日期（ISO 8601） |
| returnDeadline | string\|null | 应还日期（ISO 8601） |
| manualSn | string\|null | 手动录入的设备序列号 |
| specId | string\|null | 匹配规格的数据库 UUID，未匹配为 null |
| spec | object\|null | 规格信息，未匹配为 null |
| spec.specId | string | 业务规格编号 |
| spec.name | string | 规格名称 |
| createdAt | string | 订单在原平台的创建时间（ISO 8601） |
| updatedAt | string | 最后更新时间（ISO 8601） |

### 响应示例

```json
{
  "total": 3500,
  "page": 1,
  "pageSize": 50,
  "data": [
    {
      "id": "uuid",
      "orderNo": "SH20260201123456789",
      "platform": "ZANCHEN",
      "status": "RENTING",
      "merchantName": "团团享",
      "productName": "iPhone 15 Pro",
      "variantName": "256G",
      "itemTitle": "苹果15Pro 256G 黑色",
      "itemSku": "256G黑色",
      "totalAmount": 830.0,
      "rentPrice": 300.0,
      "deposit": 500.0,
      "insurancePrice": 30.0,
      "duration": 30,
      "promotionChannel": "同行",
      "source": "PEER",
      "customerName": "张三",
      "recipientPhone": "138****0000",
      "address": "广东省深圳市...",
      "logisticsCompany": "顺丰速运",
      "trackingNumber": "SF1234567890",
      "latestLogisticsInfo": null,
      "returnLogisticsCompany": null,
      "returnTrackingNumber": null,
      "returnLatestLogisticsInfo": null,
      "rentStartDate": "2026-02-01T00:00:00.000Z",
      "returnDeadline": "2026-03-01T00:00:00.000Z",
      "manualSn": null,
      "specId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "spec": {
        "specId": "iphone15pro-256g-black",
        "name": "iPhone 15 Pro 256G 黑色"
      },
      "createdAt": "2026-02-01T08:00:00.000Z",
      "updatedAt": "2026-02-01T08:00:00.000Z"
    }
  ]
}
```

---

## 错误响应

| HTTP 状态码 | 说明 |
|-------------|------|
| 401 | Token 无效或未提供 |
| 500 | 服务器内部错误 |

```json
{ "error": "Unauthorized" }
```

---

## 调用示例

### curl

```bash
# 查询线下订单（租用中，第1页）
curl "https://your-erp.com/api/orders?status=RENTING&page=1&pageSize=50" \
  -H "Authorization: Bearer your-token-here"

# 查询赞晨线上订单，按日期范围
curl "https://your-erp.com/api/online-orders?platform=ZANCHEN&startDate=2026-01-01&endDate=2026-03-19" \
  -H "Authorization: Bearer your-token-here"
```

### JavaScript (fetch)

```js
const res = await fetch("https://your-erp.com/api/online-orders?platform=ZANCHEN&pageSize=100", {
  headers: { Authorization: "Bearer your-token-here" }
})
const { total, data } = await res.json()
```

### Python

```python
import requests

resp = requests.get(
    "https://your-erp.com/api/orders",
    params={"status": "RENTING", "pageSize": 100},
    headers={"Authorization": "Bearer your-token-here"}
)
result = resp.json()
print(result["total"], len(result["data"]))
```
