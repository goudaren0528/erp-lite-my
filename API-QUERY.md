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
curl "https://your-erp.com/api/online-orders?platform=ZANCHEN&startDate=2026-01-01&endDate=2026-03-13" \
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
