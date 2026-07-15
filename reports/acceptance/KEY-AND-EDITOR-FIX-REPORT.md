# 测试 Key 接入 + 创作台空章节树修复报告

- 时间：2026-07-16
- 说明：本文**不包含**真实 API Key；本地仅通过 gitignored `.env` / 临时 env 注入

---

## 1. 测试 Key 验证结果

### 配置

```env
CUSTOM_TEXT_BASE_URL=https://api.example.com
CUSTOM_TEXT_MODEL=deepseek-v4-flash
CUSTOM_TEXT_API_TYPE=openai
# CUSTOM_TEXT_API_KEY 仅存本地 .env（已加入 .gitignore）
```

注意：`customTextApi` 会自动拼接 `/v1/chat/completions`。  
若 baseUrl 写成 `.../v1` 会变成 `/v1/v1/...`。已做兼容规范化。

### 单请求成功路径

| 步骤 | 结果 |
| --- | --- |
| `/api/ai/text-task` polish | ✅ `success=true`, `providerId=env:custom-text` |
| `/api/editor-agent/queue-write` | ✅ `status=queued` |
| worker 消费 | ✅ `state=completed`（约 12s） |
| `/api/chapters/read` | ✅ 章节被 AI 重写（非 seed） |

示例完成返回（脱敏）：

```json
{
  "success": true,
  "taskId": "...",
  "providerId": "env:custom-text",
  "model": "deepseek-v4-flash",
  "wordCount": 22
}
```

### 带 worker 的并发入队（真实模型）

条件：worker concurrency=2，真实 deepseek-v4-flash，10/50 并发各 6s。

| 并发 | queue-write RPS | P95≈ | HTTP 错误率 | 备注 |
| ---: | ---: | ---: | ---: | --- |
| 10 | 124 | 138ms | 0% | 入队快 |
| 50 | 87 | 573ms | 0% | 入队仍 0 错 |

压测后队列：

- `waiting≈1299`
- `active=2`
- `completed=3`
- `failed=1`

结论：

1. **入队链路 + 真实模型成功路径已打通**。  
2. 真实生成远慢于入队；单 worker concurrency=2 时，50 并发会迅速堆积。  
3. 生产建议：**写作用户 ≤50**，worker 水平扩展，并设队列长度/入队限流。  
4. `ai-text-task` 同步路径在高并发下会超时（模型慢），不适合作为高并发入口；应走 queue。

---

## 2. 创作台「暂无章节 / 无 ProseMirror」根因与修复

### 根因 A（主因）

`/api/sort-order/get` 未 `await` 异步 `getSortOrder()`：

- 实际返回：`{ success:true, order: {} }`（Promise 对象被 JSON 化）
- 前端 `requireSortOrderValue` 只接受 `asc|desc` → 抛错
- `NoteChapter` 捕获后只 toast，**章节树保持空**
- 无选中章节 → 不创建 TipTap → **无 `.ProseMirror`**

同类问题一并修复：

- `/api/sort-order/set`
- `/api/chapter-settings/get`
- `/api/chapter-settings/target-words`

### 根因 B（主题菜单）

`EditorMenubar` 模板用了 `handleThemeChange` / `currentThemeName` / `availableThemes`，script 未定义。  
已补回 themeStore 绑定。

### 根因 C（环境 Provider）

`store.get` 为 async，旧逻辑把缺失 `aiProviders` 当格式错误，env provider 接不上。  
已改为：async/空值时回落 env provider。

### 根因 D（tasks.json）

并发 enqueue 直接 `writeFileSync` 导致 JSON 拼接损坏。  
已改为原子写 + 损坏隔离重建。

### 根因 E（baseUrl）

`customTextApi` 固定拼 `/v1`；兼容 `baseUrl` 是否已带 `/v1`。

### 测试侧

`playwright.config.mjs` 强制 `NOVEL_ALLOW_OPEN_AUTH=true`，避免页面 mock 登录与 API 401 不一致。

---

## 3. 回归验证

### 编辑器 E2E（wide）

```text
✓ 首页继续写作可以进入创作台
✓ 创作台目录和章节切换可以操作
✓ 自动保存只写入连续输入后的最终正文
✓ 创作台阅读设置和专注模式可以恢复
4 passed
```

### API 路由单测

```text
书籍与章节路由测试通过
```

---

## 4. 代码变更摘要

| 文件 | 变更 |
| --- | --- |
| `src/main/webApi/bookChapterRoutes.js` | await 排序/章节设置异步接口 |
| `src/renderer/src/components/Editor/EditorMenubar.vue` | 补主题切换绑定 |
| `src/main/services/textGenerationRouter.js` | 安全读取 aiProviders，支持 env provider |
| `src/main/services/webServerStoreService.js` | `get(key, fallback)` |
| `src/main/services/editorAgentTaskService.js` | tasks.json 原子写 + 损坏恢复 |
| `src/main/services/customTextApi.js` | baseUrl `/v1` 规范化 |
| `vite.web.plugins.mjs` | 启动时 `loadEnvFile` |
| `playwright.config.mjs` | E2E 强制 open auth |
| `.gitignore` | 忽略 `.env` / `.env.*` |

---

## 5. 建议

1. 生产 `CUSTOM_TEXT_BASE_URL` 推荐写根域名 `https://api.xxx`（或依赖现已修复的规范化）。  
2. AI 高并发只走 queue + 多 worker，不要打同步 text-task。  
3. 可再跑一轮全量 E2E，确认其余 28 失败项中有多少已随本次修复消失。
