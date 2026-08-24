# 创作台界面与交互验收报告

- 时间：2026-08-24T04:02:09.448Z
- 服务：http://127.0.0.1:5188
- 验收书：UI验收创作台

## 结果汇总

| 级别 | 数量 |
| --- | ---: |
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |
| PASS | 24 |

## 发现项

- **PASS** 〔中文首页〕 首页主文案为中文
- **PASS** 〔AI设置中文〕 设置页中文正常
- **PASS** 〔导航收缩〕 收缩后仅显示 icon（label display:none）
- **PASS** 〔书架能力〕 导入/导出/小说下载入口可用
- **PASS** 〔市场灵感〕 空/示例态有明确标注，非伪造实时
- **PASS** 〔旧路由〕 /#/market-inspiration -> http://127.0.0.1:5188/#/market/overview
- **PASS** 〔旧路由〕 /#/knowledge-library -> http://127.0.0.1:5188/#/knowledge-library/all
- **PASS** 〔旧路由〕 /#/creative-library -> http://127.0.0.1:5188/#/knowledge
- **PASS** 〔创作台〕 编辑器 ProseMirror 已加载
- **PASS** 〔主题〕 切换主题后 --bg-primary=#F4F1EA
- **PASS** 〔人物高亮〕 检测到 1 处人物高亮装饰
- **PASS** 〔禁词提示〕 检测到 1 处禁词装饰
- **PASS** 〔悬浮助手〕 可拖拽并移动位置
- **PASS** 〔悬浮助手〕 位置已写入 localStorage
- **PASS** 〔悬浮助手〕 吸附到左侧
- **PASS** 〔悬浮助手〕 刷新后位置仍保留
- **PASS** 〔Axe〕 home@375x812 无 serious/critical
- **PASS** 〔Axe〕 editor@375x812 无 serious/critical
- **PASS** 〔Axe〕 home@430x932 无 serious/critical
- **PASS** 〔Axe〕 editor@430x932 无 serious/critical
- **PASS** 〔Axe〕 home@1440x900 无 serious/critical
- **PASS** 〔Axe〕 editor@1440x900 无 serious/critical
- **PASS** 〔Performance〕 创作台加载约 1029ms，trace 已保存
- **PASS** 〔重复请求〕 tab 往返未观察到异常高频重复

## 仓库级回归

- `npm run lint`：通过，0 error（25 条既有 warning）
- `npm run test:api`：通过，27 组 API 路由与契约测试全部通过
- `npm run test:unit`：通过，含前置服务测试与完整单元测试链
- `npm run build`：通过，生产构建完成
- `npm run test:e2e`：294 项中 238 passed、56 skipped、0 failed（wide / tablet / mobile）
- 四视口 Axe：375×812、430×932、768×1024、1440×900 全部通过

## 截图

- `reports/acceptance/screenshots-ui/`
- performance trace: `reports/acceptance/screenshots-ui/editor-performance-trace.zip`
