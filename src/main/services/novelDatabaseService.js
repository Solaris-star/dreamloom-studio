import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'

const nodeRequire = createRequire(import.meta.url)

const WORKBENCH_DIR = '.novel-workbench'
const DATABASE_FILE = 'workbench.sqlite'

let sqliteModule = null

function nowIso() {
  return new Date().toISOString()
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeName(value, fallback = '未命名') {
  return cleanText(String(value || fallback)).replace(/[\\/:*?"<>|]/g, '_') || fallback
}

function jsonText(value) {
  return JSON.stringify(value ?? null)
}

function rawText(value) {
  return value == null ? '' : String(value)
}

function countWords(value) {
  return rawText(value).replace(/[\s\n\r\t]/g, '').length
}

function parseJson(value, fallback = null) {
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (/api[-_]?key|secret|token|authorization/i.test(key)) return [key, '***']
      return [key, redactSensitive(item)]
    })
  )
}

function readJsonFile(filePath, fallback = null) {
  if (!filePath || !fs.existsSync(filePath)) return fallback
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return fallback
  }
}

function resolveBooksDir(booksDir) {
  const dir = cleanText(booksDir)
  if (!dir) throw new Error('缺少书库目录')
  return resolve(dir)
}

function resolveDatabasePath(booksDir) {
  const root = resolveBooksDir(booksDir)
  return join(root, WORKBENCH_DIR, DATABASE_FILE)
}

function loadSqliteModule() {
  if (sqliteModule) return sqliteModule
  try {
    sqliteModule = nodeRequire('node:sqlite')
  } catch (error) {
    throw new Error(`当前 Node 不支持 node:sqlite，无法创建 SQLite 数据库：${error?.message || error}`)
  }
  if (!sqliteModule?.DatabaseSync) {
    throw new Error('当前 Node 缺少 node:sqlite DatabaseSync，无法创建 SQLite 数据库')
  }
  return sqliteModule
}

const MIGRATIONS = [
  {
    id: '001_cli_lifecycle_tables',
    up: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        book_name TEXT NOT NULL UNIQUE,
        folder_name TEXT NOT NULL,
        book_path TEXT NOT NULL,
        intro TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT '',
        type_name TEXT NOT NULL DEFAULT '',
        target_count INTEGER NOT NULL DEFAULT 0,
        meta_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS book_documents (
        project_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        document_path TEXT NOT NULL,
        content_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, document_type),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS research_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        books_dir TEXT NOT NULL,
        book_name TEXT NOT NULL DEFAULT '',
        sources_json TEXT NOT NULL DEFAULT '[]',
        source_status_json TEXT NOT NULL DEFAULT '[]',
        cache_types_json TEXT NOT NULL DEFAULT '[]',
        topic_count INTEGER NOT NULL DEFAULT 0,
        opportunity_count INTEGER NOT NULL DEFAULT 0,
        from_cache INTEGER NOT NULL DEFAULT 0,
        inserted_count INTEGER NOT NULL DEFAULT 0,
        updated_count INTEGER NOT NULL DEFAULT 0,
        raw_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS outlines (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        save_mode TEXT NOT NULL DEFAULT '',
        item_count INTEGER NOT NULL DEFAULT 0,
        raw_text TEXT NOT NULL DEFAULT '',
        items_json TEXT NOT NULL DEFAULT '[]',
        provider_id TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        usage_json TEXT NOT NULL DEFAULT '{}',
        research_json TEXT NOT NULL DEFAULT 'null',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        volume_name TEXT NOT NULL,
        chapter_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        word_count INTEGER NOT NULL DEFAULT 0,
        provider_id TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        task_id TEXT NOT NULL DEFAULT '',
        generation_id TEXT NOT NULL DEFAULT '',
        repair_generation_id TEXT NOT NULL DEFAULT '',
        check_id TEXT NOT NULL DEFAULT '',
        issue_count INTEGER NOT NULL DEFAULT 0,
        review_json TEXT NOT NULL DEFAULT 'null',
        repaired INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE (project_id, volume_name, chapter_name)
      );

      CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        chapter_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT '',
        provider_id TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        generation_id TEXT NOT NULL DEFAULT '',
        repair_generation_id TEXT NOT NULL DEFAULT '',
        word_count INTEGER NOT NULL DEFAULT 0,
        review_json TEXT NOT NULL DEFAULT 'null',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS consistency_checks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        chapter_name TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        issue_count INTEGER NOT NULL DEFAULT 0,
        issues_json TEXT NOT NULL DEFAULT '[]',
        raw_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS exports (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        format TEXT NOT NULL DEFAULT '',
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0,
        task_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_research_runs_project_id ON research_runs(project_id);
      CREATE INDEX IF NOT EXISTS idx_outlines_project_id ON outlines(project_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_project_id ON chapters(project_id);
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_project_id ON agent_tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_consistency_checks_project_id ON consistency_checks(project_id);
      CREATE INDEX IF NOT EXISTS idx_exports_project_id ON exports(project_id);
    `
  },
  {
    id: '002_chapter_content_text',
    up: `
      ALTER TABLE chapters ADD COLUMN content_text TEXT NOT NULL DEFAULT '';
    `
  },
  {
    id: '003_chapter_outline_runs',
    up: `
      CREATE TABLE IF NOT EXISTS chapter_outline_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        outline_id TEXT NOT NULL DEFAULT '',
        outline_title TEXT NOT NULL DEFAULT '',
        outline_content TEXT NOT NULL DEFAULT '',
        volume_name TEXT NOT NULL DEFAULT '',
        chapter_name TEXT NOT NULL DEFAULT '',
        user_requirement TEXT NOT NULL DEFAULT '',
        target_words INTEGER NOT NULL DEFAULT 0,
        previous_excerpt TEXT NOT NULL DEFAULT '',
        generated_content TEXT NOT NULL DEFAULT '',
        word_count INTEGER NOT NULL DEFAULT 0,
        provider_id TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        usage_json TEXT NOT NULL DEFAULT '{}',
        raw_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chapter_outline_runs_project_id ON chapter_outline_runs(project_id);
      CREATE INDEX IF NOT EXISTS idx_chapter_outline_runs_chapter ON chapter_outline_runs(project_id, volume_name, chapter_name);
    `
  },
  {
    id: '004_book_idea_runs',
    up: `
      CREATE TABLE IF NOT EXISTS book_idea_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        books_dir TEXT NOT NULL,
        book_name TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'ai',
        idea_text TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        preferred_type TEXT NOT NULL DEFAULT '',
        selected_plan_id TEXT NOT NULL DEFAULT '',
        plan_count INTEGER NOT NULL DEFAULT 0,
        plans_json TEXT NOT NULL DEFAULT '[]',
        provider_id TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        usage_json TEXT NOT NULL DEFAULT '{}',
        raw_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_book_idea_runs_project_id ON book_idea_runs(project_id);
      CREATE INDEX IF NOT EXISTS idx_book_idea_runs_created_at ON book_idea_runs(created_at);
    `
  },
  {
    id: '005_book_idea_confirmation',
    up: `
      ALTER TABLE book_idea_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'generated';
      ALTER TABLE book_idea_runs ADD COLUMN confirmed_at TEXT NOT NULL DEFAULT '';
      ALTER TABLE book_idea_runs ADD COLUMN book_path TEXT NOT NULL DEFAULT '';

      CREATE INDEX IF NOT EXISTS idx_book_idea_runs_status ON book_idea_runs(status);
    `
  },
  {
    id: '006_extraction_runs',
    up: `
      CREATE TABLE IF NOT EXISTS extraction_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        books_dir TEXT NOT NULL,
        book_name TEXT NOT NULL DEFAULT '',
        book_path TEXT NOT NULL DEFAULT '',
        source_book_name TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL DEFAULT '',
        run_mode TEXT NOT NULL DEFAULT 'append',
        status TEXT NOT NULL DEFAULT '',
        lifecycle_status TEXT NOT NULL DEFAULT 'active',
        chapter_scope_json TEXT NOT NULL DEFAULT 'null',
        dimensions_json TEXT NOT NULL DEFAULT '{}',
        stats_json TEXT NOT NULL DEFAULT '{}',
        result_json TEXT NOT NULL DEFAULT '{}',
        provider_id TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL DEFAULT '',
        usage_json TEXT NOT NULL DEFAULT '{}',
        raw_json TEXT NOT NULL DEFAULT '{}',
        applied_knowledge_item_ids_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_extraction_runs_project_id ON extraction_runs(project_id);
      CREATE INDEX IF NOT EXISTS idx_extraction_runs_status ON extraction_runs(status);
      CREATE INDEX IF NOT EXISTS idx_extraction_runs_updated_at ON extraction_runs(updated_at);
    `
  },
  {
    id: '007_backup_records',
    up: `
      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        scope TEXT NOT NULL DEFAULT '',
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0,
        task_id TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_backups_project_id ON backups(project_id);
      CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);
    `
  }
]

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
}

function applyMigrations(db) {
  ensureMigrationTable(db)
  for (const migration of MIGRATIONS) {
    const existing = db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(migration.id)
    if (existing) continue

    db.exec('BEGIN')
    try {
      db.exec(migration.up)
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(migration.id, nowIso())
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

function createTransactionRunner(db) {
  let depth = 0
  return function runInTransaction(callback) {
    if (depth > 0) {
      depth += 1
      try {
        return callback()
      } finally {
        depth -= 1
      }
    }

    depth = 1
    db.exec('BEGIN')
    try {
      const result = callback()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    } finally {
      depth = 0
    }
  }
}

function projectIdFrom(bookName, meta = {}) {
  return cleanText(meta?.id) || safeName(bookName)
}

function readBookMeta(booksDir, bookName, bookPath = '') {
  const path = bookPath || join(resolveBooksDir(booksDir), safeName(bookName))
  return readJsonFile(join(path, 'mazi.json'), {}) || {}
}

function upsertDocumentSnapshot(db, projectId, documentType, documentPath) {
  if (!fs.existsSync(documentPath)) return null
  const content = readJsonFile(documentPath, null)
  if (content == null) return null
  const timestamp = nowIso()
  db.prepare(
    `
      INSERT INTO book_documents (
        project_id, document_type, document_path, content_json, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id, document_type) DO UPDATE SET
        document_path = excluded.document_path,
        content_json = excluded.content_json,
        updated_at = excluded.updated_at
    `
  ).run(projectId, documentType, documentPath, jsonText(content), timestamp)
  return { projectId, documentType, documentPath, content, updatedAt: timestamp }
}

function snapshotBookDocuments(db, project = {}) {
  const bookPath = project.bookPath || project.book_path
  const projectId = project.id
  if (!bookPath || !projectId) return []
  const documents = [
    ['meta', 'mazi.json'],
    ['characters', 'characters.json'],
    ['settings', 'settings.json'],
    ['outlines', 'outlines.json'],
    ['timeline', 'timelines.json'],
    ['dictionary', 'dictionary.json'],
    ['entity_profiles', 'entity_profiles.json'],
    ['outline_ai_sessions', 'outline-ai-sessions.json'],
    ['sequence_charts', 'sequence-charts.json']
  ]
  return documents
    .map(([type, fileName]) => upsertDocumentSnapshot(db, projectId, type, join(bookPath, fileName)))
    .filter(Boolean)
}

function mapProject(row) {
  if (!row) return null
  return {
    id: row.id,
    bookName: row.book_name,
    folderName: row.folder_name,
    bookPath: row.book_path,
    intro: row.intro,
    type: row.type,
    typeName: row.type_name,
    targetCount: row.target_count,
    meta: parseJson(row.meta_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapDocument(row) {
  if (!row) return null
  return {
    projectId: row.project_id,
    documentType: row.document_type,
    documentPath: row.document_path,
    content: parseJson(row.content_json, null),
    updatedAt: row.updated_at
  }
}

function mapResearchRun(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id || '',
    booksDir: row.books_dir,
    bookName: row.book_name,
    sources: parseJson(row.sources_json, []),
    sourceStatus: parseJson(row.source_status_json, []),
    cacheTypes: parseJson(row.cache_types_json, []),
    topicCount: row.topic_count,
    opportunityCount: row.opportunity_count,
    fromCache: Boolean(row.from_cache),
    inserted: row.inserted_count,
    updated: row.updated_count,
    raw: parseJson(row.raw_json, {}),
    createdAt: row.created_at
  }
}

function mapBookIdeaRun(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id || '',
    booksDir: row.books_dir,
    bookName: row.book_name,
    source: row.source,
    idea: row.idea_text,
    tags: parseJson(row.tags_json, []),
    preferredType: row.preferred_type,
    selectedPlanId: row.selected_plan_id,
    status: row.status || 'generated',
    confirmedAt: row.confirmed_at || '',
    bookPath: row.book_path || '',
    planCount: row.plan_count,
    plans: parseJson(row.plans_json, []),
    providerId: row.provider_id,
    model: row.model,
    usage: parseJson(row.usage_json, {}),
    raw: parseJson(row.raw_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapOutline(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    saveMode: row.save_mode,
    itemCount: row.item_count,
    rawText: row.raw_text,
    items: parseJson(row.items_json, []),
    providerId: row.provider_id,
    model: row.model,
    usage: parseJson(row.usage_json, {}),
    research: parseJson(row.research_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapChapterOutlineRun(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    outlineId: row.outline_id,
    outlineTitle: row.outline_title,
    outlineContent: row.outline_content,
    volumeName: row.volume_name,
    chapterName: row.chapter_name,
    userRequirement: row.user_requirement,
    targetWords: row.target_words,
    previousExcerpt: row.previous_excerpt,
    content: row.generated_content,
    wordCount: row.word_count,
    providerId: row.provider_id,
    model: row.model,
    usage: parseJson(row.usage_json, {}),
    raw: parseJson(row.raw_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapExtractionRun(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    booksDir: row.books_dir,
    bookName: row.book_name,
    bookPath: row.book_path,
    sourceBookName: row.source_book_name,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    runMode: row.run_mode,
    status: row.status,
    lifecycleStatus: row.lifecycle_status,
    chapterScope: parseJson(row.chapter_scope_json, null),
    dimensions: parseJson(row.dimensions_json, {}),
    stats: parseJson(row.stats_json, {}),
    results: parseJson(row.result_json, {}),
    providerId: row.provider_id,
    model: row.model,
    usage: parseJson(row.usage_json, {}),
    raw: parseJson(row.raw_json, {}),
    appliedKnowledgeItemIds: parseJson(row.applied_knowledge_item_ids_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapChapter(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    volumeName: row.volume_name,
    chapterName: row.chapter_name,
    filePath: row.file_path,
    content: row.content_text || '',
    wordCount: row.word_count,
    providerId: row.provider_id,
    model: row.model,
    taskId: row.task_id,
    generationId: row.generation_id,
    repairGenerationId: row.repair_generation_id,
    checkId: row.check_id,
    issueCount: row.issue_count,
    review: parseJson(row.review_json, null),
    repaired: Boolean(row.repaired),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapAgentTask(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    chapterName: row.chapter_name,
    status: row.status,
    mode: row.mode,
    providerId: row.provider_id,
    model: row.model,
    generationId: row.generation_id,
    repairGenerationId: row.repair_generation_id,
    wordCount: row.word_count,
    review: parseJson(row.review_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapConsistencyCheck(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    chapterName: row.chapter_name,
    source: row.source,
    summary: row.summary,
    issueCount: row.issue_count,
    issues: parseJson(row.issues_json, []),
    raw: parseJson(row.raw_json, {}),
    createdAt: row.created_at
  }
}

function mapExport(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id,
    format: row.format,
    filePath: row.file_path,
    fileName: row.file_name,
    size: row.size,
    taskId: row.task_id,
    createdAt: row.created_at
  }
}

function mapBackup(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.project_id || '',
    scope: row.scope,
    filePath: row.file_path,
    fileName: row.file_name,
    size: row.size,
    taskId: row.task_id,
    raw: parseJson(row.raw_json, {}),
    createdAt: row.created_at
  }
}

function getProjectByNameRow(db, bookName) {
  return db.prepare('SELECT * FROM projects WHERE book_name = ?').get(safeName(bookName))
}

function getProjectByIdRow(db, projectId) {
  const id = cleanText(projectId)
  return id ? db.prepare('SELECT * FROM projects WHERE id = ?').get(id) : null
}

function upsertProjectRow(db, { booksDir, bookName, bookPath = '', meta = null, previousBookName = '' } = {}) {
  const root = resolveBooksDir(booksDir)
  const folderName = safeName(bookName || meta?.name)
  const resolvedBookPath = bookPath || join(root, folderName)
  const bookMeta = meta && typeof meta === 'object' ? meta : readBookMeta(root, folderName, resolvedBookPath)
  const requestedProjectId = projectIdFrom(folderName, bookMeta)
  const previousFolderName = previousBookName ? safeName(previousBookName) : ''
  const existingById = getProjectByIdRow(db, requestedProjectId)
  const existingByName = getProjectByNameRow(db, folderName)
  const existingByPreviousName =
    previousFolderName && previousFolderName !== folderName ? getProjectByNameRow(db, previousFolderName) : null
  const existingIds = new Set(
    [existingById, existingByName, existingByPreviousName].filter(Boolean).map((row) => row.id)
  )
  if (existingIds.size > 1) {
    throw new Error('数据库中已存在同名作品或重命名前作品，无法合并记录')
  }

  const existingProject = existingById || existingByName || existingByPreviousName || null
  const projectId = existingProject?.id || requestedProjectId
  const timestamp = nowIso()
  const values = [
    folderName,
    folderName,
    resolvedBookPath,
    cleanText(bookMeta.intro),
    cleanText(bookMeta.type),
    cleanText(bookMeta.typeName),
    Number(bookMeta.targetCount || 0),
    jsonText(bookMeta),
    timestamp
  ]
  if (existingProject) {
    db.prepare(
      `
        UPDATE projects SET
          book_name = ?,
          folder_name = ?,
          book_path = ?,
          intro = ?,
          type = ?,
          type_name = ?,
          target_count = ?,
          meta_json = ?,
          updated_at = ?
        WHERE id = ?
      `
    ).run(...values, projectId)
  } else {
    db.prepare(
      `
        INSERT INTO projects (
          book_name, folder_name, book_path, intro, type, type_name,
          target_count, meta_json, updated_at, id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(...values, projectId, timestamp)
  }
  const project = mapProject(getProjectByNameRow(db, folderName))
  snapshotBookDocuments(db, project)
  return project
}

function ensureProject(db, { booksDir, bookName, bookPath = '', meta = null } = {}) {
  const existing = bookName ? mapProject(getProjectByNameRow(db, bookName)) : null
  if (existing) {
    snapshotBookDocuments(db, existing)
    return existing
  }
  if (!bookName) return null
  return upsertProjectRow(db, { booksDir, bookName, bookPath, meta })
}

function createRepository(db, dbPath, booksDir) {
  const runInTransaction = createTransactionRunner(db)

  function withTransaction(callback) {
    if (typeof callback !== 'function') throw new Error('事务需要回调函数')
    return runInTransaction(callback)
  }

  function upsertProjectFromBook(input = {}) {
    return runInTransaction(() => upsertProjectRow(db, { booksDir, ...input }))
  }

  function syncBookDocuments(input = {}) {
    return runInTransaction(() => {
      const project = ensureProject(db, {
        booksDir,
        bookName: input.bookName,
        bookPath: input.bookPath,
        meta: input.meta
      })
      if (!project) throw new Error('同步作品资料前需要有效作品')
      return snapshotBookDocuments(db, project)
    })
  }

  function syncBookDocument(input = {}) {
    return runInTransaction(() => {
      const documentType = cleanText(input.documentType || input.type)
      const fileName = cleanText(input.fileName)
      if (!documentType || !fileName) throw new Error('同步作品资料前需要资料类型和文件名')
      const project = ensureProject(db, {
        booksDir,
        bookName: input.bookName,
        bookPath: input.bookPath,
        meta: input.meta
      })
      if (!project) throw new Error('同步作品资料前需要有效作品')
      return upsertDocumentSnapshot(db, project.id, documentType, join(project.bookPath, fileName))
    })
  }

  function recordResearchRun(input = {}) {
    return runInTransaction(() => {
      const result = input.result || input
      const project = input.bookName
        ? ensureProject(db, {
            booksDir,
            bookName: input.bookName,
            bookPath: input.bookPath,
            meta: input.meta
          })
        : null
      const id = input.id || `research_${randomUUID()}`
      db.prepare(
        `
          INSERT INTO research_runs (
            id, project_id, books_dir, book_name, sources_json, source_status_json,
            cache_types_json, topic_count, opportunity_count, from_cache,
            inserted_count, updated_count, raw_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        id,
        project?.id || null,
        resolveBooksDir(input.booksDir || booksDir),
        cleanText(input.bookName) ? safeName(input.bookName) : '',
        jsonText(result.sources || input.sources || []),
        jsonText(result.sourceStatus || []),
        jsonText(result.cacheTypes || []),
        Number(result.topics?.length || result.topicCount || 0),
        Number(result.opportunities?.length || result.opportunityCount || 0),
        result.fromCache ? 1 : 0,
        Number(result.inserted || 0),
        Number(result.updated || 0),
        jsonText(result),
        nowIso()
      )
      return mapResearchRun(db.prepare('SELECT * FROM research_runs WHERE id = ?').get(id))
    })
  }

  function recordBookIdeaRun(input = {}) {
    return runInTransaction(() => {
      const result = input.result || input
      const payload = input.payload || input
      const plans = Array.isArray(result.plans) ? result.plans : []
      if (!plans.length) throw new Error('记录立项结果前需要 AI 生成方案')

      const selectedPlan = input.selectedPlan || result.selectedPlan || null
      const selectedBookName =
        cleanText(input.bookName) ||
        cleanText(selectedPlan?.title)
      const project =
        selectedBookName || input.bookPath
          ? ensureProject(db, {
              booksDir,
              bookName: selectedBookName,
              bookPath: input.bookPath,
              meta: input.meta
            })
          : null

      const id = cleanText(input.id || result.id || result.runId) || `book_idea_${randomUUID()}`
      const timestamp = nowIso()
      const selectedPlanId = cleanText(input.selectedPlanId || selectedPlan?.id || result.selectedPlanId)
      const confirmedAt = cleanText(input.confirmedAt)
      const status = cleanText(input.status) || (project && selectedPlanId ? 'confirmed' : 'generated')
      const bookPath = cleanText(input.bookPath) || project?.bookPath || ''
      db.prepare(
        `
          INSERT INTO book_idea_runs (
            id, project_id, books_dir, book_name, source, idea_text, tags_json,
            preferred_type, selected_plan_id, status, confirmed_at, book_path,
            plan_count, plans_json, provider_id, model, usage_json, raw_json,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            project_id = excluded.project_id,
            books_dir = excluded.books_dir,
            book_name = excluded.book_name,
            source = excluded.source,
            idea_text = excluded.idea_text,
            tags_json = excluded.tags_json,
            preferred_type = excluded.preferred_type,
            selected_plan_id = excluded.selected_plan_id,
            status = excluded.status,
            confirmed_at = excluded.confirmed_at,
            book_path = excluded.book_path,
            plan_count = excluded.plan_count,
            plans_json = excluded.plans_json,
            provider_id = excluded.provider_id,
            model = excluded.model,
            usage_json = excluded.usage_json,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
        `
      ).run(
        id,
        project?.id || null,
        resolveBooksDir(input.booksDir || booksDir),
        project?.bookName || safeName(selectedBookName, ''),
        cleanText(input.source || result.source) || 'ai',
        rawText(payload.idea),
        jsonText(Array.isArray(payload.tags) ? payload.tags : []),
        cleanText(input.preferredType || payload.preferredType || payload.type),
        selectedPlanId,
        status,
        status === 'confirmed' ? confirmedAt || timestamp : confirmedAt,
        bookPath,
        Number(plans.length),
        jsonText(plans),
        cleanText(result.providerId || input.providerId || payload.providerId),
        cleanText(result.model || result.modelName || input.model || payload.model || payload.modelName),
        jsonText(result.usage || input.usage || {}),
        jsonText(
          redactSensitive({
            payload,
            result: {
              success: result.success === true,
              plans,
              usage: result.usage || {},
              providerId: result.providerId || input.providerId || payload.providerId || '',
              model: result.model || result.modelName || input.model || payload.model || payload.modelName || ''
            }
          })
        ),
        timestamp,
        timestamp
      )
      return mapBookIdeaRun(db.prepare('SELECT * FROM book_idea_runs WHERE id = ?').get(id))
    })
  }

  function confirmBookIdeaRun(input = {}) {
    return runInTransaction(() => {
      const id = cleanText(input.bookIdeaRunId || input.ideaRunId || input.runId || input.id)
      const selectedPlanId = cleanText(input.selectedPlanId || input.planId || input.selectedPlan?.id)
      if (!id && !selectedPlanId) return null

      const existingRow = id
        ? db.prepare('SELECT * FROM book_idea_runs WHERE id = ?').get(id)
        : db
            .prepare('SELECT * FROM book_idea_runs WHERE selected_plan_id = ? ORDER BY updated_at DESC LIMIT 1')
            .get(selectedPlanId)
      if (!existingRow) return null

      const project = ensureProject(db, {
        booksDir,
        bookName: input.bookName,
        bookPath: input.bookPath,
        meta: input.meta
      })
      if (!project) throw new Error('确认立项前需要有效作品')

      const timestamp = nowIso()
      db.prepare(
        `
          UPDATE book_idea_runs SET
            project_id = ?,
            books_dir = ?,
            book_name = ?,
            selected_plan_id = ?,
            status = ?,
            confirmed_at = ?,
            book_path = ?,
            updated_at = ?
          WHERE id = ?
        `
      ).run(
        project.id,
        resolveBooksDir(input.booksDir || booksDir),
        project.bookName,
        selectedPlanId || existingRow.selected_plan_id || cleanText(input.selectedPlan?.id),
        cleanText(input.status) || 'confirmed',
        cleanText(input.confirmedAt) || timestamp,
        cleanText(input.bookPath) || project.bookPath || existingRow.book_path || '',
        timestamp,
        existingRow.id
      )
      return mapBookIdeaRun(db.prepare('SELECT * FROM book_idea_runs WHERE id = ?').get(existingRow.id))
    })
  }

  function recordOutline(input = {}) {
    return runInTransaction(() => {
      const outline = input.outline || input
      const project = ensureProject(db, {
        booksDir,
        bookName: input.bookName || outline.bookName,
        bookPath: input.bookPath || outline.bookPath,
        meta: input.meta
      })
      if (!project) throw new Error('记录大纲前需要有效作品')

      const id = cleanText(outline.outlineId || outline.id) || `outline_${randomUUID()}`
      const timestamp = nowIso()
      db.prepare(
        `
          INSERT INTO outlines (
            id, project_id, title, save_mode, item_count, raw_text, items_json,
            provider_id, model, usage_json, research_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            save_mode = excluded.save_mode,
            item_count = excluded.item_count,
            raw_text = excluded.raw_text,
            items_json = excluded.items_json,
            provider_id = excluded.provider_id,
            model = excluded.model,
            usage_json = excluded.usage_json,
            research_json = excluded.research_json,
            updated_at = excluded.updated_at
        `
      ).run(
        id,
        project.id,
        cleanText(outline.title),
        cleanText(outline.saveMode),
        Number(outline.count || outline.items?.length || 0),
        cleanText(outline.rawText),
        jsonText(outline.items || []),
        cleanText(outline.providerId),
        cleanText(outline.model),
        jsonText(outline.usage || {}),
        jsonText(outline.research ?? null),
        timestamp,
        timestamp
      )
      snapshotBookDocuments(db, project)
      return mapOutline(db.prepare('SELECT * FROM outlines WHERE id = ?').get(id))
    })
  }

  function recordChapterOutlineRun(input = {}) {
    return runInTransaction(() => {
      const run = input.run || input
      const result = input.result || run.result || {}
      const payload = input.payload || run.payload || run
      const project = ensureProject(db, {
        booksDir,
        bookName: input.bookName || run.bookName || payload.bookName,
        bookPath: input.bookPath || run.bookPath || payload.bookPath,
        meta: input.meta
      })
      if (!project) throw new Error('记录章纲写作前需要有效作品')

      const generatedContent = rawText(result.content ?? run.content ?? payload.content)
      if (!generatedContent.trim()) throw new Error('记录章纲写作前需要正文内容')

      const id = cleanText(run.id || run.runId || input.runId) || `outline_chapter_${randomUUID()}`
      const timestamp = nowIso()
      db.prepare(
        `
          INSERT INTO chapter_outline_runs (
            id, project_id, outline_id, outline_title, outline_content,
            volume_name, chapter_name, user_requirement, target_words,
            previous_excerpt, generated_content, word_count, provider_id,
            model, usage_json, raw_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            outline_id = excluded.outline_id,
            outline_title = excluded.outline_title,
            outline_content = excluded.outline_content,
            volume_name = excluded.volume_name,
            chapter_name = excluded.chapter_name,
            user_requirement = excluded.user_requirement,
            target_words = excluded.target_words,
            previous_excerpt = excluded.previous_excerpt,
            generated_content = excluded.generated_content,
            word_count = excluded.word_count,
            provider_id = excluded.provider_id,
            model = excluded.model,
            usage_json = excluded.usage_json,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
        `
      ).run(
        id,
        project.id,
        cleanText(run.outlineId || payload.outlineId || payload.nodeId),
        cleanText(run.outlineTitle || payload.outlineTitle),
        rawText(run.outlineContent ?? payload.outlineContent),
        cleanText(run.volumeName || payload.volumeName),
        cleanText(run.chapterName || payload.chapterName),
        rawText(run.userRequirement ?? payload.userRequirement),
        Number(run.targetWords || payload.targetWords || 0),
        rawText(run.previousChapterExcerpt ?? payload.previousChapterExcerpt),
        generatedContent,
        Number(run.wordCount || result.wordCount || countWords(generatedContent)),
        cleanText(result.providerId || run.providerId || payload.providerId),
        cleanText(result.model || result.modelName || run.model || payload.model || payload.modelName),
        jsonText(result.usage || run.usage || {}),
        jsonText({ payload, result }),
        timestamp,
        timestamp
      )
      return mapChapterOutlineRun(db.prepare('SELECT * FROM chapter_outline_runs WHERE id = ?').get(id))
    })
  }

  function recordExtractionRun(input = {}) {
    return runInTransaction(() => {
      const extraction = input.extraction || input.result || input
      const bookPath = cleanText(input.bookPath || extraction.bookPath)
      const inferredBookName = bookPath ? basename(bookPath) : ''
      const bookName = cleanText(input.bookName || extraction.bookName) || inferredBookName
      const project = ensureProject(db, {
        booksDir,
        bookName,
        bookPath,
        meta: input.meta
      })
      if (!project) throw new Error('记录拆书结果前需要有效作品')

      const id = cleanText(input.id || extraction.id || extraction.runId) || `extraction_${randomUUID()}`
      const stats = extraction.stats && typeof extraction.stats === 'object' ? extraction.stats : {}
      const usage = input.usage || extraction.usage || stats.tokenUsage || {}
      const timestamp = nowIso()
      const createdAt = cleanText(extraction.createdAt) || timestamp
      const updatedAt = cleanText(extraction.updatedAt) || timestamp
      db.prepare(
        `
          INSERT INTO extraction_runs (
            id, project_id, books_dir, book_name, book_path, source_book_name,
            source_type, source_url, run_mode, status, lifecycle_status,
            chapter_scope_json, dimensions_json, stats_json, result_json,
            provider_id, model, usage_json, raw_json,
            applied_knowledge_item_ids_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            project_id = excluded.project_id,
            books_dir = excluded.books_dir,
            book_name = excluded.book_name,
            book_path = excluded.book_path,
            source_book_name = excluded.source_book_name,
            source_type = excluded.source_type,
            source_url = excluded.source_url,
            run_mode = excluded.run_mode,
            status = excluded.status,
            lifecycle_status = excluded.lifecycle_status,
            chapter_scope_json = excluded.chapter_scope_json,
            dimensions_json = excluded.dimensions_json,
            stats_json = excluded.stats_json,
            result_json = excluded.result_json,
            provider_id = excluded.provider_id,
            model = excluded.model,
            usage_json = excluded.usage_json,
            raw_json = excluded.raw_json,
            applied_knowledge_item_ids_json = excluded.applied_knowledge_item_ids_json,
            updated_at = excluded.updated_at
        `
      ).run(
        id,
        project.id,
        resolveBooksDir(input.booksDir || booksDir),
        project.bookName || safeName(bookName),
        bookPath || project.bookPath || '',
        cleanText(extraction.sourceBookName),
        cleanText(extraction.sourceType),
        cleanText(extraction.sourceUrl),
        cleanText(extraction.runMode) || 'append',
        cleanText(extraction.status),
        cleanText(extraction.lifecycleStatus) || 'active',
        jsonText(extraction.chapterScope || stats.chapterScope || null),
        jsonText(extraction.dimensions || {}),
        jsonText(stats),
        jsonText(extraction.results || {}),
        cleanText(extraction.providerId || input.providerId),
        cleanText(extraction.model || extraction.modelName || input.model || input.modelName),
        jsonText(usage),
        jsonText(
          redactSensitive({
            extraction,
            providerId: extraction.providerId || input.providerId || '',
            model: extraction.model || extraction.modelName || input.model || input.modelName || ''
          })
        ),
        jsonText(input.appliedKnowledgeItemIds || extraction.appliedKnowledgeItemIds || []),
        createdAt,
        updatedAt
      )
      snapshotBookDocuments(db, project)
      return mapExtractionRun(db.prepare('SELECT * FROM extraction_runs WHERE id = ?').get(id))
    })
  }

  function recordConsistencyCheck(input = {}) {
    return runInTransaction(() => {
      const check = input.check || input
      const project = ensureProject(db, {
        booksDir,
        bookName: input.bookName,
        bookPath: input.bookPath,
        meta: input.meta
      })
      if (!project) throw new Error('记录检查结果前需要有效作品')

      const id = cleanText(check.id || input.checkId) || `check_${randomUUID()}`
      db.prepare(
        `
          INSERT INTO consistency_checks (
            id, project_id, chapter_name, source, summary, issue_count,
            issues_json, raw_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            chapter_name = excluded.chapter_name,
            source = excluded.source,
            summary = excluded.summary,
            issue_count = excluded.issue_count,
            issues_json = excluded.issues_json,
            raw_json = excluded.raw_json
        `
      ).run(
        id,
        project.id,
        cleanText(input.chapterName || check.chapterName),
        cleanText(input.source || check.source),
        cleanText(input.summary || check.summary),
        Number(input.issues?.length || check.issueCount || check.issues?.length || 0),
        jsonText(input.issues || check.issues || []),
        jsonText(check),
        nowIso()
      )
      return mapConsistencyCheck(db.prepare('SELECT * FROM consistency_checks WHERE id = ?').get(id))
    })
  }

  function recordChapterWrite(input = {}) {
    return runInTransaction(() => {
      const chapter = input.chapter || input
      const project = ensureProject(db, {
        booksDir,
        bookName: input.bookName || chapter.bookName,
        bookPath: input.bookPath,
        meta: input.meta
      })
      if (!project) throw new Error('记录章节前需要有效作品')

      const volumeName = cleanText(chapter.volumeName) || '正文'
      const chapterName = cleanText(chapter.chapterName) || '第1章'
      const previousChapterName = cleanText(chapter.previousChapterName || input.previousChapterName)
      const filePath = cleanText(chapter.filePath) || join(project.bookPath, '正文', volumeName, `${chapterName}.txt`)
      const contentText = rawText(chapter.content)
      const id = cleanText(chapter.id) || `${project.id}:${volumeName}:${chapterName}`
      const check = chapter.check || null
      const issues = Array.isArray(chapter.issues) ? chapter.issues : []
      const timestamp = nowIso()

      if (previousChapterName && previousChapterName !== chapterName) {
        db.prepare('DELETE FROM chapters WHERE project_id = ? AND volume_name = ? AND chapter_name = ?').run(
          project.id,
          volumeName,
          previousChapterName
        )
      }

      db.prepare(
        `
          INSERT INTO chapters (
            id, project_id, volume_name, chapter_name, file_path, content_text, word_count,
            provider_id, model, task_id, generation_id, repair_generation_id,
            check_id, issue_count, review_json, repaired, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id, volume_name, chapter_name) DO UPDATE SET
            file_path = excluded.file_path,
            content_text = excluded.content_text,
            word_count = excluded.word_count,
            provider_id = excluded.provider_id,
            model = excluded.model,
            task_id = excluded.task_id,
            generation_id = excluded.generation_id,
            repair_generation_id = excluded.repair_generation_id,
            check_id = excluded.check_id,
            issue_count = excluded.issue_count,
            review_json = excluded.review_json,
            repaired = excluded.repaired,
            updated_at = excluded.updated_at
        `
      ).run(
        id,
        project.id,
        volumeName,
        chapterName,
        filePath,
        contentText,
        Number(chapter.wordCount || 0),
        cleanText(chapter.providerId),
        cleanText(chapter.model),
        cleanText(chapter.taskId),
        cleanText(chapter.generationId),
        cleanText(chapter.repairGenerationId),
        cleanText(check?.id || chapter.checkId),
        Number(issues.length || chapter.issueCount || 0),
        jsonText(chapter.review ?? null),
        chapter.repaired ? 1 : 0,
        timestamp,
        timestamp
      )

      if (chapter.taskId) {
        db.prepare(
          `
            INSERT INTO agent_tasks (
              id, project_id, chapter_name, status, mode, provider_id, model,
              generation_id, repair_generation_id, word_count, review_json,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              chapter_name = excluded.chapter_name,
              status = excluded.status,
              mode = excluded.mode,
              provider_id = excluded.provider_id,
              model = excluded.model,
              generation_id = excluded.generation_id,
              repair_generation_id = excluded.repair_generation_id,
              word_count = excluded.word_count,
              review_json = excluded.review_json,
              updated_at = excluded.updated_at
          `
        ).run(
          chapter.taskId,
          project.id,
          chapterName,
          cleanText(chapter.status) || 'checked',
          cleanText(chapter.mode),
          cleanText(chapter.providerId),
          cleanText(chapter.model),
          cleanText(chapter.generationId),
          cleanText(chapter.repairGenerationId),
          Number(chapter.wordCount || 0),
          jsonText(chapter.review ?? null),
          timestamp,
          timestamp
        )
      }

      if (check?.id) {
        recordConsistencyCheck({
          bookName: project.bookName,
          bookPath: project.bookPath,
          chapterName,
          check,
          issues,
          summary: check.summary,
          source: check.source
        })
      }

      snapshotBookDocuments(db, project)
      return mapChapter(
        db
          .prepare('SELECT * FROM chapters WHERE project_id = ? AND volume_name = ? AND chapter_name = ?')
          .get(project.id, volumeName, chapterName)
      )
    })
  }

  function recordExport(input = {}) {
    return runInTransaction(() => {
      const result = input.result || input
      const project = ensureProject(db, {
        booksDir,
        bookName: input.bookName || result.bookName,
        bookPath: input.bookPath,
        meta: input.meta
      })
      if (!project) throw new Error('记录导出前需要有效作品')

      const id = input.id || result.task?.id || `export_${randomUUID()}`
      db.prepare(
        `
          INSERT INTO exports (
            id, project_id, format, file_path, file_name, size, task_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        id,
        project.id,
        cleanText(result.format || input.format),
        cleanText(result.filePath),
        cleanText(result.fileName),
        Number(result.size || 0),
        cleanText(result.task?.id || input.taskId),
        nowIso()
      )
      return mapExport(db.prepare('SELECT * FROM exports WHERE id = ?').get(id))
    })
  }

  function recordBackup(input = {}) {
    return runInTransaction(() => {
      const result = input.result || input
      const scope = cleanText(result.scope || input.scope || result.task?.scope)
      const bookName = input.bookName || result.bookName || result.task?.bookName
      const project = bookName
        ? ensureProject(db, {
          booksDir,
          bookName,
          bookPath: input.bookPath,
          meta: input.meta
        })
        : null
      const id = input.id || result.task?.id || `backup_${randomUUID()}`
      db.prepare(
        `
          INSERT INTO backups (
            id, project_id, scope, file_path, file_name, size, task_id, raw_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        id,
        project?.id || null,
        scope,
        cleanText(result.filePath),
        cleanText(result.fileName),
        Number(result.size || 0),
        cleanText(result.task?.id || input.taskId),
        jsonText(redactSensitive(result)),
        nowIso()
      )
      return mapBackup(db.prepare('SELECT * FROM backups WHERE id = ?').get(id))
    })
  }

  function listMigrations() {
    return db
      .prepare('SELECT id, applied_at AS appliedAt FROM schema_migrations ORDER BY id')
      .all()
  }

  function listProjects() {
    return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all().map(mapProject)
  }

  function getProjectByName(bookName) {
    return mapProject(getProjectByNameRow(db, bookName))
  }

  function getProjectById(projectId) {
    return mapProject(getProjectByIdRow(db, projectId))
  }

  function listBookDocuments(projectId) {
    return db
      .prepare('SELECT * FROM book_documents WHERE project_id = ? ORDER BY document_type')
      .all(projectId)
      .map(mapDocument)
  }

  function getBookDocument(projectId, documentType) {
    const type = cleanText(documentType)
    if (!projectId || !type) return null
    return mapDocument(
      db
        .prepare('SELECT * FROM book_documents WHERE project_id = ? AND document_type = ?')
        .get(projectId, type)
    )
  }

  function listResearchRuns(projectId = '') {
    const rows = projectId
      ? db.prepare('SELECT * FROM research_runs WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
      : db.prepare('SELECT * FROM research_runs ORDER BY created_at DESC').all()
    return rows.map(mapResearchRun)
  }

  function getResearchRun(projectId = '', input = {}) {
    const id = cleanText(input.researchRunId || input.researchId || input.id)
    if (!id) return null
    const row = projectId
      ? db.prepare('SELECT * FROM research_runs WHERE project_id = ? AND id = ?').get(projectId, id)
      : db.prepare('SELECT * FROM research_runs WHERE id = ?').get(id)
    return mapResearchRun(row)
  }

  function listBookIdeaRuns(projectId = '') {
    const rows = projectId
      ? db.prepare('SELECT * FROM book_idea_runs WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
      : db.prepare('SELECT * FROM book_idea_runs ORDER BY updated_at DESC').all()
    return rows.map(mapBookIdeaRun)
  }

  function getBookIdeaRun(projectId = '', input = {}) {
    const id = cleanText(input.bookIdeaRunId || input.ideaRunId || input.runId || input.id)
    if (id) {
      const row = projectId
        ? db.prepare('SELECT * FROM book_idea_runs WHERE project_id = ? AND id = ?').get(projectId, id)
        : db.prepare('SELECT * FROM book_idea_runs WHERE id = ?').get(id)
      return mapBookIdeaRun(row)
    }

    const selectedPlanId = cleanText(input.selectedPlanId || input.planId)
    if (!selectedPlanId) return null
    const row = projectId
      ? db
          .prepare(
            `SELECT * FROM book_idea_runs
             WHERE project_id = ? AND selected_plan_id = ?
             ORDER BY CASE WHEN status = 'confirmed' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`
          )
          .get(projectId, selectedPlanId)
      : db
          .prepare(
            `SELECT * FROM book_idea_runs
             WHERE selected_plan_id = ?
             ORDER BY CASE WHEN status = 'confirmed' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`
          )
          .get(selectedPlanId)
    return mapBookIdeaRun(row)
  }

  function listOutlines(projectId = '') {
    const rows = projectId
      ? db.prepare('SELECT * FROM outlines WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
      : db.prepare('SELECT * FROM outlines ORDER BY updated_at DESC').all()
    return rows.map(mapOutline)
  }

  function getOutline(projectId = '', input = {}) {
    const id = cleanText(input.outlineId || input.id)
    if (!id) return null
    const row = projectId
      ? db.prepare('SELECT * FROM outlines WHERE project_id = ? AND id = ?').get(projectId, id)
      : db.prepare('SELECT * FROM outlines WHERE id = ?').get(id)
    return mapOutline(row)
  }

  function listChapterOutlineRuns(projectId = '') {
    const rows = projectId
      ? db.prepare('SELECT * FROM chapter_outline_runs WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
      : db.prepare('SELECT * FROM chapter_outline_runs ORDER BY updated_at DESC').all()
    return rows.map(mapChapterOutlineRun)
  }

  function getChapterOutlineRun(projectId = '', input = {}) {
    const id = cleanText(input.chapterOutlineRunId || input.outlineChapterRunId || input.runId || input.id)
    if (id) {
      const row = projectId
        ? db.prepare('SELECT * FROM chapter_outline_runs WHERE project_id = ? AND id = ?').get(projectId, id)
        : db.prepare('SELECT * FROM chapter_outline_runs WHERE id = ?').get(id)
      return mapChapterOutlineRun(row)
    }

    const chapterName = cleanText(input.chapterName)
    if (!chapterName) return null
    const volumeName = cleanText(input.volumeName)
    if (projectId && volumeName) {
      return mapChapterOutlineRun(
        db
          .prepare(
            'SELECT * FROM chapter_outline_runs WHERE project_id = ? AND volume_name = ? AND chapter_name = ? ORDER BY updated_at DESC LIMIT 1'
          )
          .get(projectId, volumeName, chapterName)
      )
    }
    if (projectId) {
      return mapChapterOutlineRun(
        db
          .prepare(
            'SELECT * FROM chapter_outline_runs WHERE project_id = ? AND chapter_name = ? ORDER BY updated_at DESC LIMIT 1'
          )
          .get(projectId, chapterName)
      )
    }
    return mapChapterOutlineRun(
      db
        .prepare('SELECT * FROM chapter_outline_runs WHERE chapter_name = ? ORDER BY updated_at DESC LIMIT 1')
        .get(chapterName)
    )
  }

  function listExtractionRuns(projectId = '') {
    const rows = projectId
      ? db.prepare('SELECT * FROM extraction_runs WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
      : db.prepare('SELECT * FROM extraction_runs ORDER BY updated_at DESC').all()
    return rows.map(mapExtractionRun)
  }

  function getExtractionRun(projectId = '', input = {}) {
    const id = cleanText(input.extractionRunId || input.extractionId || input.runId || input.id)
    if (id) {
      const row = projectId
        ? db.prepare('SELECT * FROM extraction_runs WHERE project_id = ? AND id = ?').get(projectId, id)
        : db.prepare('SELECT * FROM extraction_runs WHERE id = ?').get(id)
      return mapExtractionRun(row)
    }

    const sourceBookName = cleanText(input.sourceBookName)
    if (!sourceBookName) return null
    const row = projectId
      ? db
          .prepare(
            'SELECT * FROM extraction_runs WHERE project_id = ? AND source_book_name = ? ORDER BY updated_at DESC LIMIT 1'
          )
          .get(projectId, sourceBookName)
      : db
          .prepare('SELECT * FROM extraction_runs WHERE source_book_name = ? ORDER BY updated_at DESC LIMIT 1')
          .get(sourceBookName)
    return mapExtractionRun(row)
  }

  function listChapters(projectId = '') {
    const rows = projectId
      ? db.prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
      : db.prepare('SELECT * FROM chapters ORDER BY updated_at DESC').all()
    return rows.map(mapChapter)
  }

  function getChapter(projectId = '', input = {}) {
    const chapterId = cleanText(input.chapterId || input.id)
    if (chapterId) {
      const row = projectId
        ? db.prepare('SELECT * FROM chapters WHERE project_id = ? AND id = ?').get(projectId, chapterId)
        : db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId)
      return mapChapter(row)
    }

    const chapterName = cleanText(input.chapterName)
    if (!chapterName) return null

    const volumeName = cleanText(input.volumeName)
    if (projectId && volumeName) {
      return mapChapter(
        db
          .prepare('SELECT * FROM chapters WHERE project_id = ? AND volume_name = ? AND chapter_name = ?')
          .get(projectId, volumeName, chapterName)
      )
    }
    if (projectId) {
      return mapChapter(
        db
          .prepare('SELECT * FROM chapters WHERE project_id = ? AND chapter_name = ? ORDER BY updated_at DESC LIMIT 1')
          .get(projectId, chapterName)
      )
    }
    return mapChapter(
      db
        .prepare('SELECT * FROM chapters WHERE chapter_name = ? ORDER BY updated_at DESC LIMIT 1')
        .get(chapterName)
    )
  }

  function listAgentTasks(projectId = '') {
    const rows = projectId
      ? db.prepare('SELECT * FROM agent_tasks WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
      : db.prepare('SELECT * FROM agent_tasks ORDER BY updated_at DESC').all()
    return rows.map(mapAgentTask)
  }

  function getAgentTask(projectId = '', input = {}) {
    const id = cleanText(input.taskId || input.agentTaskId || input.id)
    if (!id) return null
    const row = projectId
      ? db.prepare('SELECT * FROM agent_tasks WHERE project_id = ? AND id = ?').get(projectId, id)
      : db.prepare('SELECT * FROM agent_tasks WHERE id = ?').get(id)
    return mapAgentTask(row)
  }

  function listConsistencyChecks(projectId = '') {
    const rows = projectId
      ? db.prepare('SELECT * FROM consistency_checks WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
      : db.prepare('SELECT * FROM consistency_checks ORDER BY created_at DESC').all()
    return rows.map(mapConsistencyCheck)
  }

  function getConsistencyCheck(projectId = '', input = {}) {
    const id = cleanText(input.checkId || input.consistencyCheckId || input.id)
    if (!id) return null
    const row = projectId
      ? db.prepare('SELECT * FROM consistency_checks WHERE project_id = ? AND id = ?').get(projectId, id)
      : db.prepare('SELECT * FROM consistency_checks WHERE id = ?').get(id)
    return mapConsistencyCheck(row)
  }

  function listExports(projectId = '') {
    const rows = projectId
      ? db.prepare('SELECT * FROM exports WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
      : db.prepare('SELECT * FROM exports ORDER BY created_at DESC').all()
    return rows.map(mapExport)
  }

  function getExport(projectId = '', input = {}) {
    const id = cleanText(input.exportId || input.id)
    if (id) {
      const row = projectId
        ? db.prepare('SELECT * FROM exports WHERE project_id = ? AND id = ?').get(projectId, id)
        : db.prepare('SELECT * FROM exports WHERE id = ?').get(id)
      return mapExport(row)
    }

    const taskId = cleanText(input.taskId)
    if (!taskId) return null
    const row = projectId
      ? db
          .prepare('SELECT * FROM exports WHERE project_id = ? AND task_id = ? ORDER BY created_at DESC LIMIT 1')
          .get(projectId, taskId)
      : db.prepare('SELECT * FROM exports WHERE task_id = ? ORDER BY created_at DESC LIMIT 1').get(taskId)
    return mapExport(row)
  }

  function listBackups(projectId = '') {
    const rows = projectId
      ? db.prepare('SELECT * FROM backups WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
      : db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all()
    return rows.map(mapBackup)
  }

  function getBackup(projectId = '', input = {}) {
    const id = cleanText(input.backupId || input.id)
    if (id) {
      const row = projectId
        ? db.prepare('SELECT * FROM backups WHERE project_id = ? AND id = ?').get(projectId, id)
        : db.prepare('SELECT * FROM backups WHERE id = ?').get(id)
      return mapBackup(row)
    }

    const taskId = cleanText(input.taskId)
    if (!taskId) return null
    const row = projectId
      ? db
          .prepare('SELECT * FROM backups WHERE project_id = ? AND task_id = ? ORDER BY created_at DESC LIMIT 1')
          .get(projectId, taskId)
      : db.prepare('SELECT * FROM backups WHERE task_id = ? ORDER BY created_at DESC LIMIT 1').get(taskId)
    return mapBackup(row)
  }

  return {
    booksDir: resolveBooksDir(booksDir),
    dbPath,
    close: () => db.close(),
    withTransaction,
    upsertProjectFromBook,
    syncBookDocument,
    syncBookDocuments,
    recordResearchRun,
    recordBookIdeaRun,
    confirmBookIdeaRun,
    recordOutline,
    recordChapterOutlineRun,
    recordExtractionRun,
    recordChapterWrite,
    recordConsistencyCheck,
    recordExport,
    recordBackup,
    listMigrations,
    listProjects,
    getProjectByName,
    getProjectById,
    listBookDocuments,
    getBookDocument,
    listResearchRuns,
    getResearchRun,
    listBookIdeaRuns,
    getBookIdeaRun,
    listOutlines,
    getOutline,
    listChapterOutlineRuns,
    getChapterOutlineRun,
    listExtractionRuns,
    getExtractionRun,
    listChapters,
    getChapter,
    listAgentTasks,
    getAgentTask,
    listConsistencyChecks,
    getConsistencyCheck,
    listExports,
    getExport,
    listBackups,
    getBackup
  }
}

export function getNovelDatabasePath(booksDir) {
  return resolveDatabasePath(booksDir)
}

export function openNovelDatabase(booksDir) {
  const dbPath = resolveDatabasePath(booksDir)
  fs.mkdirSync(dirname(dbPath), { recursive: true })
  const { DatabaseSync } = loadSqliteModule()
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA foreign_keys = ON')
  applyMigrations(db)
  return createRepository(db, dbPath, resolveBooksDir(booksDir))
}

export function withNovelDatabase(booksDir, callback) {
  const repository = openNovelDatabase(booksDir)
  try {
    return callback(repository)
  } finally {
    repository.close()
  }
}

function findDatabaseProject(repository, { bookName = '', projectId = '' } = {}) {
  const id = cleanText(projectId)
  if (id) return repository.getProjectById(id)
  const name = cleanText(bookName)
  return name ? repository.getProjectByName(name) : null
}

function hasProjectFilter(input = {}) {
  return Boolean(cleanText(input.bookName) || cleanText(input.projectId))
}

function listProjectResource(input = {}, listKey, repositoryMethod) {
  return withNovelDatabase(input.booksDir, (repository) => {
    const project = findDatabaseProject(repository, input)
    if (hasProjectFilter(input) && !project) {
      return {
        booksDir: repository.booksDir,
        dbPath: repository.dbPath,
        project: null,
        [listKey]: []
      }
    }
    const projectId = project?.id || ''
    return {
      booksDir: repository.booksDir,
      dbPath: repository.dbPath,
      project,
      [listKey]: repository[repositoryMethod](projectId)
    }
  })
}

function getProjectResource(input = {}, itemKey, repositoryMethod) {
  return withNovelDatabase(input.booksDir, (repository) => {
    const project = findDatabaseProject(repository, input)
    if (hasProjectFilter(input) && !project) {
      return {
        booksDir: repository.booksDir,
        dbPath: repository.dbPath,
        project: null,
        [itemKey]: null
      }
    }
    const projectId = project?.id || ''
    return {
      booksDir: repository.booksDir,
      dbPath: repository.dbPath,
      project,
      [itemKey]: repository[repositoryMethod](projectId, input)
    }
  })
}

export function upsertProjectFromBook(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.upsertProjectFromBook(input))
}

export function syncBookDocument(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.syncBookDocument(input))
}

export function syncBookDocuments(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.syncBookDocuments(input))
}

export function recordResearchRun(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.recordResearchRun(input))
}

export function recordBookIdeaRun(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.recordBookIdeaRun(input))
}

export function confirmBookIdeaRun(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.confirmBookIdeaRun(input))
}

export function recordOutline(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.recordOutline(input))
}

export function recordChapterOutlineRun(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.recordChapterOutlineRun(input))
}

export function recordExtractionRun(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.recordExtractionRun(input))
}

export function recordChapterWrite(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.recordChapterWrite(input))
}

export function recordConsistencyCheck(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.recordConsistencyCheck(input))
}

export function recordExport(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.recordExport(input))
}

export function recordBackup(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => repository.recordBackup(input))
}

export function listNovelDatabaseProjects(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => ({
    booksDir: repository.booksDir,
    dbPath: repository.dbPath,
    projects: repository.listProjects()
  }))
}

export function getNovelDatabaseProject(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => ({
    booksDir: repository.booksDir,
    dbPath: repository.dbPath,
    project: findDatabaseProject(repository, input)
  }))
}

export function listNovelDatabaseChapters(input = {}) {
  return listProjectResource(input, 'chapters', 'listChapters')
}

export function getNovelDatabaseChapter(input = {}) {
  return getProjectResource(input, 'chapter', 'getChapter')
}

export function getNovelDatabaseDocument(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => {
    const project = findDatabaseProject(repository, input)
    if (!project) {
      return {
        booksDir: repository.booksDir,
        dbPath: repository.dbPath,
        project: null,
        document: null
      }
    }
    return {
      booksDir: repository.booksDir,
      dbPath: repository.dbPath,
      project,
      document: repository.getBookDocument(project.id, input.documentType || input.type)
    }
  })
}

export function listNovelDatabaseResearchRuns(input = {}) {
  return listProjectResource(input, 'researchRuns', 'listResearchRuns')
}

export function getNovelDatabaseResearchRun(input = {}) {
  return getProjectResource(input, 'researchRun', 'getResearchRun')
}

export function listNovelDatabaseBookIdeaRuns(input = {}) {
  return listProjectResource(input, 'bookIdeaRuns', 'listBookIdeaRuns')
}

export function getNovelDatabaseBookIdeaRun(input = {}) {
  return getProjectResource(input, 'bookIdeaRun', 'getBookIdeaRun')
}

export function listNovelDatabaseOutlines(input = {}) {
  return listProjectResource(input, 'outlines', 'listOutlines')
}

export function getNovelDatabaseOutline(input = {}) {
  return getProjectResource(input, 'outline', 'getOutline')
}

export function listNovelDatabaseChapterOutlineRuns(input = {}) {
  return listProjectResource(input, 'chapterOutlineRuns', 'listChapterOutlineRuns')
}

export function getNovelDatabaseChapterOutlineRun(input = {}) {
  return getProjectResource(input, 'chapterOutlineRun', 'getChapterOutlineRun')
}

export function listNovelDatabaseExtractionRuns(input = {}) {
  return listProjectResource(input, 'extractionRuns', 'listExtractionRuns')
}

export function getNovelDatabaseExtractionRun(input = {}) {
  return getProjectResource(input, 'extractionRun', 'getExtractionRun')
}

export function listNovelDatabaseAgentTasks(input = {}) {
  return listProjectResource(input, 'agentTasks', 'listAgentTasks')
}

export function getNovelDatabaseAgentTask(input = {}) {
  return getProjectResource(input, 'agentTask', 'getAgentTask')
}

export function listNovelDatabaseConsistencyChecks(input = {}) {
  return listProjectResource(input, 'consistencyChecks', 'listConsistencyChecks')
}

export function getNovelDatabaseConsistencyCheck(input = {}) {
  return getProjectResource(input, 'consistencyCheck', 'getConsistencyCheck')
}

export function listNovelDatabaseExports(input = {}) {
  return listProjectResource(input, 'exports', 'listExports')
}

export function getNovelDatabaseExport(input = {}) {
  return getProjectResource(input, 'exportRecord', 'getExport')
}

export function listNovelDatabaseBackups(input = {}) {
  return listProjectResource(input, 'backups', 'listBackups')
}

export function getNovelDatabaseBackup(input = {}) {
  return getProjectResource(input, 'backupRecord', 'getBackup')
}

export function readNovelDatabaseSnapshot(input = {}) {
  return withNovelDatabase(input.booksDir, (repository) => {
    const project = findDatabaseProject(repository, input)
    const projectId = project?.id || ''
    if ((input.bookName || input.projectId) && !project) {
      return {
        booksDir: repository.booksDir,
        dbPath: repository.dbPath,
        migrations: repository.listMigrations(),
        project: null,
        projects: [],
        documents: [],
        researchRuns: [],
        bookIdeaRuns: [],
        outlines: [],
        chapterOutlineRuns: [],
        extractionRuns: [],
        chapters: [],
        agentTasks: [],
        consistencyChecks: [],
        exports: [],
        backups: []
      }
    }

    return {
      booksDir: repository.booksDir,
      dbPath: repository.dbPath,
      migrations: repository.listMigrations(),
      project,
      projects: project ? [project] : repository.listProjects(),
      documents: projectId ? repository.listBookDocuments(projectId) : [],
      researchRuns: repository.listResearchRuns(projectId),
      bookIdeaRuns: repository.listBookIdeaRuns(projectId),
      outlines: repository.listOutlines(projectId),
      chapterOutlineRuns: repository.listChapterOutlineRuns(projectId),
      extractionRuns: repository.listExtractionRuns(projectId),
      chapters: repository.listChapters(projectId),
      agentTasks: repository.listAgentTasks(projectId),
      consistencyChecks: repository.listConsistencyChecks(projectId),
      exports: repository.listExports(projectId),
      backups: repository.listBackups(projectId)
    }
  })
}

export default {
  getNovelDatabasePath,
  openNovelDatabase,
  withNovelDatabase,
  upsertProjectFromBook,
  syncBookDocument,
  syncBookDocuments,
  recordResearchRun,
  recordBookIdeaRun,
  confirmBookIdeaRun,
  recordOutline,
  recordChapterOutlineRun,
  recordExtractionRun,
  recordChapterWrite,
  recordConsistencyCheck,
  recordExport,
  recordBackup,
  listNovelDatabaseProjects,
  getNovelDatabaseProject,
  listNovelDatabaseChapters,
  getNovelDatabaseChapter,
  getNovelDatabaseDocument,
  listNovelDatabaseResearchRuns,
  getNovelDatabaseResearchRun,
  listNovelDatabaseBookIdeaRuns,
  getNovelDatabaseBookIdeaRun,
  listNovelDatabaseOutlines,
  getNovelDatabaseOutline,
  listNovelDatabaseChapterOutlineRuns,
  getNovelDatabaseChapterOutlineRun,
  listNovelDatabaseExtractionRuns,
  getNovelDatabaseExtractionRun,
  listNovelDatabaseAgentTasks,
  getNovelDatabaseAgentTask,
  listNovelDatabaseConsistencyChecks,
  getNovelDatabaseConsistencyCheck,
  listNovelDatabaseExports,
  getNovelDatabaseExport,
  listNovelDatabaseBackups,
  getNovelDatabaseBackup,
  readNovelDatabaseSnapshot
}
