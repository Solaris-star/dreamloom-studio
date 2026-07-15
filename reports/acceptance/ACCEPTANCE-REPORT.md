# Dreamloom Studio 生产/并发验收报告

- 仓库：`Solaris-star/dreamloom-studio`
- 提交：`693067b`（含 PR #5 并发写入安全）
- 验收分支：`fix/concurrent-write-safety`（已 fast-forward 到 main 合并点）
- 执行时间：2026-07-15 ~ 2026-07-16（本地 macOS）
- 执行人：验收 agent

---

## 1. 测试环境

| 项 | 值 |
| --- | --- |
| OS | macOS 26.5.1 |
| Node | v25.9.0 |
| npm | 11.12.1 |
| Redis | 本机 `redis-server` `:6379`，压测前 `PONG` |
| 服务启动 | `npm run dev -- --host 127.0.0.1 --port 5174` |
| 书库目录 | `/tmp/dreamloom-load-books` |
| 认证模式 | `NOVEL_ALLOW_OPEN_AUTH=true`（本地开放认证，无密码） |
| 队列 | `AGENT_TASK_QUEUE_ENABLED=true`，`REDIS_URL=redis://127.0.0.1:6379/0` |
| 进度 WS | `AGENT_TASK_WS_ENABLED=true`，端口 `8787` |
| 压测工具 | `autocannon`（dev 临时安装，未写入 package.json） + 自研脚本 |
| E2E | Playwright 1.61.1 + `@axe-core/playwright` 4.12.1 |
| 视口 | 375×812 / 430×932 / 768×1024 / 1440×900 |

说明：本次**不修改业务实现**；仅增加验收脚本/测试修正与报告。`build` 与大量 E2E 失败根因是业务文件 `EditorMenubar.vue` 重复属性，已记入产品缺陷。

---

## 2. 测试命令

```bash
# 静态/单元/API
npm run lint
npm run test:api
MARKET_TREND_SCHEDULER=0 AGENT_TASK_WS_ENABLED=false NOVEL_AUTH_REDIS=false npm run test:unit
MARKET_TREND_SCHEDULER=0 AGENT_TASK_WS_ENABLED=false npm run build

# 依赖审计（生产依赖）
npm audit --omit=dev

# 完整 E2E（含 Axe / 多 project 视口）
npm run test:e2e

# 压测（需先启动 dev 服务）
export BASE_URL=http://127.0.0.1:5174
export WS_URL=ws://127.0.0.1:8787
export OPEN_AUTH=1
export DURATION_SEC=8
export LOAD_CONNECTIONS=10,50,100,300
node tests/load/run-acceptance-load.mjs

# 稳定性
export BASE_URL=http://127.0.0.1:5174 OPEN_AUTH=1
node tests/load/run-stability-checks.mjs

# 一键编排（可选）
node scripts/run-acceptance-suite.mjs
```

产物目录：`reports/acceptance/`

---

## 3. 结果总览

| 检查项 | 结果 | 备注 |
| --- | --- | --- |
| `npm run lint` | ❌ FAIL | `EditorMenubar.vue` 20 个 duplicate-attribute |
| `npm run test:api` | ✅ PASS | 全部 API 路由契约通过 |
| `npm run test:unit` | ✅ PASS | 在关闭进度 WS 副作用后通过 |
| `npm run build` | ❌ FAIL | 同 `EditorMenubar.vue` Duplicate attribute，Vite 无法编译 |
| `npm audit --omit=dev` | ✅ PASS | `found 0 vulnerabilities` |
| Playwright E2E | ❌ 48 failed / 40 skipped / 191 passed | 失败几乎全部关联编辑器编译错误 |
| Axe WCAG 2.2 AA | ⚠️ 未完整得到通过结论 | 首页/编辑器因页面挂死无法完成分析 |
| 多视口布局 | ⚠️ 被编辑器编译阻断 | 新增 `viewport-acceptance.spec.mjs`，本次运行受业务缺陷影响 |
| 压测 10/50/100/300 | ✅ 完成 | 详见第 5 节；写入未丢失 |
| 稳定性（Redis/AI/健康） | ✅ PASS | 未配置 `RESTART_CMD` 时重启项为软探测 |

---

## 4. 功能与移动端观察

### 4.1 页面打开（E2E core-pages）

在 **tablet/mobile** 上，书架/大纲/素材/设置/AI 队列/导入导出等多数页面可打开；**wide** 项目中创作台、角色档案、标题路由切换等失败。

通过的代表能力（从 E2E 列表观察）：

- 书架筛选与本地导入入口
- 大纲管理页面打开
- 素材保存防重复提交
- 提示词保存防重复提交
- 任务队列停止/重试交互（mock）
- AI 工坊/图像失败保留输入

失败的代表能力：

- 创作台打开、目录切换、自动保存、专注模式
- 首页「继续写作」进入创作台
- 视觉回归（创作台）
- 无障碍 Axe（首页/创作台）
- 手机全屏创作工具抽屉

### 4.2 根因

Vite 编译错误：

```text
src/renderer/src/components/Editor/EditorMenubar.vue:74:11 Duplicate attribute
```

`data-testid` / `aria-label` 在字体/字号/行距/主题等控件上重复声明（合并移动端无障碍改动时引入）。  
这会让所有依赖编辑器 chunk 的路由在 dev/build 下直接 500。

### 4.3 失败截图

见：

- ![创作台 wide 失败](/Users/solaris/AI/dreamloom-studio/reports/acceptance/screenshots/core-pages-创作台页面可正常打开-wide.png)
- ![创作台 mobile 失败](/Users/solaris/AI/dreamloom-studio/reports/acceptance/screenshots/core-pages-创作台页面可正常打开-mobile.png)
- ![视觉回归 宽屏](/Users/solaris/AI/dreamloom-studio/reports/acceptance/screenshots/visual-regression-宽屏创作台视觉基准-wide.png)
- ![视觉回归 手机](/Users/solaris/AI/dreamloom-studio/reports/acceptance/screenshots/visual-regression-手机创作台视觉基准-mobile.png)
- ![继续写作](/Users/solaris/AI/dreamloom-studio/reports/acceptance/screenshots/core-interactions-首页继续写作可以进入创作台-wide.png)
- ![Axe 首页](/Users/solaris/AI/dreamloom-studio/reports/acceptance/screenshots/accessibility-首页没有-WCAG-2-2-AA-自动检查错误-wide.png)

---

## 5. 压力测试结果

原始数据：

- `reports/acceptance/load-results.md`
- `reports/acceptance/load-results-1784132639908.json`

条件：每组 8s，`OPEN_AUTH=1`，本机 Vite dev + Redis。  
说明：P95 使用 autocannon 的 `p97_5` 近似（脚本已标注）。

### 5.1 汇总表

#### 并发 10

| 场景 | RPS | P50 | P95≈ | P99 | 错误率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| login | 6025 | 1.2 | 4.2 | 7.7 | 0% |
| books-list | 1824 | 5 | 9 | 12 | 0% |
| chapter-read | 2158 | 4 | 5 | 7 | 0% |
| chapter-save | 427 | 22 | 27 | 35 | 0% |
| ai-text-task | 1224 | 7 | 10 | 11 | **100%** |
| ai-queue-write | 120 | 78 | 106 | 317 | 0% |
| websocket | 连接成功 10/10 | 10.2 | 10.5 | 10.5 | 0% |

#### 并发 50

| 场景 | RPS | P50 | P95≈ | P99 | 错误率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| login | 6985 | 6.4 | 11.1 | 15.5 | 0% |
| books-list | 1893 | 25 | 30 | 40 | 0% |
| chapter-read | 2093 | 23 | 29 | 34 | 0% |
| chapter-save | 402 | 117 | 175 | 226 | 0% |
| ai-text-task | 1186 | 40 | 54 | 65 | **100%** |
| ai-queue-write | 121 | 242 | 299 | 311 | 0% |
| websocket | 50/50 | 8.8 | 9.7 | 9.7 | 0% |

#### 并发 100

| 场景 | RPS | P50 | P95≈ | P99 | 错误率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| login | 5288 | 13.8 | 44.2 | 87.4 | 0% |
| books-list | 1911 | 51 | 62 | 73 | 0% |
| chapter-read | 2129 | 45 | 55 | 68 | 0% |
| chapter-save | 394 | 245 | 348 | 359 | 0% |
| ai-text-task | 1146 | 40 | 67 | 74 | **100%** |
| ai-queue-write | 124 | 238 | 272 | 279 | 0% |
| websocket | 100/100 | 4.1 | 4.9 | 5.0 | 0% |

#### 并发 300

| 场景 | RPS | P50 | P95≈ | P99 | 错误率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| login | 5193 | 14.7 | 45.2 | 87.2 | 0% |
| books-list | 1930 | 154 | 183 | 205 | 0% |
| chapter-read | 2100 | 138 | 169 | 193 | 0% |
| chapter-save | 384 | 737 | 949 | 953 | 0% |
| ai-text-task | 1064 | 41 | 66 | 121 | **100%** |
| ai-queue-write | 89 | 256 | 855 | 951 | 0% |
| websocket | 300/300 | 7.3 | 17.1 | 17.4 | 0% |

### 5.2 资源与完整性

| 指标 | 观察 |
| --- | --- |
| CPU（服务进程采样） | 压测中峰值约 **115%**，均值约 **77%** |
| 内存 RSS | 峰值约 **295 MB**，均值约 **170 MB** |
| Event loop delay（采样） | mean ≈ 11–12 ms，p95 ≈ 12 ms（压测间隙/本机采样） |
| Redis | 全程 `PONG`；内存从 ~31MB 升至 ~46MB；`connected_clients≈11` |
| 数据写入丢失 | **未发现**（每组后 save→read 校验 `lost=false`） |
| 章节保存吞吐 | 约 **380–430 RPS**，延迟随并发明显上升（300 并发 P99≈953ms） |

### 5.3 AI 任务说明

- `/api/ai/text-task` 100% 5xx：本机无有效 Provider 配置，返回  
  `读取 Provider 失败：本地配置格式不正确`  
  → **环境配置问题**，不是并发击穿。
- `/api/editor-agent/queue-write` HTTP 层 0 错误，但压测后队列 `waiting≈3701`，**无 worker 消费**（未起 `start:worker`）→ 入队能扛，处理能力未验证。

---

## 6. 稳定性

见 `reports/acceptance/stability-results.md`。

| 检查 | 结果 |
| --- | --- |
| auth status / login | PASS |
| AI 错误可解析（502 JSON，不挂死） | PASS |
| Redis `CLIENT PAUSE 2000 WRITE` 后 queue-status 仍 200 | PASS |
| 服务重启 | SKIP（未设 `RESTART_CMD`；改为连续健康探测 PASS） |

建议生产验证时补充：

```bash
RESTART_CMD='docker compose -f docker-compose.prod.yml restart web worker' \
  node tests/load/run-stability-checks.mjs
```

---

## 7. 问题清单（按严重程度）

### A. 真实产品缺陷

| 级别 | 问题 | 证据 | 建议 |
| --- | --- | --- | --- |
| **P0** | `EditorMenubar.vue` 重复 `data-testid`/`aria-label`，编辑器相关页面无法编译/打开 | lint 20 errors；build SyntaxError；E2E 大量 Duplicate attribute | 删除重复属性（保留一份即可） |
| **P1** | `package.json` 重复键 `start:web` / `start:worker` | Vite 构建警告；后写覆盖前写，脚本入口语义混乱 | 合并为唯一入口（建议保留 `scripts/start-web.mjs` 生产入口） |
| **P1** | WebSocket 鉴权 `authorizeClient` 未 `await` 异步 `getAuthenticatedSession` | `vite.web.plugins.mjs` 中直接 `session?.authenticated` | 改为 async 鉴权路径，或保证同步返回 |
| **P2** | 无 AI Provider 时 text-task 直接 502 | 压测/稳定性实测 | 配置校验前置 + 更明确的 400/配置引导 |
| **P2** | 队列可无限堆积（无 worker 时 waiting 三千+） | stability 时 `waiting:3701` | 生产必须配套 worker + 堆积告警 + 拒绝策略 |

### B. 测试脚本/环境问题（非产品）

| 级别 | 问题 | 处理 |
| --- | --- | --- |
| 测试 | `test-web-api-security-preview` / `test-web-build-chunks` 导入插件会拉起进度 WS，导致 open handle 挂住 | 已修：禁用 WS / finally stop |
| 测试 | 多视口验收原先会在 3 个 project 上乘算 | 已修：仅 `wide` project 执行 |
| 测试 | autocannon 无原生 p95 | 已用 `p97_5` 近似并写入脚本注释 |
| 环境 | 压测未启动 worker / 未配置真实 AI Key | 报告中单独标注 |
| 环境 | 未做真实生产容器滚动重启（缺 `RESTART_CMD`） | 提供命令模板 |

---

## 8. 建议并发使用上限

基于本机 dev 单进程 + Redis、**章节保存延迟**与 CPU 饱和：

| 场景 | 建议上限 | 理由 |
| --- | --- | --- |
| 只读浏览（列表/读章） | **100 并发** 仍可接受 | 100 并发读章 P95≈55ms；300 并发 P95≈169ms |
| 活跃写作（频繁保存） | **50 并发用户** 更稳妥 | 50 并发保存 P95≈175ms；100 并发 P95≈348ms；300 并发 P95≈949ms |
| AI 入队 | 取决于 **worker 数与 Provider 限流**，不是 Web 入队能力 | 本次入队 OK，但无消费；不建议按 HTTP 入队 RPS 估容量 |
| WebSocket 进度订阅 | **≥300 连接** 本机可握手成功 | 仍需结合广播频率与鉴权修复后再定生产值 |

**生产初值建议（单 web 实例，2–4C/4GB 量级）：**

- 同时在线写作用户：**≤ 50**
- 同时只读用户：**≤ 100–150**
- 超过后优先水平扩展 web + 独立 worker，并打开 Redis 会话（`NOVEL_AUTH_REQUIRE_REDIS=true`）

---

## 9. 本次提交的测试资产

- `tests/load/run-acceptance-load.mjs` — 可重复压测
- `tests/load/run-stability-checks.mjs` — Redis/AI/健康稳定性
- `tests/e2e/viewport-acceptance.spec.mjs` — 四视口 + Axe + 溢出/遮挡巡检
- `scripts/run-acceptance-suite.mjs` — 一键编排
- `scripts/test-web-api-security-preview.mjs` / `scripts/test-web-build-chunks.mjs` — 防止测试挂起
- `reports/acceptance/*` — 结果与截图

---

## 10. 结论

1. **API 契约与单元测试整体健康**；生产依赖审计无已知漏洞。  
2. **编辑器链路当前不可用（P0）**，阻断 build、创作台 E2E、完整 Axe/多视口结论。  
3. **并发读写与 WS 握手在 300 连接下未丢数据、未打挂 Redis**；章节保存是主要瓶颈。  
4. 修复 P0 后应立刻重跑：`build` + 全量 E2E + viewport-acceptance + 带 worker 的 AI 队列压测。
