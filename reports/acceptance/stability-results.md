# 稳定性检查结果
- 开始：2026-07-15T16:19:43.283Z
- 结束：2026-07-15T16:19:49.694Z
- 通过：5/5（失败 0，跳过 1）
## baseline-auth-status
- 结果：PASS
```json
{
  "status": 200,
  "body": {
    "success": true,
    "authenticated": true,
    "passwordConfigured": false
  }
}
```
## baseline-login
- 结果：PASS
```json
{
  "status": 200,
  "hasCookie": false,
  "body": {
    "success": true,
    "authenticated": true,
    "passwordConfigured": false
  }
}
```
## ai-request-timeout-or-error-handled
- 结果：PASS
- 说明：期望服务在超时/上游失败时返回可解析 JSON 错误，而不是挂死连接
```json
{
  "status": 502,
  "elapsedMs": 2.2851670000000013,
  "body": {
    "success": false,
    "message": "读取 Provider 失败：本地配置格式不正确"
  }
}
```
## redis-brief-unavailable
- 结果：PASS
- 说明：队列接口在 Redis 抖动时应返回 success/message 而不是进程崩溃
```json
{
  "pause": {
    "ok": true,
    "out": "OK"
  },
  "duringStatus": 200,
  "duringBody": {
    "success": true,
    "queueName": "novel-agent-writing",
    "redisUrl": "redis://127.0.0.1:6379/0",
    "counts": {
      "waiting": 3701,
      "active": 0,
      "completed": 0,
      "failed": 0,
      "delayed": 0,
      "paused": 0
    },
    "workerRunning": false,
    "localWorkerRunning": false,
    "workerCount": 0,
    "workers": [],
    "workerStatusError": "",
    "acceptingNewJobs": true,
    "shuttingDown": false
  },
  "afterStatus": 200,
  "afterBody": {
    "success": true,
    "queueName": "novel-agent-writing",
    "redisUrl": "redis://127.0.0.1:6379/0",
    "counts": {
      "waiting": 3701,
      "active": 0,
      "completed": 0,
      "failed": 0,
      "delayed": 0,
      "paused": 0
    },
    "workerRunning": false,
    "localWorkerRunning": false,
    "workerCount": 0,
    "workers": [],
    "workerStatusError": "",
    "acceptingNewJobs": true,
    "shuttingDown": false
  },
  "authDuring": {
    "status": 200,
    "body": {
      "success": true,
      "authenticated": true,
      "passwordConfigured": false
    }
  }
}
```
## service-restart
- 结果：PASS
```json
{
  "reason": "未设置 RESTART_CMD，改为连续健康探测",
  "okCount": 20,
  "total": 20,
  "statuses": [
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200,
    200
  ]
}
```