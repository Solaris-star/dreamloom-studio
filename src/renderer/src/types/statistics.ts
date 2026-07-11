/**
 * 统计数据类型定义
 */

/**
 * 写作字数记录
 */
export interface WordCountLog {
  id: string
  bookId: string
  chapterId?: string
  date: string // YYYY-MM-DD
  wordCount: number // 当前章节/书的总字数
  delta: number // 变化量（净增）
  createdAt: number // 时间戳
}

/**
 * AI 使用日志
 */
export interface AiUsageLog {
  id: string
  bookId?: string
  chapterId?: string
  feature:
    | 'polish'
    | 'continue'
    | 'cover'
    | 'character_image'
    | 'scene_image'
    | 'name_generator'
    | 'idea'
    | 'other'
  model?: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  success: boolean
  createdAt: number
}

/**
 * 写作目标
 */
export interface WritingGoal {
  id: string
  type: 'daily' | 'weekly' | 'monthly' | 'book_total'
  bookId?: string
  targetWords: number
  enabled: boolean
  createdAt: number
  updatedAt: number
}

/**
 * 统计概览
 */
export interface StatisticsOverview {
  totalWords: number
  todayWords: number
  monthWords: number
  streakDays: number
  maxStreakDays: number
  totalAiTokens: number
}
