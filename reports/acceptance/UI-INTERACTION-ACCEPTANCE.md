# 创作台界面与交互验收报告

- 仓库：`Solaris-star/dreamloom-studio`
- 验收分支 / worktree：`test/ui-interaction-acceptance`（`/Users/solaris/AI/dreamloom-studio-acceptance`）
- 基线：`origin/main` + 市场灵感真实数据（`194a6ae`）+ 中文 UI / 人物禁词 / 悬浮助手等前置修复
- 时间：2026-07-16
- 原则：不靠降断言刷绿；产品问题修代码，测试脚本问题单独说明

---

## 1. 命令结果

| 检查 | 结果 | 备注 |
| --- | --- | --- |
| `npm run lint` | ✅ PASS（0 error / 10 warn） | 警告集中在 `MarketInspiration.vue` 属性换行 |
| `npm run test:api` | ✅ PASS | 全量 API 契约通过 |
| `npm run test:unit` | ✅ PASS | 含 tasks.json 隔离重建、市场空态、禁词装饰等 |
| `npm run build` | ✅ PASS | Vite 编译成功 |
| Playwright 完整 E2E | ⚠️ 部分失败 | 主因：webServer 中途断开 `ECONNREFUSED 4173`；另有历史 Axe/视觉基线/脚本问题 |
| 手工 UI 巡检 + 多视口截图 | ✅ 完成 | 见 `reports/acceptance/screenshots-ui/` |
| Performance trace | ✅ | `screenshots-ui/editor-performance-trace.zip` |

说明：完整 Playwright 在 tablet/mobile 后半段因 dev server 挂掉出现大量连接拒绝，**不能直接当作产品 P0**。wide 阶段已验证创作台、书架、市场、设置、导入导出等核心页可打开。

---

## 2. 十二项重点结论

| # | 检查项 | 结论 | 级别 |
| --- | --- | --- | --- |
| 1 | 创作台主题是否覆盖所有区域 | **已修**：`applyTheme` 同步 `--theme-app-background / --wabi-* / body`；`AppLayout` 壳层与侧栏改用主题变量。夜色下 shell/sidebar/editor/body 均为深色 | PASS（修复后） |
| 2 | 人物高亮和禁词提示是否真正显示 | **可用**：有角色数据时开启「人物高亮」会渲染 `.character-hint-decoration`；禁词开启后渲染 `.banned-word-decoration`。无角色名时高亮为 0 是预期 | PASS |
| 3 | 首页和 AI 设置是否统一中文 | **通过**：首页创作起笔 / AI 服务 / 模型 / 提示词，设置页系统设置 / 模型 / 版本均为中文 | PASS |
| 4 | 导航栏收缩是否只显示 icon | **通过**：`收起侧栏` 后 `.app-menu-label { display:none }`，仅 icon 可见 | PASS |
| 5 | 作品书架是否承载导入、导出和小说下载 | **通过**：书架含导入/下载入口；`/#/import-export/*` 有导入导出备份；`/#/novel-download` 可访问 | PASS |
| 6 | 市场灵感是否仍展示伪造数据 | **通过**：空库展示「示例内容 / 不是实时市场数据 / 暂无真实市场数据」，不伪装实时热度 | PASS |
| 7 | tab 与页面切换是否仍重复请求 | **通过（抽样）**：书架↔素材往返未观察到异常高频 API | PASS |
| 8 | 悬浮助手是否能拖拽、吸附并保存位置 | **已实现并通过**：可拖拽；靠左吸附；`localStorage` 键 `dreamloom.editor.floatingAssistant.position.v1`；刷新保留 | PASS |
| 9 | 桌面/移动端重叠、溢出、遮挡 | **未发现严重 P1 遮挡**；移动端创作台底栏固定；Axe 仍有 color-contrast / progressbar 等问题（P2） | P2 |
| 10 | 旧路由是否可访问或正确重定向 | **通过**：`/market-inspiration`→`/market/overview`；`/creative-library`→`/knowledge`；legacy workbench 路由仍可直接打开 | PASS |
| 11 | 重要操作是否有加载/成功/失败/取消/重试 | **大体具备**：导入导出有 loading/重试；市场保存有成功/失败条；任务队列有停止/重试；写作目标等个别 E2E 仍不稳定 | P2 |
| 12 | 中文环境是否仍明显英文混杂 | **主体中文**；品牌名 Dreamloom Studio / AI / Token 等保留可接受。设置「版本」已中文化 | PASS |

---

## 3. 问题分级

### P0

无（编辑器可打开，`.ProseMirror` 正常；未发现未认证写删或数据丢失路径）。

### P1

1. **完整 Playwright 稳定性不足**  
   - 现象：后半段 `connect ECONNREFUSED 127.0.0.1:4173` 雪崩  
   - 类型：**测试/环境**（webServer 生命周期），不是业务功能不可用  
   - 建议：提高 webServer 超时、避免重复 key 警告、拆 project 或复用健康检查

2. **人物高亮依赖人物谱数据**  
   - 无 `characters.json` 时开启开关不会有装饰（逻辑正确）  
   - 建议：空数据时 toast「请先在人物谱添加角色」

### P2

1. **Axe 残留**（多视口验收）：  
   - `label`（任务队列表单）  
   - `color-contrast`（导入导出说明、编辑器字数条）  
   - `button-name`（大纲圆形按钮）  
   - `aria-progressbar-name` / `scrollable-region-focusable`（编辑器统计区）
2. **视觉回归基线过期**：悬浮助手增加拖动手柄后截图差异预期内，需更新 snapshot
3. **`MarketInspiration.vue` eslint max-attributes-per-line 警告**
4. **主题下拉在自动化里偶发菜单项不可见**（手动/强制 click 可切换；产品可用）

### P3

1. `package.json` 曾有重复 `start:web` / `start:worker`（已在本分支清理）
2. 性能：创作台冷加载约 1s 量级（本机 dev）

---

## 4. 本轮修复代码

1. **悬浮助手**：`FloatingQuickActions.vue` 支持拖拽 / 左右吸附 / localStorage 持久化；`Editor.vue` 改为 fixed 定位并传入 `rightPanelSize`
2. **主题全覆盖**：`stores/theme.js` 同步壳层/body/wabi/Element 变量；`AppLayout.vue` 去掉硬编码米色背景
3. **tasks.json 损坏隔离**：隔离文件名加随机后缀；测试改为验证隔离重建而非 throw
4. **E2E 脚本**：修复 `core-interactions` 中被截断的 `expect.poll`（市场灵感写操作）
5. **package.json**：删除重复 script key
6. **验收脚本**：`scripts/ui-acceptance-check.mjs`

---

## 5. 截图与产物

目录：`/Users/solaris/AI/dreamloom-studio-acceptance/reports/acceptance/screenshots-ui/`

关键文件：

- 首页 1440 / 375 / 430：`final-home-*.png`
- 设置：`final-settings-1440.png`
- 导航收缩：`final-nav-collapsed-1440.png`
- 导入导出 / 小说下载：`final-import-export-1440.png`、`final-novel-download-1440.png`
- 市场灵感：`final-market-*.png`
- 创作台：`final-editor-*.png`、`final-theme-coverage-night.png`、`final-theme-coverage-light.png`
- Performance：`editor-performance-trace.zip`
- JSON：`ui-check-findings.json`

---

## 6. 仍未解决

1. Playwright 全量在多 project 长跑时 webServer 偶发退出（测试基建）
2. Axe color-contrast / button-name / progressbar 命名（无障碍 polish）
3. 视觉回归 snapshot 需在确认新 UI 后重录
4. 人物高亮空数据引导文案未做

---

## 7. 建议下一步

1. **P0 无，可合并本验收修复**（主题覆盖 + 悬浮助手 + 测试对齐）
2. 单独 PR：Playwright webServer 保活 + 更新 visual snapshots
3. 单独 PR：Axe 对比度与 button-name
4. 产品：人物高亮无角色时给明确提示

---

## 8. 提交说明

```
test: 完成创作台界面和交互验收
```
