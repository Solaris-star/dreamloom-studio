# 并发压测结果

- 开始：2026-07-15T17:08:25.925Z
- 结束：2026-07-15T17:09:46.594Z
- BASE_URL：http://127.0.0.1:5174
- WS：ws://127.0.0.1:8787/agent-tasks
- 时长：6s / 组

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
    "usedMemoryHuman": "46.53M",
    "connectedClients": 15
  },
  "eventLoopIdleMs": {
    "meanMs": 10.963171555555556,
    "p50Ms": 11.034623,
    "p95Ms": 11.059199,
    "p99Ms": 11.075583,
    "maxMs": 11.075583
  }
}
```

## 并发 10

| 场景 | RPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | 4323.8 | 1.9 | 4.7 | 7.6 | 0.00% | errors=0 |
| books-list | 1702.0 | 5.0 | 9.0 | 10.0 | 0.00% | errors=0 |
| chapter-read | 1996.3 | 4.0 | 9.0 | 13.0 | 0.00% | errors=0 |
| chapter-save | 432.8 | 20.0 | 37.0 | 48.0 | 0.00% | errors=0 |
| ai-text-task | 0.0 | 0.0 | 0.0 | 0.0 | 0.00% | errors=0 |
| ai-queue-write | 124.0 | 79.0 | 138.0 | 144.0 | 0.00% | errors=0 |
| websocket | 3.3 | 14.8 | 15.4 | 15.4 | 0.00% | errors=0 |

- 写入完整性：lost=false saveOk=true readOk=true
- Redis：`{"ping":"PONG","usedMemoryHuman":"52.62M","connectedClients":15}`
- Event Loop(ms)：mean=10.93 p95=11.04 p99=11.06

## 并发 50

| 场景 | RPS | P50(ms) | P95(ms) | P99(ms) | 错误率 | 备注 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| login | 7019.7 | 6.4 | 11.0 | 15.3 | 0.00% | errors=0 |
| books-list | 1670.8 | 28.0 | 39.0 | 44.0 | 0.00% | errors=0 |
| chapter-read | 1455.8 | 29.0 | 78.0 | 111.0 | 0.00% | errors=0 |
| chapter-save | 274.7 | 161.0 | 325.0 | 379.0 | 0.00% | errors=0 |
| ai-text-task | 2.5 | 5020.0 | 5785.0 | 5785.0 | 100.00% | errors=15 |
| ai-queue-write | 86.7 | 311.0 | 573.0 | 650.0 | 0.00% | errors=0 |
| websocket | 16.7 | 9.9 | 10.4 | 10.8 | 0.00% | errors=0 |

- 写入完整性：lost=false saveOk=true readOk=true
- Redis：`{"ping":"PONG","usedMemoryHuman":"57.35M","connectedClients":15}`
- Event Loop(ms)：mean=11.89 p95=13.17 p99=14.00
