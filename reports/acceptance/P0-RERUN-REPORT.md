# P0 修复后重跑报告

- 时间：2026-07-16
- 基线提交：`8700f05`（验收脚本）
- 本次修复：`EditorMenubar.vue` 重复 `data-testid` / `aria-label`

---

## 1. 修复内容

文件：`src/renderer/src/components/Editor/EditorMenubar.vue`

去掉字体/字号/行距/段落间距/页宽 5 组重复属性，保留一份 `data-testid` + `aria-label`。

---

## 2. 命令与结果

| 检查 | 结果 | 备注 |
| --- | --- | --- |
| `npm run lint` | ✅ PASS | 此前 20 个 duplicate-attribute 已清零 |
| `npm run build` | ✅ PASS | 8.02s 构建成功 |
| `npm run test:e2e` | ⚠️ 28 failed / 48 skipped / **203 passed** | 较修复前 48 failed / 191 passed 明显改善 |
| 带 worker 的队列压测 | ✅ 完成 | worker 在线消费；任务因无 AI Key 失败（预期） |

### E2E 对比

| 指标 | P0 前 | P0 后 |
| --- | ---: | ---: |
| passed | 191 | **203** |
| failed | 48 | **28** |
| skipped | 40 | 48 |
| Duplicate attribute | 大量 | **0** |

已恢复通过的代表项：

- 首页/书架/图库/设置等 Axe 基础页（tablet/mobile 多条）
- 首页「继续写作」进创作台（多端）
- 创作台页面可打开（壳层/工具栏）
- 无障碍：面板控制与目录入口命名（wide）

仍失败的主要簇：

1. **创作台正文未挂载 `.ProseMirror`**  
   章节树显示「暂无章节」，虽工具栏可见，但内容区无编辑器实例。  
   影响：目录切换/自动保存/专注模式/AI 清理/视觉回归/手机抽屉等。
2. **Axe 真实违规（viewport-acceptance）**  
   - `ai-queue`：表单无 label（critical）  
   - `import-export`：对比度不足（serious）  
   - `outline`：圆形按钮无名称（critical）  
   - `editor`：tree ARIA children / 按钮无名 / 对比度
3. **写作目标页无「创建目标」按钮**（三端超时）
4. **图库导入 API 返回无 `success: true`**
5. **DOCX 导入卡在 importing / 偶发导入失败**
6. **视觉快照 diff**（bookshelf 等，约 2% 像素差）

---

## 3. 带 worker 的 AI 队列压测

### 环境

```bash
# web
REDIS_URL=redis://127.0.0.1:6379/2
AGENT_TASK_QUEUE_ENABLED=true
NOVEL_BOOKS_DIR=/tmp/dreamloom-load-books
NOVEL_ALLOW_OPEN_AUTH=true
npm run dev -- --host 127.0.0.1 --port 5174

# worker
REDIS_URL=redis://127.0.0.1:6379/2
AGENT_TASK_QUEUE_ENABLED=true
NOVEL_BOOKS_DIR=/tmp/dreamloom-load-books
AGENT_TASK_QUEUE_CONCURRENCY=2
AGENT_TASK_QUEUE_JOB_TIMEOUT_MS=10000
node bin/agent-task-worker.js
```

### 单任务验证

- 入队：`success=true, status=queued`
- worker：`workerRunning=true, workerCount=1`
- 执行结果：`state=failed`
- 原因：**`请先配置文本 AI 服务。请在 .env 中配置 DEEPSEEK_API_KEY，或 CUSTOM_TEXT_*。`**

说明：队列链路（入队 → Redis → worker 领取 → 失败落库）已打通；缺的是上游模型 Key，不是队列本身。

### 并发入队（HTTP）结果摘要

数据：`reports/acceptance/load-results-1784134109600.json`  
每组 8s；`ai-queue-write` 使用唯一 `jobId` + `booksDir`。

| 并发 | queue-write RPS | P50 | P95≈ | P99 | HTTP 错误率 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 341 | 27 | 41 | 53 | 0% |
| 50 | 278 | 104 | 167 | 172 | 0% |
| 100 | 21 | 1120 | 2342 | 2435 | 0%（延迟异常升高） |
| 300 | 321 | 87 | 137 | 170 | 0% |

其它关键路径（同轮）：

| 并发 | chapter-save P95≈ | books-list P95≈ | 写入丢失 |
| ---: | ---: | ---: | --- |
| 10 | 171ms | 21ms | 否 |
| 50 | 143ms | 39ms | 否 |
| 100 | 2849ms | 1134ms | 否 |
| 300 | 892ms | 234ms | 否 |

压测后队列状态：`failed=8, waiting=0, active=0, workerRunning=true`  
（任务被 worker 快速失败消费；本机无 Provider，失败属预期）

### 结论

1. **有 worker 时**，队列不会无限堆积，会进入 failed。  
2. **HTTP 入队**在 50 并发仍可用；100 并发出现明显抖动（同轮 300 反而恢复），建议生产保守按 **≤50 写作用户 + 独立 worker**。  
3. 要验证「成功生成章节」，必须配置真实 `DEEPSEEK_API_KEY` / `CUSTOM_TEXT_*` 后再压。

---

## 4. 问题分级（P0 后）

### 产品缺陷

| 级别 | 问题 |
| --- | --- |
| **P0（已修）** | EditorMenubar 重复属性导致编译失败 |
| **P1** | 创作台有时章节树为空 → 无 `.ProseMirror`（保存章节后仍「暂无章节」） |
| **P1** | package.json 重复 `start:web` / `start:worker` |
| **P1** | WS `authorizeClient` 未 await 异步 session |
| **P2** | Axe：任务队列缺 label、大纲/编辑器按钮无名、多处对比度 |
| **P2** | `/#/analytics/goals` 无「创建目标」入口 |
| **P2** | 图库附件导入响应契约 / DOCX 导入稳定性 |
| **P2** | 无 AI Provider 时 text-task 502；worker 失败信息已可读 |

### 测试/环境

| 项 | 说明 |
| --- | --- |
| 视觉回归 diff | 基线图需在修复 UI 后更新 |
| 无 AI Key | worker 只能验失败路径，不能验成功写章 |
| 压测脚本 | 已支持 `bodyFactory` 生成唯一 jobId |

---

## 5. 建议下一步

1. 查章节树加载：`/api/chapters/load` 与编辑器初始化为何显示「暂无章节」。  
2. 配真实文本 AI Key 后重跑 worker 成功路径压测。  
3. 修 Axe critical（label / button-name / aria-required-children）。  
4. 合并 package.json 重复脚本键。
