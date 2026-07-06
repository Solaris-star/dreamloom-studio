import fs from 'node:fs'
import { join, resolve } from 'node:path'

const OUTPUT_MODES = ['preview', 'chapter_write', 'asset', 'import']

const DEFAULT_CONTEXT_SCOPES = ['book_meta', 'characters', 'dictionary', 'settings', 'timelines', 'knowledge']
const WRITING_SKILL_DIR = join('resources', 'writing-skills')

const BUILTIN_WRITING_SKILLS = [
  {
    id: 'story-start',
    key: 'golden',
    label: '黄金三章',
    category: '起书',
    description: '生成开书方案、前三章安排和第一章开篇提示。',
    instruction: '帮我基于当前作品生成一版黄金三章方案，包含主角、金手指、世界观、前三章大纲和第一章开篇钩子。',
    inputScopes: ['current_book'],
    requiredContext: ['book_meta', 'settings', 'characters', 'knowledge'],
    references: ['skills/story-start', 'agents/writer', 'agents/editor'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'golden_three_chapters'
  },
  {
    id: 'cheat-ability',
    key: 'cheat',
    label: '金手指设定',
    category: '起书',
    description: '生成适配题材的核心能力、限制、代价和升级方式。',
    instruction: '帮我设计一个适合当前题材的金手指，说明能力、限制、代价、升级方式和误用风险。',
    inputScopes: ['current_book'],
    requiredContext: ['book_meta', 'settings', 'characters', 'knowledge'],
    references: ['skills/story-long-write', 'references/plot-special-topics', 'agents/writer'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'cheat_ability'
  },
  {
    id: 'book-outline',
    key: 'book_outline',
    label: '全书大纲',
    category: '起书',
    description: '按卷规划主线、阶段目标、关键转折和章末期待。',
    instruction: '帮我规划当前作品全书大纲，按卷列出主线、阶段目标、关键转折和章末期待。',
    inputScopes: ['current_book'],
    requiredContext: ['book_meta', 'settings', 'characters', 'knowledge'],
    references: ['skills/story-long-write', 'references/outline-methods', 'agents/editor'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'book_outline'
  },
  {
    id: 'story-long-write',
    key: 'continue',
    label: '续写',
    category: '写作',
    description: '按当前章节和作品资料续写正文。',
    instruction: '请承接当前章节继续写，只输出新增正文。',
    inputScopes: ['current_chapter', 'previous_summary', 'outline'],
    requiredContext: DEFAULT_CONTEXT_SCOPES,
    references: ['skills/story-long-write', 'agents/writer', 'agents/editor', 'hooks/chapter-write-guard'],
    canWriteChapter: true,
    outputMode: 'chapter_write',
    runner: 'chapter_write',
    type: 'continue'
  },
  {
    id: 'story-polish',
    key: 'polish',
    label: '润色',
    category: '写作',
    description: '润色选中文本，增强画面感，不改变剧情事实。',
    instruction: '请润色我选中的文本，增强画面感，但不要改变剧情。',
    inputScopes: ['selected_text'],
    requiredContext: ['book_meta', 'characters', 'dictionary', 'settings'],
    references: ['skills/story-deslop', 'references/anti-ai-writing', 'agents/writer'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    requireSelection: true,
    type: 'polish'
  },
  {
    id: 'story-rewrite',
    key: 'rewrite',
    label: '改写',
    category: '写作',
    description: '按要求改写选中文本，保留人物、设定和剧情顺序。',
    instruction: '请按我的要求改写选中文本，保留剧情事实。',
    inputScopes: ['selected_text'],
    requiredContext: ['book_meta', 'characters', 'dictionary', 'settings'],
    references: ['skills/story-deslop', 'agents/writer', 'hooks/preview-only'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    requireSelection: true,
    type: 'rewrite'
  },
  {
    id: 'story-expand',
    key: 'expand',
    label: '扩写',
    category: '写作',
    description: '扩写选中文本，补充动作、心理、环境和对话。',
    instruction: '请扩写选中文本，补充动作、心理、环境和对话。',
    inputScopes: ['selected_text'],
    requiredContext: ['book_meta', 'characters', 'dictionary', 'settings'],
    references: ['skills/story-long-write', 'references/writing-craft', 'agents/writer'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    requireSelection: true,
    type: 'expand'
  },
  {
    id: 'dialogue-enhance',
    key: 'dialogue',
    label: '对话增强',
    category: '写作',
    description: '增强选中文本里的对话，让语气更贴合角色。',
    instruction: '请增强选中文本中的对话，让角色语气更鲜明，但不改变剧情。',
    inputScopes: ['selected_text'],
    requiredContext: ['book_meta', 'characters', 'dictionary', 'settings'],
    references: ['skills/story-long-write', 'references/dialogue-mastery', 'agents/writer'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    requireSelection: true,
    type: 'dialogue_enhance'
  },
  {
    id: 'story-review',
    key: 'setting_check',
    label: '审稿',
    category: '审稿',
    description: '检查正文的设定、人物、节奏和可读性问题。',
    instruction: '请审阅当前章节，指出设定冲突、人物动机问题、节奏问题和需要改写的位置。',
    inputScopes: ['selected_text', 'current_chapter'],
    requiredContext: DEFAULT_CONTEXT_SCOPES,
    references: ['skills/story-review', 'agents/editor', 'references/story-rules'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'story_review'
  },
  {
    id: 'story-deslop',
    key: 'deslop',
    label: '去 AI 味',
    category: '写作',
    description: '把文本改得更像自然中文小说表达，保留剧情事实。',
    instruction: '请处理选中文本的 AI 味，减少空泛表达和机械句式，保留剧情事实，只输出改写后的正文。',
    inputScopes: ['selected_text'],
    requiredContext: ['book_meta', 'characters', 'dictionary', 'settings'],
    references: ['skills/story-deslop', 'agents/writer', 'references/style'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    requireSelection: true,
    type: 'deslop'
  },
  {
    id: 'story-import',
    key: 'join_book',
    label: '导入',
    category: '导入',
    description: '把外部文本整理成可加入作品的素材草稿。',
    instruction: '请把当前内容整理成可导入作品的资料草稿，标出来源、用途和需要我确认的地方。',
    inputScopes: ['selected_text', 'current_chapter', 'reference_items'],
    requiredContext: ['book_meta', 'settings', 'knowledge'],
    references: ['skills/story-import', 'hooks/import-preview'],
    canWriteChapter: false,
    outputMode: 'import',
    runner: 'editor_preview',
    type: 'story_import'
  },
  {
    id: 'story-split',
    key: 'summary',
    label: '拆文',
    category: '拆书',
    description: '把章节拆成剧情、人物、设定、写法和可借鉴内容。',
    instruction: '请总结当前章节，列出剧情进展、人物变化、设定信息、写法特点和可延续线索。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'characters', 'dictionary', 'settings', 'knowledge'],
    references: ['skills/story-split', 'references/book-analysis'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'summarize'
  },
  {
    id: 'extract-worldbuilding',
    key: 'extract_world',
    label: '提炼世界观',
    category: '拆书',
    description: '从当前章节提炼世界规则、组织、地点和术语。',
    instruction: '请只基于当前章节，提炼出现过的世界规则、组织、地点和术语。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'settings', 'dictionary'],
    references: ['skills/story-import', 'references/structure-mapping-long'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'extract_worldbuilding'
  },
  {
    id: 'extract-hooks',
    key: 'hooks',
    label: '提炼爽点',
    category: '拆书',
    description: '从当前章节提炼爽点结构、情绪节奏和可借鉴写法。',
    instruction: '请只基于当前章节，提炼这一章的爽点结构、情绪节奏和可借鉴写法。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'settings', 'knowledge'],
    references: ['skills/story-long-analyze', 'references/hooks-chapter'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'extract_hook'
  },
  {
    id: 'extract-characters',
    key: 'characters',
    label: '提炼人物',
    category: '拆书',
    description: '从当前章节提炼人物身份、目标、关系和写法。',
    instruction: '请从当前章节提炼人物身份、目标、关系和写法。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'characters', 'settings'],
    references: ['skills/story-import', 'references/character-state-reverse'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'extract_character'
  },
  {
    id: 'extract-style',
    key: 'style',
    label: '提炼写法',
    category: '拆书',
    description: '从当前章节提炼可复用写法，只给方法和例子。',
    instruction: '请提炼当前章节可借鉴的写法，只给方法和例子，不照搬原文。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'knowledge'],
    references: ['skills/story-long-analyze', 'references/style-profile-protocol'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'extract_style'
  },
  {
    id: 'extract-foreshadowing',
    key: 'foreshadowing',
    label: '提炼伏笔',
    category: '拆书',
    description: '从当前章节提炼已埋设或已回收的伏笔线索。',
    instruction: '请只基于当前章节，提炼本章埋设或回收的伏笔线索。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'settings', 'timelines'],
    references: ['skills/story-long-write', 'references/state-tracking'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'extract_foreshadowing'
  },
  {
    id: 'character-card',
    key: 'character_card',
    label: '人物设定',
    category: '设定',
    description: '基于章节生成待确认的人物设定草稿。',
    instruction: '请基于当前章节生成一份人物设定草稿，等待我确认后再保存。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'characters', 'settings'],
    references: ['skills/story-long-write', 'references/character-basics'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'character_card'
  },
  {
    id: 'relationship-map',
    key: 'relationship',
    label: '人物关系',
    category: '设定',
    description: '整理人物关系、态度变化和潜在冲突。',
    instruction: '请基于当前章节和已有资料，整理人物关系和潜在冲突。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'characters', 'settings'],
    references: ['skills/story-long-write', 'references/character-relations'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'relationship'
  },
  {
    id: 'worldbuilding-card',
    key: 'world_card',
    label: '世界观设定',
    category: '设定',
    description: '生成待确认的世界观设定草稿，标明来源和不确定处。',
    instruction: '请基于当前章节生成世界观设定草稿，标明来源和不确定处。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'settings', 'dictionary'],
    references: ['skills/story-long-write', 'references/artifact-protocols'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'worldbuilding_card'
  },
  {
    id: 'timeline-card',
    key: 'timeline',
    label: '时间线',
    category: '设定',
    description: '整理关键事件，并检查时间顺序是否冲突。',
    instruction: '请整理当前章节前后的关键事件，并检查时间顺序是否冲突。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'timelines', 'settings', 'characters'],
    references: ['skills/story-long-write', 'references/state-tracking'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'timeline'
  },
  {
    id: 'cover-brief',
    key: 'cover_image',
    label: '封面图',
    category: '绘图',
    description: '生成封面图 Prompt 和视觉要求。',
    instruction: '帮我为当前作品生成封面图 Prompt，突出题材、主角和核心卖点。',
    inputScopes: ['current_book'],
    requiredContext: ['book_meta', 'characters', 'settings', 'knowledge'],
    references: ['skills/cover-brief', 'agents/image-prompt'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'cover_prompt'
  },
  {
    id: 'character-image-brief',
    key: 'character_image',
    label: '角色绘图',
    category: '绘图',
    description: '生成角色绘图方案和图片模型 Prompt。',
    instruction: '帮我为当前章节中的角色生成角色绘图方案，并输出可用于图片模型的 Prompt。',
    inputScopes: ['current_chapter', 'selected_text'],
    requiredContext: ['book_meta', 'characters', 'settings'],
    references: ['skills/story-cover', 'agents/image-prompt'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'character_image_prompt'
  },
  {
    id: 'scene-image-brief',
    key: 'scene_image',
    label: '场景绘图',
    category: '绘图',
    description: '生成场景图 Prompt，突出氛围、构图和关键物件。',
    instruction: '帮我为当前章节生成场景图 Prompt，突出氛围、构图和关键物件。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'settings', 'characters'],
    references: ['skills/story-cover', 'agents/image-prompt'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'scene_prompt'
  },
  {
    id: 'map-image-brief',
    key: 'map_image',
    label: '地图',
    category: '绘图',
    description: '生成作品地图 Prompt，包含重要地点和势力范围。',
    instruction: '帮我生成当前作品地图 Prompt，包含重要地点、势力范围和视觉风格。',
    inputScopes: ['current_book'],
    requiredContext: ['book_meta', 'settings', 'dictionary', 'knowledge'],
    references: ['skills/story-cover', 'agents/image-prompt'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'map_prompt'
  },
  {
    id: 'image-prompt',
    key: 'image_prompt',
    label: '图片 Prompt',
    category: '绘图',
    description: '把视觉需求整理成可给图片模型使用的 Prompt。',
    instruction: '请把当前视觉需求整理成可直接给图片模型使用的 Prompt。',
    inputScopes: ['selected_text', 'current_chapter', 'current_book'],
    requiredContext: ['book_meta', 'settings', 'characters'],
    references: ['skills/story-cover', 'agents/image-prompt'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'image_prompt'
  },
  {
    id: 'character-profile',
    key: 'protagonist',
    label: '主角设定',
    category: '起书',
    description: '生成主角目标、缺陷、成长线和读者期待。',
    instruction: '帮我设计当前作品的主角设定，包括目标、缺陷、成长线和读者期待。',
    inputScopes: ['current_book'],
    requiredContext: ['book_meta', 'settings', 'knowledge'],
    references: ['skills/character-profile', 'references/character'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'protagonist_setup'
  },
  {
    id: 'world-start',
    key: 'world_start',
    label: '世界观起盘',
    category: '起书',
    description: '生成世界规则、势力、地点和主要冲突。',
    instruction: '帮我生成当前作品的世界规则、势力、地点和主要冲突。',
    inputScopes: ['current_book'],
    requiredContext: ['book_meta', 'settings', 'dictionary', 'knowledge'],
    references: ['skills/world-start', 'references/worldbuilding'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'worldbuilding_start'
  },
  {
    id: 'opening-hook',
    key: 'opening',
    label: '第一章开篇',
    category: '起书',
    description: '生成第一章开场、冲突和章末悬念。',
    instruction: '帮我生成第一章开篇方案，包含开场钩子、视角、冲突和章末悬念。',
    inputScopes: ['current_book'],
    requiredContext: DEFAULT_CONTEXT_SCOPES,
    references: ['skills/opening-hook', 'agents/writer', 'agents/editor'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'opening_hook'
  },
  {
    id: 'rhythm-review',
    key: 'rhythm',
    label: '检查节奏',
    category: '审稿',
    description: '检查章节节奏、情绪推进和跳转。',
    instruction: '请检查当前章节节奏，指出拖慢、跳跃和情绪不足的位置。',
    inputScopes: ['current_chapter'],
    requiredContext: ['book_meta', 'characters', 'settings', 'timelines'],
    references: ['skills/story-review', 'references/rhythm'],
    canWriteChapter: false,
    outputMode: 'preview',
    runner: 'editor_preview',
    type: 'rhythm_check'
  },
  {
    id: 'material-card',
    key: 'save_material',
    label: '保存素材',
    category: '素材',
    description: '把结果整理成待确认的素材卡。',
    instruction: '请把当前结果整理成素材卡，保留来源和用途。',
    inputScopes: ['selected_text', 'current_chapter', 'reference_items'],
    requiredContext: ['book_meta', 'knowledge'],
    references: ['skills/material-card', 'hooks/preview-only'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'material_card'
  },
  {
    id: 'idea-card',
    key: 'idea_card',
    label: '转成灵感卡',
    category: '素材',
    description: '把当前内容转成灵感卡，保留来源和适用场景。',
    instruction: '请把当前内容转成灵感卡，包含可借鉴点和改写方向。',
    inputScopes: ['selected_text', 'current_chapter', 'reference_items'],
    requiredContext: ['book_meta', 'knowledge'],
    references: ['skills/story-import', 'hooks/preview-only'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'idea_card'
  },
  {
    id: 'asset-draft',
    key: 'send_asset',
    label: '发送到资产台',
    category: '素材',
    description: '把当前结果整理成可写入作品资产台的资料草稿。',
    instruction: '请把当前结果整理成可写入作品资产台的资料草稿，等待我确认。',
    inputScopes: ['selected_text', 'current_chapter', 'reference_items'],
    requiredContext: ['book_meta', 'knowledge'],
    references: ['skills/story-import', 'hooks/asset-preview'],
    canWriteChapter: false,
    outputMode: 'asset',
    runner: 'editor_preview',
    type: 'asset_draft'
  }
]

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function arrayOfText(value) {
  return Array.isArray(value)
    ? value.map(cleanText).filter(Boolean)
    : []
}

function normalizeSkill(skill = {}) {
  const id = cleanText(skill.id || skill.key)
  const key = cleanText(skill.key || id)
  const label = cleanText(skill.label || skill.title)
  const category = cleanText(skill.category) || '写作'
  const outputMode = cleanText(skill.outputMode) || 'preview'
  return {
    id,
    key,
    label,
    category,
    description: cleanText(skill.description),
    instruction: cleanText(skill.instruction),
    inputScopes: arrayOfText(skill.inputScopes),
    requiredContext: arrayOfText(skill.requiredContext),
    references: arrayOfText(skill.references),
    canWriteChapter: skill.canWriteChapter === true,
    outputMode: OUTPUT_MODES.includes(outputMode) ? outputMode : 'preview',
    runner: cleanText(skill.runner) || 'editor_preview',
    requireSelection: skill.requireSelection === true,
    type: cleanText(skill.type || key),
    installed: skill.installed !== false,
    source: cleanText(skill.source) || 'builtin',
    sourcePath: cleanText(skill.sourcePath)
  }
}

function assertValidSkill(skill = {}) {
  if (!skill.id) throw new Error('writing skill 缺少 id')
  if (!skill.key) throw new Error(`writing skill ${skill.id} 缺少 key`)
  if (!skill.label) throw new Error(`writing skill ${skill.id} 缺少名称`)
  if (!skill.instruction) throw new Error(`writing skill ${skill.id} 缺少默认指令`)
  if (!OUTPUT_MODES.includes(skill.outputMode)) {
    throw new Error(`writing skill ${skill.id} 的输出方式无效`)
  }
  if (skill.outputMode === 'chapter_write' && skill.canWriteChapter !== true) {
    throw new Error(`writing skill ${skill.id} 声明写入章节时必须允许写正文`)
  }
  if (skill.outputMode !== 'chapter_write' && skill.canWriteChapter === true) {
    throw new Error(`writing skill ${skill.id} 允许写正文时输出方式必须是 chapter_write`)
  }
  return skill
}

export function normalizeWritingSkill(skill = {}) {
  return assertValidSkill(normalizeSkill(skill))
}

function candidateSkillRoots() {
  const roots = [
    resolve(process.cwd(), WRITING_SKILL_DIR)
  ]
  if (process.resourcesPath) {
    roots.push(resolve(process.resourcesPath, WRITING_SKILL_DIR))
  }
  return Array.from(new Set(roots))
}

function readExternalSkillFile(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8') || 'null')
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('skill.json 必须是对象')
    }
    return normalizeWritingSkill({
      ...data,
      source: 'external',
      sourcePath: filePath
    })
  } catch (error) {
    console.warn(`跳过 writing skill：${filePath}，${error.message || error}`)
    return null
  }
}

function loadExternalWritingSkills() {
  const skills = []
  for (const root of candidateSkillRoots()) {
    if (!fs.existsSync(root)) continue
    let entries = []
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch (error) {
      console.warn(`读取 writing skill 目录失败：${root}，${error.message || error}`)
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skill = readExternalSkillFile(join(root, entry.name, 'skill.json'))
      if (skill) skills.push(skill)
    }
  }
  return skills
}

function mergeWritingSkills(skills = []) {
  const rows = []
  const indexById = new Map()
  const indexByKey = new Map()
  for (const skill of skills) {
    const existingIndex = indexById.get(skill.id) ?? indexByKey.get(skill.key)
    if (existingIndex != null) {
      rows[existingIndex] = skill
    } else {
      rows.push(skill)
    }
    indexById.set(skill.id, existingIndex ?? rows.length - 1)
    indexByKey.set(skill.key, existingIndex ?? rows.length - 1)
  }
  return rows
}

export function listWritingSkills() {
  const builtin = BUILTIN_WRITING_SKILLS.map((skill) =>
    normalizeWritingSkill({ ...skill, source: 'builtin' })
  )
  return mergeWritingSkills([...builtin, ...loadExternalWritingSkills()])
}

export function getWritingSkill(skillIdOrKey = '') {
  const value = cleanText(skillIdOrKey)
  if (!value) return null
  return listWritingSkills().find((skill) => skill.id === value || skill.key === value) || null
}

export function groupWritingSkills(skills = listWritingSkills()) {
  const groups = []
  const groupMap = new Map()
  for (const skill of skills) {
    const category = cleanText(skill.category) || '写作'
    if (!groupMap.has(category)) {
      const group = { name: category, items: [] }
      groupMap.set(category, group)
      groups.push(group)
    }
    groupMap.get(category).items.push(skill)
  }
  return groups
}

export default {
  listWritingSkills,
  getWritingSkill,
  groupWritingSkills,
  normalizeWritingSkill
}
