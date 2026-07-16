# PR #7 A3 视觉风格验收清单

> 分支：`feat/a3-visual-styles`  
> 最后更新：本轮收口（书架/创作台去和纸 + Apple 暗色）

## 自动检查

```bash
node scripts/test-visual-styles.mjs
node scripts/test-a3-ui-modernization.mjs
node scripts/test-web-ui-preferences.mjs
MARKET_TREND_SCHEDULER=0 AGENT_TASK_WS_ENABLED=false npm run build
```

## 功能面

- [x] 配色主题与视觉风格解耦（`config.theme` × `config.visualStyle`）
- [x] 设置页「主题外观」可切换 4 套风格并持久化
- [x] 野兽 / 像素仅影响壳层，创作台正文保持可读
- [x] 首页 Bento 今日速览
- [x] `UiEmptyState` / `UiSurface` 统一组件
- [x] 书架 / 市场 / 空态 token 对齐
- [x] 本地字体栈（无 Google Fonts CDN）
- [x] `applyTheme` 输出 `data-theme` / `data-color-scheme`

## Apple 极简验收

### 壳层
- [x] 侧栏毛玻璃 + 系统蓝 tint 选中
- [x] 收缩按钮在 logo 旁（Finder/Notes 布局）
- [x] 设置页 Settings 白底分组，无和纸纹理

### 首页
- [x] 标题 SF / system-ui 无衬线
- [x] Bento 白卡 + 轻阴影（非和纸渐变）
- [x] 主按钮系统蓝胶囊

### 书架 / 创作库
- [x] 标题去宋体
- [x] 工具栏 / 卡片 / book-card 白卡细边
- [x] 选中态系统蓝 tint（非苔藓绿/宣纸）
- [x] 旧 `Book` 组件题签去楷体

### 创作台
- [x] 壳层灰底，侧栏白卡
- [x] 正文区保持可读纸面（不灌硬阴影）
- [x] 目录当前章系统蓝 tint

### Apple 暗色（`theme=dark` × `visualStyle=apple`）
- [x] 壳层 `#1c1c1e` / 卡片 `#2c2c2e`
- [x] 选中 / 主按钮 `#0a84ff`
- [x] 侧栏 / 设置 / 首页 / 书架 / 创作台正文可读

## 预览截图

| 风格 | 首页 | 设置 |
|------|------|------|
| classic | `classic-home.png` | `classic-settings.png` |
| apple | `apple-home.png` | `apple-settings.png` |
| apple dark | `apple-dark-home.png` | `apple-dark-settings.png` |
| apple 书架 | `apple-bookshelf.png` | — |
| brutal | `brutal-home.png` | `brutal-settings.png` |
| pixel | `pixel-home.png` | `pixel-settings.png` |

## 人工冒烟（合并前）

1. 设置 → 外观：四套风格切换，刷新后仍保持
2. 配色切「夜色」+ 风格「Apple」：侧栏/首页/设置/书架均暗色可读
3. 创作台打开章节：正文可读写，野兽/像素不污染正文
4. 书架选中/悬停：系统蓝 tint，无和纸渐变
