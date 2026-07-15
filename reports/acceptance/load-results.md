# 并发压测结果

- 开始：2026-07-15T16:20:12.683Z
- 结束：2026-07-15T16:23:59.879Z
- BASE_URL：http://127.0.0.1:5174
- WS：ws://127.0.0.1:8787/agent-tasks
- 时长：8s / 组

## 基线

```json
{
  "authStatus": {
    "success": true,
    "authenticated": true,
    "passwordConfigured": false
  },
  "redis": {
    "ping": "PONG",
    "usedMemoryHuman": "30.73M",
    "connectedClients": 11
  },
  "eventLoopIdleMs": {
    "meanMs": 11.723142095238096,
    "p50Ms": 12.034047,
    "p95Ms": 12.075007,
    "p99Ms": 12.091391,
    "maxMs": 12.091391
  }
}
```

## 并发 10

| 场景 | RPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | 6025.4 | 1.2 | 4.2 | 7.7 | 0.00% | errors=0 |
| books-list | 1823.6 | 5.0 | 9.0 | 12.0 | 0.00% | errors=0 |
| chapter-read | 2157.5 | 4.0 | 5.0 | 7.0 | 0.00% | errors=0 |
| chapter-save | 427.4 | 22.0 | 27.0 | 35.0 | 0.00% | errors=0 |
| ai-text-task | 1224.3 | 7.0 | 10.0 | 11.0 | 100.00% | errors=9794 |
| ai-queue-write | 119.5 | 78.0 | 106.0 | 317.0 | 0.00% | errors=0 |
| websocket | 3.3 | 10.2 | 10.5 | 10.5 | 0.00% | errors=0 |

- 写入完整性：lost=false saveOk=true readOk=true
- Redis：`{"ping":"PONG","usedMemoryHuman":"34.77M","connectedClients":11}`
- Event Loop(ms)：mean=11.54 p95=12.12 p99=12.13

## 并发 50

| 场景 | RPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | 6985.4 | 6.4 | 11.1 | 15.5 | 0.00% | errors=0 |
| books-list | 1893.0 | 25.0 | 30.0 | 40.0 | 0.00% | errors=0 |
| chapter-read | 2093.4 | 23.0 | 29.0 | 34.0 | 0.00% | errors=0 |
| chapter-save | 401.6 | 117.0 | 175.0 | 226.0 | 0.00% | errors=0 |
| ai-text-task | 1185.5 | 40.0 | 54.0 | 65.0 | 100.00% | errors=9484 |
| ai-queue-write | 121.0 | 242.0 | 299.0 | 311.0 | 0.00% | errors=0 |
| websocket | 16.7 | 8.8 | 9.7 | 9.7 | 0.00% | errors=0 |

- 写入完整性：lost=false saveOk=true readOk=true
- Redis：`{"ping":"PONG","usedMemoryHuman":"38.93M","connectedClients":11}`
- Event Loop(ms)：mean=11.41 p95=12.08 p99=12.09

## 并发 100

| 场景 | RPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | 5287.8 | 13.8 | 44.2 | 87.4 | 0.00% | errors=0 |
| books-list | 1911.4 | 51.0 | 62.0 | 73.0 | 0.00% | errors=0 |
| chapter-read | 2129.1 | 45.0 | 55.0 | 68.0 | 0.00% | errors=0 |
| chapter-save | 394.1 | 245.0 | 348.0 | 359.0 | 0.00% | errors=0 |
| ai-text-task | 1146.1 | 40.0 | 67.0 | 74.0 | 100.00% | errors=9169 |
| ai-queue-write | 124.3 | 238.0 | 272.0 | 279.0 | 0.00% | errors=0 |
| websocket | 33.3 | 4.1 | 4.9 | 5.0 | 0.00% | errors=0 |

- 写入完整性：lost=false saveOk=true readOk=true
- Redis：`{"ping":"PONG","usedMemoryHuman":"43.20M","connectedClients":11}`
- Event Loop(ms)：mean=11.68 p95=12.06 p99=12.09

## 并发 300

| 场景 | RPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | 5193.3 | 14.7 | 45.2 | 87.2 | 0.00% | errors=0 |
| books-list | 1930.0 | 154.0 | 183.0 | 205.0 | 0.00% | errors=0 |
| chapter-read | 2100.3 | 138.0 | 169.0 | 193.0 | 0.00% | errors=0 |
| chapter-save | 384.0 | 737.0 | 949.0 | 953.0 | 0.00% | errors=0 |
| ai-text-task | 1064.1 | 41.0 | 66.0 | 121.0 | 100.00% | errors=8513 |
| ai-queue-write | 89.3 | 256.0 | 855.0 | 951.0 | 0.00% | errors=0 |
| websocket | 100.0 | 7.3 | 17.1 | 17.4 | 0.00% | errors=0 |

- 写入完整性：lost=false saveOk=true readOk=true
- Redis：`{"ping":"PONG","usedMemoryHuman":"46.31M","connectedClients":11}`
- Event Loop(ms)：mean=11.37 p95=12.09 p99=12.25
