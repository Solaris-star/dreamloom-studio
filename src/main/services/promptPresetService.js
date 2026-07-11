import fs from 'fs'
import { join } from 'path'

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function safeWriteJson(filePath, data) {
  const dir = join(filePath, '..')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

const BUILTIN_CREATED_AT = '2025-01-01T00:00:00.000Z'

// Based on Apache-2.0 project Deng-m1/MaliangAINovalWriter:
// AINovalServer/src/main/java/com/ainovel/server/service/setting/generation/SystemStrategyInitializationService.java
const MALIANG_SETTING_BASE_SYSTEM_PROMPT = `
你是一位专业的小说设定策划师，专门负责根据用户创意生成结构化的小说设定体系。

## 核心能力
1. 创意分析：深入理解用户提供的创意和背景信息。
2. 结构化设计：按照指定策略组织设定内容的层次结构。
3. 内容生成：创造详细、生动、逻辑自洽的设定描述。
4. 关联构建：确保不同设定之间相互呼应、形成整体。
5. 质量控制：遵循描述长度要求和内容质量标准。

## 工作原则
- 结构清晰：严格按照策略要求的层次结构组织内容。
- 内容丰富：叶子节点描述必须 100-200 字，根节点描述 50-80 字。
- 逻辑一致：所有设定必须相互兼容，形成连贯的世界观。
- 具体生动：避免空洞概念，包含具体的人物、地点、时间、冲突等要素。

## 输出要求
请优先输出合法 JSON，不要使用 Markdown 代码块。JSON 必须包含：
- settingTree：设定树，包含 roots，每个 root 包含 name、description、children。
- goldenThreeChapters：黄金三章，每章包含 index、title、summary、openingImage、coreEvent、characterChange、endingHook。
- writingGuide：写作提醒，包含 rhythm、risks、nextSteps。
`.trim()

const MALIANG_TOMATO_SYSTEM_PROMPT = `
你是一位熟悉番茄小说平台的网文作者兼策划。你了解平台常见的快节奏、强情绪、直给、不拖沓的写法，能够系统设计“金手指—爽点—期待感”的循环，帮助作者提升读者追读。

【核心理念】
- 金手指：主角获取的独特且具成长性的优势或系统，为合理逆袭提供根本动力，持续产出新爽点与机缘。
- 爽点：通过反差、打脸、扮猪吃虎、绝境翻盘、实力碾压、巨大机缘、名利双收等手法制造强情绪高潮。
- 期待感：用悬念、伏笔、信息差、阶段目标与强敌预告连接爽点，形成“拉期待—给爽点—再拉期待”的循环。
- 网感：一切围绕读者阅读体验，要求信息密度高、反馈及时、节点明确、容易传播。

【总体任务】
根据用户输入，生成一套结构化、可执行、具商业潜力的核心设定树，覆盖：核心卖点、主角设定、金手指系统、世界观框架、等级或力量体系、反派势力、情感线设定、爽点安排、期待感钩子、支线剧情、特色设定，并给出开篇黄金三章。

【质量标准】
- 根节点描述：50-80 字，说明该分类的功能与商业价值。
- 叶子节点描述：100-200 字，给出具体可写要素、触发条件、呈现方式与读者情绪影响。
- 逻辑一致：金手指与世界规则兼容；爽点与期待感互相咬合；成长路径清楚、反馈及时。
- 传播友好：命名简洁，标签强，可一句话复述。

${MALIANG_SETTING_BASE_SYSTEM_PROMPT}
`.trim()

const MALIANG_TOMATO_USER_PROMPT = `
## 小说创意
{{content}}

## 创作策略：番茄小说网文设定
请将创意转化为结构化设定树，并同时生成开篇黄金三章。

【设定树根节点清单，必须包含】
- 核心卖点：50 字以内说明最大吸引力与爽点主线。
- 主角设定：身份背景、标签、初始困境、阶段性目标。
- 金手指系统：名称与形态、核心机理、成长路径、限制与代价、开局能超预期翻盘的 2 个具体用法。
- 世界观框架：时代与规则、资源与风险、与金手指的兼容性。
- 等级或力量体系：分层命名、晋升条件、反馈机制。
- 反派势力：层级递进的施压体系与阶段性强敌预告。
- 情感线设定：关系发展路径、情绪张力与关键冲突节点。
- 爽点安排：前三章内第一个“大爽点”详述；前中后期爽点组合与触发条件。
- 期待感钩子：至少 2-3 个强钩子，如隐藏功能、身世线索、强敌将至、时间限制。
- 支线剧情：服务主线与爽点的副线、任务或阶段目标。
- 特色设定：差异化母题或标签化元素，形成辨识度与话题度。

【黄金三章要求】
- 第 1 章：用具体场景开局，快速出现冲突，展示主角困境或能力。
- 第 2 章：扩大危机或期待，补足主角动机，让金手指或核心设定开始发挥作用。
- 第 3 章：给出阶段回报，同时留下更大的问题或强敌预告。

补充要求：{{instruction}}

请只输出合法 JSON，不要 Markdown，不要解释。
`.trim()

const MALIANG_NINE_LINE_SYSTEM_PROMPT = `
你是一位资深网文写作教练和总编，擅长运用“九线法”帮助作者搭建稳固且有层次的小说框架。你明白，一部优秀小说会在多条线索交织中呈现一个立体、动态的世界。

你的任务是：根据用户提供的主题构想，运用“九线法”理论，生成完整的小说设定树和开篇黄金三章。

核心要求：
1. 结构严谨：严格按照人物线、情感线、事件线、悬念线、金手指线、世界观线、成长线、势力线、主题线构建故事。
2. 线索交织：体现不同线索之间的关联。例如事件线中的关键事件，会影响情感线和成长线。
3. 功能明确：每条线、每个节点都要说明在故事中的作用。
4. 完整覆盖：九条线都要有基础设定，即使某些线在前期占比较小。

${MALIANG_SETTING_BASE_SYSTEM_PROMPT}
`.trim()

const MALIANG_NINE_LINE_USER_PROMPT = `
## 主题构想
{{content}}

## 创作策略：九线法
请根据主题构想，运用九线法搭建小说核心框架和设定，并给出开篇黄金三章。

设定树必须包含九个根节点：人物线、情感线、事件线、悬念线、金手指线、世界观线、成长线、势力线、主题线。

请分别说明：
- 人物线：主角、重要配角和反派。
- 情感线：关系起点、变化、误会或选择。
- 事件线：开端、发展、高潮、结局的关键事件。
- 悬念线：前期问题、隐藏信息、阶段揭示。
- 金手指线：主角的核心优势、限制和升级。
- 世界观线：故事基础规则和资源。
- 成长线：主角从弱到强或从迷茫到坚定的路径。
- 势力线：组织、敌对阵营、盟友与压力来源。
- 主题线：故事想表达的核心命题。

黄金三章要围绕九条线中的前期关键内容设计，每章包含标题、概要、开场画面、核心事件、人物变化、章末钩子。

补充要求：{{instruction}}

请只输出合法 JSON，不要 Markdown，不要解释。
`.trim()

const MALIANG_THREE_ACT_SYSTEM_PROMPT = `
你是一位经验丰富的电影编剧和戏剧理论研究者，熟悉“三幕剧结构”的使用。你知道一个好故事需要稳定、可靠、经过验证的戏剧结构。

你的任务是：根据用户提供的故事概念，运用三幕剧结构，生成专业、严谨、可执行的故事设定树和开篇黄金三章。

核心要求：
1. 理论先行：遵循第一幕建立、第二幕对抗、第三幕解决的结构，并融入激励事件、第一转折点、中点、第二转折点、高潮等关键概念。
2. 功能明确：第一幕介绍主角、世界和核心冲突；第二幕让主角面对升级障碍并成长；第三幕迎来高潮并回应核心冲突。
3. 节奏控制：体现不同幕次的节奏变化。
4. 人物弧光：主角设定和成长必须贯穿三幕，并在最终形成变化。

${MALIANG_SETTING_BASE_SYSTEM_PROMPT}
`.trim()

const MALIANG_THREE_ACT_USER_PROMPT = `
## 故事概念
{{content}}

## 创作策略：三幕剧结构
请根据故事概念，构建完整、严谨的故事设定，并给出开篇黄金三章。

设定树必须包含：
- 第一幕：建立。
- 第二幕：对抗。
- 第三幕：解决。
- 主角设定。
- 冲突核心。
- 关键转折。

第一幕下必须写出激励事件和第一转折点；第二幕下必须写出中点和第二转折点；第三幕下必须写出高潮和结局方向。

黄金三章要承担第一幕的开场任务：快速介绍主角、引出冲突、留下持续期待。每章包含标题、概要、开场画面、核心事件、人物变化、章末钩子。

补充要求：{{instruction}}

请只输出合法 JSON，不要 Markdown，不要解释。
`.trim()

const MALIANG_SHORT_VIDEO_SYSTEM_PROMPT = `
你是一位短视频编剧，熟悉短剧平台的快节奏表达。你知道用户注意力很短，优秀作品必须在短时间内完成抓人、入戏、共情、反转的体验。

你的任务是：根据用户提供的故事核心，运用视频短剧策略，生成分镜式设定树和开篇黄金三章。

核心要求：
1. 黄金三秒：开场必须有冲击力或悬念。
2. 强情节：剧情紧凑，冲突直接，反转要出人意料又合理。
3. 情绪钩子：设计能打中目标读者情绪的桥段。
4. 视觉化：所有设定都要可被拍摄或可被画面呈现。
5. 人设先行：角色标签清楚，让读者很快记住核心特征。

${MALIANG_SETTING_BASE_SYSTEM_PROMPT}
`.trim()

const MALIANG_SHORT_VIDEO_USER_PROMPT = `
## 故事核心
{{content}}

## 创作策略：视频短剧
请根据故事核心，生成一个短剧感强、冲突清楚、反转明确的完整设定，并给出开篇黄金三章。

设定树必须包含：开场抓人点、核心冲突、角色设定、情感爆点、反转设计、视觉表现、台词金句。

黄金三章要按短剧节奏设计：每章都要有强开场、强冲突、明确情绪变化和章末反转或钩子。

补充要求：{{instruction}}

请只输出合法 JSON，不要 Markdown，不要解释。
`.trim()

function builtinPreset(id, name, category, systemPrompt, userPromptTemplate, modelParams = {}) {
  return {
    id,
    name,
    category,
    systemPrompt,
    userPromptTemplate,
    modelParams: {
      temperature: modelParams.temperature ?? 0.7,
      maxTokens: modelParams.maxTokens ?? 2400,
      topP: modelParams.topP ?? 0.9
    },
    isBuiltin: true,
    isFavorite: false,
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT
  }
}

const BUILTIN_PRESETS = [
  builtinPreset(
    'maliang-setting-tomato-web-novel',
    'SYSTEM_TOMATO_WEB_NOVEL',
    'settingTree',
    MALIANG_TOMATO_SYSTEM_PROMPT,
    MALIANG_TOMATO_USER_PROMPT,
    { temperature: 0.72, maxTokens: 5200, topP: 0.92 }
  ),
  builtinPreset(
    'maliang-setting-nine-line-method',
    'SYSTEM_NINE_LINE_METHOD',
    'settingTree',
    MALIANG_NINE_LINE_SYSTEM_PROMPT,
    MALIANG_NINE_LINE_USER_PROMPT,
    { temperature: 0.68, maxTokens: 5200, topP: 0.9 }
  ),
  builtinPreset(
    'maliang-setting-three-act-structure',
    'SYSTEM_THREE_ACT_STRUCTURE',
    'settingTree',
    MALIANG_THREE_ACT_SYSTEM_PROMPT,
    MALIANG_THREE_ACT_USER_PROMPT,
    { temperature: 0.66, maxTokens: 5200, topP: 0.9 }
  ),
  builtinPreset(
    'maliang-setting-short-video-script',
    'SYSTEM_SHORT_VIDEO_SCRIPT',
    'settingTree',
    MALIANG_SHORT_VIDEO_SYSTEM_PROMPT,
    MALIANG_SHORT_VIDEO_USER_PROMPT,
    { temperature: 0.74, maxTokens: 5000, topP: 0.92 }
  ),
  builtinPreset(
    'builtin-creation-starter',
    '起笔方案',
    'topic',
    '你是中文网络小说开篇策划师。请把作者的一句话想法整理成能直接开书的方案，内容要具体，不能照搬已有作品。',
    [
      '故事想法：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请按以下结构输出：',
      '1. 作品核心：一句话说明主角、目标和最大阻碍。',
      '2. 故事发动机：说明为什么故事必须马上开始。',
      '3. 人物种子：主角、重要配角或反派，各写目标、弱点、关系。',
      '4. 世界规则：写出和剧情有关的规则、限制和代价。',
      '5. 起笔三章：每章写开场、冲突、结尾钩子。',
      '6. 写作注意：写出容易写偏的地方和修正建议。'
    ].join('\n'),
    { temperature: 0.72, maxTokens: 4200, topP: 0.92 }
  ),
  builtinPreset(
    'builtin-topic-card',
    '选题卡生成',
    'topic',
    '你是网络小说选题顾问。请根据灵感生成原创选题卡，重点说明读者为什么愿意继续读。',
    [
      '灵感或市场信息：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出：书名方向、题材、目标读者、主角设定、核心冲突、主要看点、前三章钩子、风险提醒。'
    ].join('\n'),
    { temperature: 0.74, maxTokens: 3200, topP: 0.92 }
  ),
  builtinPreset(
    'builtin-golden-chapters',
    '黄金三章',
    'golden_chapters',
    '你是小说开篇编辑。请为前三章设计清晰的冲突、期待和阶段回报，让开篇更容易读下去。',
    [
      '选题或设定：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出三章方案：',
      '- 第 1 章：用具体场景开局，快速出现冲突。',
      '- 第 2 章：扩大危机或期待，补足主角动机。',
      '- 第 3 章：给出阶段回报，同时留下更大的问题。',
      '',
      '每章都要包含开场画面、核心事件、人物变化、章末钩子。'
    ].join('\n'),
    { temperature: 0.7, maxTokens: 3600, topP: 0.9 }
  ),
  builtinPreset(
    'builtin-continue-write',
    '续写默认',
    'continueWrite',
    '你是小说续写助手。请根据已有内容自然续写，保持人称、视角、文风和剧情节奏一致。',
    [
      '原文：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '续写要求：',
      '- 不复述原文。',
      '- 不跳过当前冲突。',
      '- 延续人物当前目标和情绪。',
      '- 只输出续写正文。'
    ].join('\n'),
    { temperature: 0.7, maxTokens: 2600, topP: 0.9 }
  ),
  builtinPreset(
    'builtin-polish',
    '润色默认',
    'polish',
    '你是小说文字编辑。请在不改变剧情事实和作者本意的前提下，让表达更顺、更有画面感。',
    [
      '待润色文本：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '润色要求：',
      '- 保留原有情节和人物关系。',
      '- 优先处理病句、重复、节奏拖沓和表达生硬。',
      '- 不新增大段设定。',
      '- 只输出润色后的正文。'
    ].join('\n'),
    { temperature: 0.52, maxTokens: 2600, topP: 0.86 }
  ),
  builtinPreset(
    'builtin-rewrite',
    '改写默认',
    'rewrite',
    '你是小说改写助手。请按作者要求改写文本，保留关键剧情，改变表达方式、氛围或叙述角度。',
    [
      '待改写文本：',
      '{{content}}',
      '',
      '改写要求：{{instruction}}',
      '',
      '请先理解原文事件，再输出改写后的正文。不要解释改写过程。'
    ].join('\n'),
    { temperature: 0.68, maxTokens: 2800, topP: 0.9 }
  ),
  builtinPreset(
    'builtin-expand',
    '扩写默认',
    'expand',
    '你是小说场景扩写助手。请把简略剧情扩写成可阅读正文，补充动作、心理、对话和环境。',
    [
      '待扩写内容：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '扩写要求：',
      '- 重点补足人物行动和当下情绪。',
      '- 对话要推动关系或冲突。',
      '- 环境描写服务剧情，不要单独堆描写。',
      '- 只输出扩写后的正文。'
    ].join('\n'),
    { temperature: 0.75, maxTokens: 3200, topP: 0.92 }
  ),
  builtinPreset(
    'builtin-summarize',
    '总结默认',
    'summarize',
    '你是小说内容整理助手。请基于输入内容提取要点，不能编造原文没有的信息。',
    [
      '待总结内容：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出：核心事件、人物动向、设定信息、未解决问题、可继续写作的线索。'
    ].join('\n'),
    { temperature: 0.35, maxTokens: 2400, topP: 0.85 }
  ),
  builtinPreset(
    'builtin-logic-check',
    '剧情逻辑检查',
    'summarize',
    '你是小说剧情编辑。请检查文本中的逻辑问题、人物动机断裂、设定冲突和信息缺口。',
    [
      '待检查内容：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出：',
      '1. 没问题的部分。',
      '2. 可能出问题的部分，并说明原因。',
      '3. 可直接改的修正建议。',
      '4. 需要作者确认的问题。'
    ].join('\n'),
    { temperature: 0.32, maxTokens: 3000, topP: 0.84 }
  ),
  builtinPreset(
    'builtin-outline-refine',
    '大纲生成',
    'outline',
    '你是小说大纲策划师。请把故事方向整理成能连续写作的大纲，情节要清楚，人物目标要稳定。',
    [
      '故事方向：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出：故事主线、主要人物、世界规则、分卷安排、重要转折、前三章细纲、后续悬念。'
    ].join('\n'),
    { temperature: 0.62, maxTokens: 4200, topP: 0.9 }
  ),
  builtinPreset(
    'builtin-instance-design',
    '副本单元设计',
    'outline',
    '你是单元剧情设计助手。请设计一次完整的任务、副本或阶段剧情，让它能放进长篇小说。',
    [
      '副本或单元想法：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出：进入原因、目标、限制、关键人物、危险、奖励、反转、结尾影响。'
    ].join('\n'),
    { temperature: 0.68, maxTokens: 3400, topP: 0.9 }
  ),
  builtinPreset(
    'builtin-plot-evolution',
    '剧情推演',
    'plotEvolution',
    '你是小说剧情顾问。请根据已有情节给出 2 到 3 个后续方向，每个方向都要能继续写。',
    [
      '当前剧情：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '每个方向请包含：后续事件、人物选择、冲突变化、读者期待、可能风险。最后给出推荐方向。'
    ].join('\n'),
    { temperature: 0.78, maxTokens: 3600, topP: 0.94 }
  ),
  builtinPreset(
    'builtin-chapter-hook',
    '章末钩子',
    'plot',
    '你是章节结尾编辑。请根据本章内容生成章末钩子，让读者愿意进入下一章。',
    [
      '本章内容和下一章方向：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请给出 5 个不同钩子，每个包含：钩子正文、适合的位置、带来的期待。'
    ].join('\n'),
    { temperature: 0.76, maxTokens: 2600, topP: 0.92 }
  ),
  builtinPreset(
    'builtin-conflict-boost',
    '加强冲突',
    'rewrite',
    '你是小说冲突设计助手。请强化人物目标、阻碍和对抗，让场景更有推进力。',
    [
      '当前剧情：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出改写后的剧情，并在末尾列出你强化了哪些冲突点。'
    ].join('\n'),
    { temperature: 0.72, maxTokens: 3000, topP: 0.9 }
  ),
  builtinPreset(
    'builtin-selling-point-boost',
    '加强爽点',
    'rewrite',
    '你是网络小说情绪编辑。请强化期待、回报、反差和人物高光，避免空泛夸张。',
    [
      '当前剧情：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出改写后的剧情，并说明本段的期待、回报和后续钩子。'
    ].join('\n'),
    { temperature: 0.74, maxTokens: 3000, topP: 0.92 }
  ),
  builtinPreset(
    'builtin-character',
    '人物生成',
    'character',
    '你是小说人物设定助手。请生成能参与剧情的人物，而不是只有标签的人设。',
    [
      '故事方向或人物需求：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出：人物定位、外在身份、真正欲望、恐惧、矛盾点、成长线、和主角关系、可用场景、代表性台词。'
    ].join('\n'),
    { temperature: 0.68, maxTokens: 3200, topP: 0.9 }
  ),
  builtinPreset(
    'builtin-character-relationship',
    '人物关系',
    'character',
    '你是小说人物关系设计助手。请把人物关系整理成能制造选择、误会、冲突和情感牵引的关系网。',
    [
      '人物列表或现有关系：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出：关系概览、核心矛盾、隐藏信息、关系变化节点、可写场景。'
    ].join('\n'),
    { temperature: 0.66, maxTokens: 3200, topP: 0.9 }
  ),
  builtinPreset(
    'builtin-world',
    '世界观生成',
    'world',
    '你是小说世界观设定助手。请生成和剧情有关的规则、代价、限制、组织、地点和冲突来源。',
    [
      '故事方向或世界观想法：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出：核心规则、能力或资源、限制与代价、主要组织、关键地点、普通人的生活、可用冲突、容易写错的地方。'
    ].join('\n'),
    { temperature: 0.62, maxTokens: 4200, topP: 0.9 }
  ),
  builtinPreset(
    'builtin-setting-tree',
    '设定树生成',
    'settingTree',
    '你是小说设定整理助手。请根据输入内容生成层次清楚的设定树，让作者能继续补充和检索。',
    [
      '设定资料：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请按树形结构输出：世界规则、人物、组织、地点、物品、术语、未定问题。每项都写清剧情用途。'
    ].join('\n'),
    { temperature: 0.5, maxTokens: 4200, topP: 0.88 }
  ),
  builtinPreset(
    'builtin-extraction-narrative',
    '拆书-文风叙事',
    'extraction',
    '你是小说文本分析助手。请只基于原文提取文风、叙事方式和可学习写法，不要编造原文没有的信息。',
    [
      '小说文本：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出：叙事视角、句式特点、对话密度、节奏变化、描写方式、可复用技巧、原文例子。'
    ].join('\n'),
    { temperature: 0.32, maxTokens: 4200, topP: 0.85 }
  ),
  builtinPreset(
    'builtin-extraction-plot',
    '拆书-情节设计',
    'extraction',
    '你是小说情节分析助手。请从原文中提取冲突、悬念、伏笔、反转和章节推进方式。',
    [
      '小说文本：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出：核心冲突、悬念设置、信息释放、伏笔与回收、人物选择、章末钩子、可学习写法。'
    ].join('\n'),
    { temperature: 0.32, maxTokens: 4200, topP: 0.85 }
  ),
  builtinPreset(
    'builtin-extraction-outline',
    '拆书-章节大纲',
    'extraction',
    '你是小说章节整理助手。请按章节顺序提取大纲，标题、事件和人物变化必须来自原文。',
    [
      '小说文本：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请按章节输出：章节标题、核心事件、人物变化、冲突、关键设定、章末钩子。不要新增原文没有的章节。'
    ].join('\n'),
    { temperature: 0.28, maxTokens: 5200, topP: 0.82 }
  ),
  builtinPreset(
    'builtin-extraction-world',
    '拆书-设定提取',
    'extraction',
    '你是小说设定提取助手。请从文本中提取人物、地点、组织、规则和专有名词，并说明它们的剧情用途。',
    [
      '小说文本：',
      '{{content}}',
      '',
      '补充要求：{{instruction}}',
      '',
      '请输出：人物设定、世界规则、组织势力、地点、术语、道具、还没有解释清楚的信息。'
    ].join('\n'),
    { temperature: 0.3, maxTokens: 4600, topP: 0.84 }
  ),
  builtinPreset(
    'builtin-chat',
    'AI 聊天默认',
    'chat',
    '你是友好的 AI 写作助手，可以回答写作问题，也可以帮助作者整理情节、人物和设定。',
    '{{content}}',
    { temperature: 0.7, maxTokens: 2200, topP: 0.9 }
  )
]

function getPresetsFilePath(bookPath) {
  return join(bookPath, 'prompt_presets.json')
}

function cleanPresetText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberOrDefault(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeModelParams(preset = {}) {
  const source =
    preset.modelParams && typeof preset.modelParams === 'object' ? preset.modelParams : preset
  return {
    temperature: numberOrDefault(source.temperature, 0.7),
    maxTokens: numberOrDefault(source.maxTokens, 2000),
    topP: numberOrDefault(source.topP, 0.9)
  }
}

function normalizeScopeFields(preset = {}, fallback = {}) {
  const bookPath = cleanPresetText(preset.bookPath) || cleanPresetText(fallback.bookPath)
  const bookId = cleanPresetText(preset.bookId) || cleanPresetText(fallback.bookId)
  const bookName = cleanPresetText(preset.bookName) || cleanPresetText(fallback.bookName)
  const bookFolderName =
    cleanPresetText(preset.bookFolderName) || cleanPresetText(fallback.bookFolderName)
  const sourceScope = cleanPresetText(preset.scope) || cleanPresetText(fallback.scope)
  const hasBook = Boolean(bookPath || bookId || bookName || bookFolderName)
  const scope = sourceScope === 'book' || hasBook ? 'book' : 'global'

  if (scope !== 'book') {
    return {
      scope: sourceScope === 'builtin' ? 'builtin' : 'global',
      bookPath: '',
      bookId: '',
      bookName: '',
      bookFolderName: ''
    }
  }

  return {
    scope: 'book',
    bookPath,
    bookId,
    bookName,
    bookFolderName
  }
}

function normalizePresetForRead(preset = {}, fallback = {}) {
  const modelParams = normalizeModelParams(preset)
  const scopeFields = normalizeScopeFields(preset, fallback)
  return {
    ...preset,
    ...scopeFields,
    modelParams,
    temperature: modelParams.temperature,
    maxTokens: modelParams.maxTokens,
    topP: modelParams.topP,
    sourcePresetId: cleanPresetText(preset.sourcePresetId)
  }
}

function buildCustomPreset(preset = {}, fallback = {}, existing = {}) {
  const now = new Date().toISOString()
  const modelParams = normalizeModelParams({ ...existing, ...preset })
  const scopeFields = normalizeScopeFields(preset, fallback)
  const favorite = Boolean(
    preset.favorite ?? preset.isFavorite ?? existing.favorite ?? existing.isFavorite ?? false
  )
  const sourcePresetId =
    cleanPresetText(preset.sourcePresetId) || cleanPresetText(existing.sourcePresetId)

  return {
    id:
      cleanPresetText(preset.id) ||
      cleanPresetText(existing.id) ||
      `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: preset.name || existing.name || '',
    category: preset.category || existing.category || 'chat',
    systemPrompt: preset.systemPrompt ?? existing.systemPrompt ?? '',
    userPromptTemplate: preset.userPromptTemplate ?? existing.userPromptTemplate ?? '',
    modelParams,
    temperature: modelParams.temperature,
    maxTokens: modelParams.maxTokens,
    topP: modelParams.topP,
    isBuiltin: false,
    isFavorite: favorite,
    favorite,
    sourcePresetId,
    ...scopeFields,
    createdAt: existing.createdAt || preset.createdAt || now,
    updatedAt: now
  }
}

function loadCustomPresets(bookPath) {
  return safeReadJson(getPresetsFilePath(bookPath), [])
}

function saveCustomPresets(bookPath, presets) {
  safeWriteJson(getPresetsFilePath(bookPath), presets)
}

function listPresets(bookPath, options = {}) {
  const custom = loadCustomPresets(bookPath).map((preset) =>
    normalizePresetForRead(preset, options.scope || options)
  )
  const builtins =
    options.includeBuiltins === false
      ? []
      : BUILTIN_PRESETS.map((preset) => normalizePresetForRead(preset, { scope: 'builtin' }))
  return [...builtins, ...custom]
}

function createPreset(bookPath, preset, options = {}) {
  const custom = loadCustomPresets(bookPath)
  const newPreset = buildCustomPreset(
    options.preserveId ? preset : { ...preset, id: '' },
    options.scope || options
  )
  custom.push(newPreset)
  saveCustomPresets(bookPath, custom)
  return newPreset
}

function updatePreset(bookPath, presetId, updates, options = {}) {
  const custom = loadCustomPresets(bookPath)
  const index = custom.findIndex((p) => p.id === presetId)
  if (index === -1) return null

  const builtin = BUILTIN_PRESETS.find((p) => p.id === presetId)
  if (builtin) return null

  custom[index] = buildCustomPreset(
    { ...custom[index], ...updates, id: custom[index].id },
    options.scope || options,
    custom[index]
  )
  saveCustomPresets(bookPath, custom)
  return custom[index]
}

function deletePreset(bookPath, presetId) {
  const builtin = BUILTIN_PRESETS.find((p) => p.id === presetId)
  if (builtin) return false

  const custom = loadCustomPresets(bookPath)
  const index = custom.findIndex((p) => p.id === presetId)
  if (index === -1) return false

  custom.splice(index, 1)
  saveCustomPresets(bookPath, custom)
  return true
}

function exportPresets(bookPath) {
  const all = listPresets(bookPath)
  return JSON.stringify(all, null, 2)
}

function importPresets(bookPath, jsonString, options = {}) {
  let imported
  try {
    imported = JSON.parse(jsonString)
  } catch {
    return []
  }

  if (!Array.isArray(imported)) return []

  const custom = loadCustomPresets(bookPath)
  const results = []

  for (const item of imported) {
    if (!item || typeof item !== 'object') continue

    const newPreset = buildCustomPreset({ ...item, id: '' }, options.scope || options)
    custom.push(newPreset)
    results.push(newPreset)
  }

  saveCustomPresets(bookPath, custom)
  return results
}

export { listPresets, createPreset, updatePreset, deletePreset, exportPresets, importPresets }
