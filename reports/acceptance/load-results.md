# 并发压测结果

- 开始：2026-07-15T16:44:41.290Z
- 结束：2026-07-15T16:48:29.580Z
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
    "usedMemoryHuman": "46.45M",
    "connectedClients": 15
  },
  "eventLoopIdleMs": {
    "meanMs": 11.75454476190476,
    "p50Ms": 12.034047,
    "p95Ms": 12.066815,
    "p99Ms": 12.312575,
    "maxMs": 12.312575
  }
}
```

## 并发 10

| 场景 | RPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | 3967.9 | 1.8 | 6.2 | 11.5 | 0.00% | errors=0 |
| books-list | 1214.3 | 6.0 | 21.0 | 25.0 | 0.00% | errors=0 |
| chapter-read | 1603.0 | 5.0 | 15.0 | 29.0 | 0.00% | errors=0 |
| chapter-save | 198.1 | 32.0 | 171.0 | 256.0 | 0.00% | errors=0 |
| ai-text-task | 1139.0 | 7.0 | 16.0 | 19.0 | 100.00% | errors=9112 |
| ai-queue-write | 341.3 | 27.0 | 41.0 | 53.0 | 0.00% | errors=0 |
| websocket | 3.3 | 5.1 | 5.5 | 5.5 | 0.00% | errors=0 |

- 写入完整性：lost=false saveOk=true readOk=true
- Redis：`{"ping":"PONG","usedMemoryHuman":"46.55M","connectedClients":15}`
- Event Loop(ms)：mean=11.45 p95=12.07 p99=12.08

## 并发 50

| 场景 | RPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | 6661.6 | 6.4 | 13.1 | 21.8 | 0.00% | errors=0 |
| books-list | 1848.6 | 25.0 | 39.0 | 52.0 | 0.00% | errors=0 |
| chapter-read | 2011.4 | 22.0 | 42.0 | 78.0 | 0.00% | errors=0 |
| chapter-save | 418.5 | 115.0 | 143.0 | 167.0 | 0.00% | errors=0 |
| ai-text-task | 967.9 | 42.0 | 102.0 | 125.0 | 100.00% | errors=7743 |
| ai-queue-write | 277.5 | 104.0 | 167.0 | 172.0 | 0.00% | errors=0 |
| websocket | 16.7 | 5.1 | 5.6 | 5.7 | 0.00% | errors=0 |

- 写入完整性：lost=false saveOk=true readOk=true
- Redis：`{"ping":"PONG","usedMemoryHuman":"46.55M","connectedClients":15}`
- Event Loop(ms)：mean=11.38 p95=12.85 p99=13.41

## 并发 100

| 场景 | RPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | 572.1 | 139.6 | 390.0 | 746.2 | 0.00% | errors=0 |
| books-list | 161.6 | 610.0 | 1134.0 | 1161.0 | 0.00% | errors=0 |
| chapter-read | 153.3 | 486.0 | 1683.0 | 1702.0 | 0.00% | errors=0 |
| chapter-save | 46.4 | 1691.0 | 2849.0 | 2865.0 | 0.00% | errors=0 |
| ai-text-task | 118.5 | 364.0 | 1208.0 | 1218.0 | 100.00% | errors=948 |
| ai-queue-write | 21.0 | 1120.0 | 2342.0 | 2435.0 | 0.00% | errors=0 |
| websocket | 33.3 | 15.2 | 20.0 | 20.4 | 0.00% | errors=0 |

- 写入完整性：lost=false saveOk=true readOk=true
- Redis：`{"ping":"PONG","usedMemoryHuman":"46.55M","connectedClients":15}`
- Event Loop(ms)：mean=10.81 p95=11.08 p99=11.10

## 并发 300

| 场景 | RPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | 7058.5 | 12.9 | 20.0 | 32.0 | 0.00% | errors=0 |
| books-list | 1848.0 | 159.0 | 234.0 | 243.0 | 0.00% | errors=0 |
| chapter-read | 1970.5 | 140.0 | 243.0 | 282.0 | 0.00% | errors=0 |
| chapter-save | 393.0 | 725.0 | 892.0 | 920.0 | 0.00% | errors=0 |
| ai-text-task | 982.6 | 42.0 | 112.0 | 143.0 | 100.00% | errors=7861 |
| ai-queue-write | 320.9 | 87.0 | 137.0 | 170.0 | 0.00% | errors=0 |
| websocket | 100.0 | 11.9 | 20.1 | 20.4 | 0.00% | errors=0 |

- 写入完整性：lost=false saveOk=true readOk=true
- Redis：`{"ping":"PONG","usedMemoryHuman":"46.55M","connectedClients":15}`
- Event Loop(ms)：mean=10.75 p95=11.07 p99=11.08
