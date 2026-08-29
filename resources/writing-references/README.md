# writing-references 索引

从 oh-story-claudecode（MIT License, Copyright (c) 2025-2026 oh-story-claudecode）提炼的写作方法论库。
所有文件按主题分组存放，供 writingReferenceLibrary 服务按 skill references 声明注入 prompt。

## 分组

| 分组 | 文件 | 用途 |
|------|------|------|
| anti-ai | banned-words.md / anti-ai-writing.md / check-ai-patterns.js | 去 AI 味：禁用词句式表、三遍去AI法、确定性检测器 |
| longform | long-chapter-hooks.md · emotional-arc-design.md · emotional-methods.md · reader-contract-and-progression.md · state-tracking.md · long-format.md · writing-craft.md · long-chapter-quality.md · long-suspense.md · long-reversal.md | 长篇：章尾钩子、情绪弧线、读者契约、状态追踪、文风 |
| character | character-basics.md · character-relations.md · dialogue-mastery.md | 人物：角色档案、关系、对话技法 |
| plot | outline-methods.md · outline-rhythm.md · plot-core-methods.md · plot-emotion-system.md | 情节：大纲方法、节奏、情绪引擎 |
| review | quality-rubric.md · review-quality.md | 审稿：多视角 rubric、质量标准 |

## 引用路径约定

skill.references 中写相对路径，如 `references/anti-ai/banned-words`（不带 .md，与 oh-story 原生用法一致）。
服务解析时依次尝试 `resources/writing-references/<path>.md` 与 `<path>` 原样。
