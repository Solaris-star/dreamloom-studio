import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import {
  getNovelDatabaseAgentTask,
  getNovelDatabaseChapter,
  getNovelDatabaseChapterOutlineRun,
  getNovelDatabaseConsistencyCheck,
  getNovelDatabaseDocument,
  getNovelDatabaseExport,
  getNovelDatabaseBackup,
  getNovelDatabaseExtractionRun,
  getNovelDatabaseOutline,
  getNovelDatabaseProject,
  getNovelDatabasePath,
  getNovelDatabaseResearchRun,
  getNovelDatabaseBookIdeaRun,
  listNovelDatabaseAgentTasks,
  listNovelDatabaseChapters,
  listNovelDatabaseChapterOutlineRuns,
  listNovelDatabaseConsistencyChecks,
  listNovelDatabaseExports,
  listNovelDatabaseBackups,
  listNovelDatabaseExtractionRuns,
  listNovelDatabaseOutlines,
  listNovelDatabaseProjects,
  listNovelDatabaseResearchRuns,
  listNovelDatabaseBookIdeaRuns,
  openNovelDatabase,
  readNovelDatabaseSnapshot
} from '../src/main/services/novelDatabaseService.js'

const rootDir = fs.mkdtempSync(join(os.tmpdir(), 'zhimeng-novel-db-'))
const booksDir = join(rootDir, 'books')
const bookName = '风雪试剑'
const bookPath = join(booksDir, bookName)

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

try {
  fs.mkdirSync(join(bookPath, '正文', '第一卷'), { recursive: true })
  writeJson(join(bookPath, 'mazi.json'), {
    id: 'book_fengxue',
    name: bookName,
    type: 'original',
    typeName: '原创',
    intro: '少女入山寻剑。',
    targetCount: 300000
  })
  writeJson(join(bookPath, 'characters.json'), [{ name: '林青', gender: '女' }])
  writeJson(join(bookPath, 'settings.json'), {
    categories: [{ name: '术法', items: [{ name: '月影术', introduction: '只能夜里施展。' }] }]
  })
  writeJson(join(bookPath, 'outlines.json'), { children: [] })
  fs.writeFileSync(join(bookPath, '正文', '第一卷', '第一章.txt'), '林青在夜色里入山。', 'utf-8')

  const repository = openNovelDatabase(booksDir)
  const project = repository.upsertProjectFromBook({ bookName, bookPath })
  assert.equal(project.id, 'book_fengxue')
  assert.equal(project.bookName, bookName)
  assert.equal(project.intro, '少女入山寻剑。')

  const documents = repository.listBookDocuments(project.id)
  assert.equal(documents.some((item) => item.documentType === 'meta'), true)
  assert.equal(documents.some((item) => item.documentType === 'characters'), true)
  assert.equal(documents.find((item) => item.documentType === 'characters').content[0].name, '林青')

  const research = repository.recordResearchRun({
    bookName,
    result: {
      success: true,
      sources: ['qidian'],
      sourceStatus: [{ source: 'qidian', ok: true }],
      cacheTypes: ['persistent'],
      topics: [{ title: '寒门剑修登榜' }],
      opportunities: [{ title: '夜战能力限制' }],
      fromCache: true,
      inserted: 1,
      updated: 0
    }
  })
  assert.equal(research.projectId, project.id)
  assert.equal(research.fromCache, true)
  assert.equal(research.topicCount, 1)

  assert.throws(
    () =>
      repository.withTransaction(() => {
        repository.recordResearchRun({
          bookName,
          result: {
            success: true,
            sources: ['fanqie'],
            topics: [{ title: '回滚用调研' }]
          }
        })
        throw new Error('force research rollback')
      }),
    /force research rollback/
  )
  assert.equal(repository.listResearchRuns(project.id).length, 1)

  const bookIdea = repository.recordBookIdeaRun({
    payload: {
      idea: '雪夜里的剑修新书',
      tags: ['强开局'],
      preferredType: 'xuanhua',
      provider: { id: 'provider-with-key', apiKey: 'secret-key' }
    },
    result: {
      success: true,
      plans: [
        {
          id: 'idea_a',
          title: '雪夜剑灯',
          type: 'xuanhua',
          typeName: '玄幻',
          intro: '雪夜里，少女发现剑灯照出的旧案。'
        }
      ],
      providerId: 'offline-provider',
      model: 'offline-model',
      usage: { total_tokens: 55 }
    }
  })
  assert.equal(bookIdea.projectId, '')
  assert.equal(bookIdea.idea, '雪夜里的剑修新书')
  assert.equal(bookIdea.planCount, 1)
  assert.equal(bookIdea.plans[0].title, '雪夜剑灯')
  assert.equal(bookIdea.usage.total_tokens, 55)
  assert.equal(bookIdea.raw.payload.provider.apiKey, '***')
  assert.equal(bookIdea.status, 'generated')
  assert.equal(bookIdea.confirmedAt, '')

  const weakBookIdea = repository.recordBookIdeaRun({
    payload: {
      idea: '缺少成功标记的方案'
    },
    result: {
      plans: [
        {
          id: 'idea_weak',
          title: '弱返回方案',
          intro: '接口没有明确成功标记。'
        }
      ]
    }
  })
  assert.equal(weakBookIdea.raw.result.success, false)

  const selectedBookIdea = repository.recordBookIdeaRun({
    bookName,
    selectedPlanId: 'idea_a',
    payload: {
      idea: '采用雪夜剑灯方案',
      tags: ['强开局']
    },
    result: {
      success: true,
      plans: [
        {
          id: 'idea_a',
          title: '雪夜剑灯',
          type: 'xuanhua',
          typeName: '玄幻',
          intro: '雪夜里，少女发现剑灯照出的旧案。'
        }
      ],
      providerId: 'offline-provider',
      model: 'offline-model',
      usage: { total_tokens: 60 }
    }
  })
  assert.equal(selectedBookIdea.projectId, project.id)
  assert.equal(selectedBookIdea.bookName, bookName)
  assert.equal(selectedBookIdea.selectedPlanId, 'idea_a')
  assert.equal(selectedBookIdea.status, 'confirmed')
  assert.notEqual(selectedBookIdea.confirmedAt, '')
  assert.equal(selectedBookIdea.bookPath, project.bookPath)

  const confirmedBookIdea = repository.confirmBookIdeaRun({
    bookIdeaRunId: bookIdea.id,
    bookName,
    selectedPlanId: 'idea_a'
  })
  assert.equal(confirmedBookIdea.id, bookIdea.id)
  assert.equal(confirmedBookIdea.projectId, project.id)
  assert.equal(confirmedBookIdea.status, 'confirmed')
  assert.equal(confirmedBookIdea.selectedPlanId, 'idea_a')

  assert.throws(
    () =>
      repository.withTransaction(() => {
        repository.recordBookIdeaRun({
          payload: { idea: '回滚用立项' },
          result: {
            success: true,
            plans: [{ id: 'idea_rollback', title: '回滚方案', intro: '等待回滚。' }]
          }
        })
        throw new Error('force book idea rollback')
      }),
    /force book idea rollback/
  )
  assert.equal(repository.listBookIdeaRuns('').length, 3)

  const outline = repository.recordOutline({
    bookName,
    outline: {
      outlineId: 'outline_001',
      title: '风雪试剑 全书大纲',
      saveMode: 'replace',
      count: 2,
      rawText: 'raw outline',
      items: [{ title: '第一章', content: '入山' }],
      providerId: 'offline-provider',
      model: 'offline-model',
      usage: { total_tokens: 30 },
      research: { fromCache: true }
    }
  })
  assert.equal(outline.id, 'outline_001')
  assert.equal(outline.itemCount, 2)
  assert.equal(outline.items[0].title, '第一章')

  const chapterOutlineRun = repository.recordChapterOutlineRun({
    bookName,
    payload: {
      outlineId: 'outline_item_001',
      outlineTitle: '第一章 入山',
      outlineContent: '林青入山，发现雪中剑痕。',
      volumeName: '第一卷',
      chapterName: '第一章',
      userRequirement: '保持冷峻文风',
      targetWords: 2000,
      previousChapterExcerpt: '序章余韵'
    },
    result: {
      content: '林青在夜色里入山，看见雪中剑痕。',
      providerId: 'offline-provider',
      model: 'offline-model',
      usage: { total_tokens: 42 }
    }
  })
  assert.equal(chapterOutlineRun.outlineId, 'outline_item_001')
  assert.equal(chapterOutlineRun.chapterName, '第一章')
  assert.equal(chapterOutlineRun.content, '林青在夜色里入山，看见雪中剑痕。')
  assert.equal(chapterOutlineRun.wordCount, 16)

  const extractionRun = repository.recordExtractionRun({
    bookName,
    bookPath,
    extraction: {
      id: 'ext_001',
      bookPath,
      sourceBookName: '雪中剑谱',
      sourceType: 'local',
      sourceUrl: '',
      runMode: 'append',
      status: 'completed',
      lifecycleStatus: 'active',
      chapterScope: { mode: 'range', label: '第1章', start: 1, end: 1 },
      dimensions: {
        plot: {
          key: 'plot',
          label: '情节设计',
          status: 'completed',
          itemCount: 1
        }
      },
      stats: {
        chapterCount: 1,
        totalExtractedCount: 1,
        tokenUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      },
      results: {
        plot: {
          label: '情节设计',
          count: 1,
          completed: true,
          groups: [
            {
              groupTitle: '第一章',
              chapterRange: '第一章',
              items: [
                {
                  _id: 'ext_001_plot_0',
                  _text: '以雪夜入山引出剑痕旧案。',
                  point: '雪夜剑痕'
                }
              ]
            }
          ],
          items: [
            {
              _id: 'ext_001_plot_0',
              _text: '以雪夜入山引出剑痕旧案。',
              point: '雪夜剑痕'
            }
          ]
        }
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
      provider: {
        apiKey: 'secret-key'
      }
    },
    providerId: 'offline-provider',
    model: 'offline-model',
    appliedKnowledgeItemIds: ['kb_ext_ext_001', 'kb_ext_ext_001_plot_0']
  })
  assert.equal(extractionRun.id, 'ext_001')
  assert.equal(extractionRun.projectId, project.id)
  assert.equal(extractionRun.bookName, bookName)
  assert.equal(extractionRun.sourceBookName, '雪中剑谱')
  assert.equal(extractionRun.status, 'completed')
  assert.equal(extractionRun.dimensions.plot.itemCount, 1)
  assert.equal(extractionRun.stats.totalExtractedCount, 1)
  assert.equal(extractionRun.results.plot.items[0].point, '雪夜剑痕')
  assert.equal(extractionRun.usage.total_tokens, 30)
  assert.equal(extractionRun.raw.extraction.provider.apiKey, '***')
  assert.deepEqual(extractionRun.appliedKnowledgeItemIds, ['kb_ext_ext_001', 'kb_ext_ext_001_plot_0'])

  assert.throws(
    () =>
      repository.withTransaction(() => {
        repository.recordExtractionRun({
          bookName,
          bookPath,
          extraction: {
            id: 'ext_rollback',
            bookPath,
            sourceBookName: '回滚拆书',
            status: 'completed',
            results: { plot: { items: [{ _text: '等待回滚。' }] } }
          }
        })
        throw new Error('force extraction rollback')
      }),
    /force extraction rollback/
  )
  assert.equal(repository.listExtractionRuns(project.id).length, 1)

  assert.throws(
    () =>
      repository.withTransaction(() => {
        repository.recordChapterOutlineRun({
          bookName,
          payload: {
            outlineTitle: '第二章 禁地',
            outlineContent: '林青误入禁地。',
            volumeName: '第一卷',
            chapterName: '第二章'
          },
          result: {
            content: '林青误入禁地，剑影从石壁醒来。'
          }
        })
        throw new Error('force chapter outline rollback')
      }),
    /force chapter outline rollback/
  )
  assert.equal(repository.listChapterOutlineRuns(project.id).length, 1)

  const check = repository.recordConsistencyCheck({
    bookName,
    chapterName: '第一章',
    check: {
      id: 'check_001',
      source: 'cli_auto_write',
      summary: '未发现冲突'
    },
    issues: []
  })
  assert.equal(check.id, 'check_001')
  assert.equal(check.issueCount, 0)

  assert.throws(
    () =>
      repository.withTransaction(() => {
        repository.recordChapterWrite({
          bookName,
          chapter: {
            volumeName: '第一卷',
            chapterName: '第二章',
            filePath: join(bookPath, '正文', '第一卷', '第二章.txt'),
            wordCount: 12,
            content: '林青误入禁地，发现剑痕。',
            taskId: 'task_rollback',
            generationId: 'generation_rollback',
            check: { id: 'check_rollback', source: 'cli_auto_write', summary: '等待回滚' },
            issues: [{ severity: 'medium', message: '等待回滚' }],
            providerId: 'offline-provider',
            model: 'offline-model',
            review: { passed: false },
            mode: 'auto_edit'
          }
        })
        throw new Error('force rollback')
      }),
    /force rollback/
  )
  assert.equal(repository.getChapter(project.id, { volumeName: '第一卷', chapterName: '第二章' }), null)
  assert.equal(repository.listAgentTasks(project.id).some((item) => item.id === 'task_rollback'), false)
  assert.equal(repository.listConsistencyChecks(project.id).some((item) => item.id === 'check_rollback'), false)

  const chapter = repository.withTransaction(() =>
    repository.recordChapterWrite({
      bookName,
      chapter: {
        volumeName: '第一卷',
        chapterName: '第一章',
        filePath: join(bookPath, '正文', '第一卷', '第一章.txt'),
        wordCount: 9,
        content: '林青在夜色里入山。',
        taskId: 'task_001',
        generationId: 'generation_001',
        repairGenerationId: '',
        check: { id: 'check_001', source: 'cli_auto_write', summary: '未发现冲突' },
        issues: [],
        providerId: 'offline-provider',
        model: 'offline-model',
        review: { passed: true, score: 91 },
        repaired: false,
        mode: 'auto_edit'
      }
    })
  )
  assert.equal(chapter.wordCount, 9)
  assert.equal(chapter.content, '林青在夜色里入山。')
  assert.equal(chapter.checkId, 'check_001')

  const exported = repository.recordExport({
    bookName,
    result: {
      format: 'md',
      filePath: join(booksDir, '.import-export', 'exports', '风雪试剑.md'),
      fileName: '风雪试剑.md',
      size: 128,
      task: { id: 'export_task_001' }
    }
  })
  assert.equal(exported.format, 'md')
  assert.equal(exported.taskId, 'export_task_001')

  const backup = repository.recordBackup({
    bookName,
    result: {
      scope: 'book',
      filePath: join(booksDir, '.import-export', 'backups', '风雪试剑-backup.zip'),
      fileName: '风雪试剑-backup.zip',
      size: 256,
      task: { id: 'backup_task_001', scope: 'book', bookName }
    }
  })
  assert.equal(backup.scope, 'book')
  assert.equal(backup.taskId, 'backup_task_001')
  assert.equal(backup.projectId, project.id)

  const libraryBackup = repository.recordBackup({
    result: {
      scope: 'library',
      filePath: join(booksDir, '.import-export', 'backups', 'library-backup.zip'),
      fileName: 'library-backup.zip',
      size: 1024,
      task: { id: 'backup_library_task_001', scope: 'library' }
    }
  })
  assert.equal(libraryBackup.scope, 'library')
  assert.equal(libraryBackup.taskId, 'backup_library_task_001')
  assert.equal(libraryBackup.projectId, '')

  assert.equal(repository.listMigrations().length, 7)
  assert.equal(repository.listProjects().length, 1)
  assert.equal(repository.listResearchRuns(project.id).length, 1)
  assert.equal(repository.listBookIdeaRuns('').length, 3)
  assert.equal(repository.listBookIdeaRuns(project.id).length, 2)
  assert.equal(repository.listOutlines(project.id).length, 1)
  assert.equal(repository.listChapterOutlineRuns(project.id).length, 1)
  assert.equal(repository.listExtractionRuns(project.id).length, 1)
  assert.equal(repository.listChapters(project.id).length, 1)
  assert.equal(repository.listAgentTasks(project.id).length, 1)
  assert.equal(repository.listConsistencyChecks(project.id).length, 1)
  assert.equal(repository.listExports(project.id).length, 1)
  assert.equal(repository.listBackups(project.id).length, 1)
  assert.equal(repository.listBackups('').length, 2)
  repository.close()

  const reopened = openNovelDatabase(booksDir)
  assert.equal(reopened.listMigrations().length, 7)
  assert.equal(reopened.listProjects().length, 1)
  assert.equal(reopened.listBookIdeaRuns('').length, 3)
  assert.equal(reopened.listChapterOutlineRuns(reopened.getProjectByName(bookName).id).length, 1)
  assert.equal(reopened.listExtractionRuns(reopened.getProjectByName(bookName).id).length, 1)
  assert.equal(reopened.listChapters(reopened.getProjectByName(bookName).id).length, 1)
  assert.equal(reopened.listBackups(reopened.getProjectByName(bookName).id).length, 1)
  reopened.close()

  const snapshot = readNovelDatabaseSnapshot({ booksDir, bookName })
  assert.equal(snapshot.success, undefined)
  assert.equal(snapshot.project.bookName, bookName)
  assert.equal(snapshot.projects.length, 1)
  assert.equal(snapshot.documents.find((item) => item.documentType === 'settings').content.categories[0].name, '术法')
  assert.equal(snapshot.researchRuns.length, 1)
  assert.equal(snapshot.bookIdeaRuns.length, 2)
  assert.equal(snapshot.bookIdeaRuns[0].selectedPlanId, 'idea_a')
  assert.equal(snapshot.bookIdeaRuns[0].status, 'confirmed')
  assert.equal(snapshot.outlines.length, 1)
  assert.equal(snapshot.chapterOutlineRuns[0].outlineTitle, '第一章 入山')
  assert.equal(snapshot.extractionRuns[0].sourceBookName, '雪中剑谱')
  assert.equal(snapshot.chapters[0].content, '林青在夜色里入山。')
  assert.equal(snapshot.agentTasks[0].id, 'task_001')
  assert.equal(snapshot.consistencyChecks[0].id, 'check_001')
  assert.equal(snapshot.exports[0].format, 'md')
  assert.equal(snapshot.backups[0].taskId, 'backup_task_001')

  const allSnapshot = readNovelDatabaseSnapshot({ booksDir })
  assert.equal(allSnapshot.projects.length, 1)
  assert.equal(allSnapshot.documents.length, 0)
  assert.equal(allSnapshot.bookIdeaRuns.length, 3)
  assert.equal(allSnapshot.chapterOutlineRuns.length, 1)
  assert.equal(allSnapshot.extractionRuns.length, 1)
  assert.equal(allSnapshot.chapters.length, 1)
  assert.equal(allSnapshot.backups.length, 2)

  const missingSnapshot = readNovelDatabaseSnapshot({ booksDir, bookName: '不存在的书' })
  assert.equal(missingSnapshot.project, null)
  assert.equal(missingSnapshot.projects.length, 0)
  assert.equal(missingSnapshot.bookIdeaRuns.length, 0)
  assert.equal(missingSnapshot.chapterOutlineRuns.length, 0)
  assert.equal(missingSnapshot.extractionRuns.length, 0)
  assert.equal(missingSnapshot.chapters.length, 0)
  assert.equal(missingSnapshot.backups.length, 0)

  const projectList = listNovelDatabaseProjects({ booksDir })
  assert.equal(projectList.projects.length, 1)
  assert.equal(projectList.projects[0].id, 'book_fengxue')

  const projectByName = getNovelDatabaseProject({ booksDir, bookName })
  assert.equal(projectByName.project.id, 'book_fengxue')

  const projectById = getNovelDatabaseProject({ booksDir, projectId: 'book_fengxue' })
  assert.equal(projectById.project.bookName, bookName)

  const projectDocument = getNovelDatabaseDocument({
    booksDir,
    bookName,
    documentType: 'characters'
  })
  assert.equal(projectDocument.document.content[0].name, '林青')

  const missingDocument = getNovelDatabaseDocument({
    booksDir,
    bookName,
    documentType: 'unknown'
  })
  assert.equal(missingDocument.document, null)

  const chapterList = listNovelDatabaseChapters({ booksDir, projectId: 'book_fengxue' })
  assert.equal(chapterList.project.bookName, bookName)
  assert.equal(chapterList.chapters.length, 1)
  assert.equal(chapterList.chapters[0].content, '林青在夜色里入山。')

  const chapterByName = getNovelDatabaseChapter({
    booksDir,
    bookName,
    volumeName: '第一卷',
    chapterName: '第一章'
  })
  assert.equal(chapterByName.chapter.taskId, 'task_001')

  const missingChapter = getNovelDatabaseChapter({
    booksDir,
    bookName,
    volumeName: '第一卷',
    chapterName: '第二章'
  })
  assert.equal(missingChapter.chapter, null)

  const researchRuns = listNovelDatabaseResearchRuns({ booksDir, projectId: 'book_fengxue' })
  assert.equal(researchRuns.project.bookName, bookName)
  assert.equal(researchRuns.researchRuns.length, 1)
  assert.equal(researchRuns.researchRuns[0].sources[0], 'qidian')

  const researchRunById = getNovelDatabaseResearchRun({
    booksDir,
    projectId: 'book_fengxue',
    researchRunId: research.id
  })
  assert.equal(researchRunById.researchRun.topicCount, 1)

  const missingResearchRun = getNovelDatabaseResearchRun({
    booksDir,
    projectId: 'book_fengxue',
    researchRunId: 'research_missing'
  })
  assert.equal(missingResearchRun.researchRun, null)

  const bookIdeaRuns = listNovelDatabaseBookIdeaRuns({ booksDir })
  assert.equal(bookIdeaRuns.bookIdeaRuns.length, 3)
  assert.equal(bookIdeaRuns.bookIdeaRuns[0].source, 'ai')

  const projectBookIdeaRuns = listNovelDatabaseBookIdeaRuns({ booksDir, bookName })
  assert.equal(projectBookIdeaRuns.bookIdeaRuns.length, 2)
  assert.equal(projectBookIdeaRuns.bookIdeaRuns[0].selectedPlanId, 'idea_a')

  const bookIdeaRunById = getNovelDatabaseBookIdeaRun({
    booksDir,
    bookIdeaRunId: bookIdea.id
  })
  assert.equal(bookIdeaRunById.bookIdeaRun.plans[0].title, '雪夜剑灯')
  assert.equal(bookIdeaRunById.bookIdeaRun.status, 'confirmed')

  const bookIdeaRunByPlan = getNovelDatabaseBookIdeaRun({
    booksDir,
    bookName,
    selectedPlanId: 'idea_a'
  })
  assert.equal(bookIdeaRunByPlan.bookIdeaRun.selectedPlanId, 'idea_a')
  assert.equal(bookIdeaRunByPlan.bookIdeaRun.status, 'confirmed')

  const missingBookIdeaRun = getNovelDatabaseBookIdeaRun({
    booksDir,
    bookName,
    bookIdeaRunId: 'book_idea_missing'
  })
  assert.equal(missingBookIdeaRun.bookIdeaRun, null)

  const outlines = listNovelDatabaseOutlines({ booksDir, bookName })
  assert.equal(outlines.outlines.length, 1)
  assert.equal(outlines.outlines[0].id, 'outline_001')

  const outlineById = getNovelDatabaseOutline({
    booksDir,
    bookName,
    outlineId: 'outline_001'
  })
  assert.equal(outlineById.outline.items[0].content, '入山')

  const missingOutline = getNovelDatabaseOutline({
    booksDir,
    bookName,
    outlineId: 'outline_missing'
  })
  assert.equal(missingOutline.outline, null)

  const chapterOutlineRuns = listNovelDatabaseChapterOutlineRuns({ booksDir, bookName })
  assert.equal(chapterOutlineRuns.chapterOutlineRuns.length, 1)
  assert.equal(chapterOutlineRuns.chapterOutlineRuns[0].providerId, 'offline-provider')

  const chapterOutlineRunById = getNovelDatabaseChapterOutlineRun({
    booksDir,
    bookName,
    chapterOutlineRunId: chapterOutlineRun.id
  })
  assert.equal(chapterOutlineRunById.chapterOutlineRun.usage.total_tokens, 42)

  const chapterOutlineRunByChapter = getNovelDatabaseChapterOutlineRun({
    booksDir,
    bookName,
    volumeName: '第一卷',
    chapterName: '第一章'
  })
  assert.equal(chapterOutlineRunByChapter.chapterOutlineRun.id, chapterOutlineRun.id)

  const missingChapterOutlineRun = getNovelDatabaseChapterOutlineRun({
    booksDir,
    bookName,
    chapterOutlineRunId: 'outline_chapter_missing'
  })
  assert.equal(missingChapterOutlineRun.chapterOutlineRun, null)

  const extractionRuns = listNovelDatabaseExtractionRuns({ booksDir, bookName })
  assert.equal(extractionRuns.extractionRuns.length, 1)
  assert.equal(extractionRuns.extractionRuns[0].sourceBookName, '雪中剑谱')

  const extractionRunById = getNovelDatabaseExtractionRun({
    booksDir,
    bookName,
    extractionRunId: 'ext_001'
  })
  assert.equal(extractionRunById.extractionRun.results.plot.items[0].point, '雪夜剑痕')

  const extractionRunBySourceBook = getNovelDatabaseExtractionRun({
    booksDir,
    bookName,
    sourceBookName: '雪中剑谱'
  })
  assert.equal(extractionRunBySourceBook.extractionRun.id, 'ext_001')

  const missingExtractionRun = getNovelDatabaseExtractionRun({
    booksDir,
    bookName,
    extractionRunId: 'ext_missing'
  })
  assert.equal(missingExtractionRun.extractionRun, null)

  const agentTasks = listNovelDatabaseAgentTasks({ booksDir, bookName })
  assert.equal(agentTasks.agentTasks.length, 1)
  assert.equal(agentTasks.agentTasks[0].id, 'task_001')

  const agentTaskById = getNovelDatabaseAgentTask({
    booksDir,
    bookName,
    taskId: 'task_001'
  })
  assert.equal(agentTaskById.agentTask.generationId, 'generation_001')

  const missingAgentTask = getNovelDatabaseAgentTask({
    booksDir,
    bookName,
    taskId: 'task_missing'
  })
  assert.equal(missingAgentTask.agentTask, null)

  const consistencyChecks = listNovelDatabaseConsistencyChecks({ booksDir, bookName })
  assert.equal(consistencyChecks.consistencyChecks.length, 1)
  assert.equal(consistencyChecks.consistencyChecks[0].id, 'check_001')

  const consistencyCheckById = getNovelDatabaseConsistencyCheck({
    booksDir,
    bookName,
    checkId: 'check_001'
  })
  assert.equal(consistencyCheckById.consistencyCheck.summary, '未发现冲突')

  const missingConsistencyCheck = getNovelDatabaseConsistencyCheck({
    booksDir,
    bookName,
    checkId: 'check_missing'
  })
  assert.equal(missingConsistencyCheck.consistencyCheck, null)

  const exports = listNovelDatabaseExports({ booksDir, bookName })
  assert.equal(exports.exports.length, 1)
  assert.equal(exports.exports[0].format, 'md')

  const exportById = getNovelDatabaseExport({
    booksDir,
    bookName,
    exportId: exported.id
  })
  assert.equal(exportById.exportRecord.taskId, 'export_task_001')

  const exportByTaskId = getNovelDatabaseExport({
    booksDir,
    bookName,
    taskId: 'export_task_001'
  })
  assert.equal(exportByTaskId.exportRecord.id, exported.id)

  const missingExport = getNovelDatabaseExport({
    booksDir,
    bookName,
    exportId: 'export_missing'
  })
  assert.equal(missingExport.exportRecord, null)

  const backups = listNovelDatabaseBackups({ booksDir, bookName })
  assert.equal(backups.backups.length, 1)
  assert.equal(backups.backups[0].taskId, 'backup_task_001')

  const allBackups = listNovelDatabaseBackups({ booksDir })
  assert.equal(allBackups.backups.length, 2)
  assert.equal(allBackups.backups.some((item) => item.taskId === 'backup_library_task_001'), true)

  const backupById = getNovelDatabaseBackup({
    booksDir,
    bookName,
    backupId: 'backup_task_001'
  })
  assert.equal(backupById.backupRecord.scope, 'book')

  const backupByTaskId = getNovelDatabaseBackup({
    booksDir,
    taskId: 'backup_library_task_001'
  })
  assert.equal(backupByTaskId.backupRecord.projectId, '')
  assert.equal(backupByTaskId.backupRecord.scope, 'library')

  const missingBackup = getNovelDatabaseBackup({
    booksDir,
    bookName,
    backupId: 'backup_missing'
  })
  assert.equal(missingBackup.backupRecord, null)

  const missingProjectResources = listNovelDatabaseResearchRuns({ booksDir, bookName: '不存在的书' })
  assert.equal(missingProjectResources.project, null)
  assert.equal(missingProjectResources.researchRuns.length, 0)

  const missingProjectBookIdeaRuns = listNovelDatabaseBookIdeaRuns({ booksDir, bookName: '不存在的书' })
  assert.equal(missingProjectBookIdeaRuns.project, null)
  assert.equal(missingProjectBookIdeaRuns.bookIdeaRuns.length, 0)

  const missingProjectChapterOutlineRuns = listNovelDatabaseChapterOutlineRuns({ booksDir, bookName: '不存在的书' })
  assert.equal(missingProjectChapterOutlineRuns.project, null)
  assert.equal(missingProjectChapterOutlineRuns.chapterOutlineRuns.length, 0)

  const missingProjectExtractionRuns = listNovelDatabaseExtractionRuns({ booksDir, bookName: '不存在的书' })
  assert.equal(missingProjectExtractionRuns.project, null)
  assert.equal(missingProjectExtractionRuns.extractionRuns.length, 0)

  const missingProjectBackups = listNovelDatabaseBackups({ booksDir, bookName: '不存在的书' })
  assert.equal(missingProjectBackups.project, null)
  assert.equal(missingProjectBackups.backups.length, 0)

  assert.equal(fs.existsSync(getNovelDatabasePath(booksDir)), true)
} finally {
  try {
    fs.rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch (error) {
    console.warn(`清理临时数据库目录失败：${error.message}`)
  }
}

console.log('novel database service tests passed')
