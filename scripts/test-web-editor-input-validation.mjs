import assert from 'node:assert/strict'
import * as editor from '../src/renderer/src/service/editor.js'

const invalidCalls = [
  [() => editor.getSortOrder(), /缺少作品名/],
  [() => editor.setSortOrder(), /缺少作品名/],
  [() => editor.setSortOrder('作品', 'unknown'), /排序方式无效/],
  [() => editor.getChapterSettings(), /缺少作品名/],
  [() => editor.listBannedWords(), /缺少作品名/],
  [() => editor.addBannedWord('', '禁词'), /缺少作品名/],
  [() => editor.addBannedWord('作品', ''), /缺少禁词/],
  [() => editor.removeBannedWord('', '禁词'), /缺少作品名/],
  [() => editor.removeBannedWord('作品', ''), /缺少禁词/],
  [() => editor.readChapterContent('', '第一卷', '第一章'), /缺少作品名/],
  [() => editor.readChapterContent('作品', '', '第一章'), /缺少卷名/],
  [() => editor.readChapterContent('作品', '第一卷', ''), /缺少章节名/],
  [() => editor.checkChapterExistsForOutline(), /缺少作品名/],
  [
    () => editor.checkChapterExistsForOutline({ bookName: '作品' }),
    /缺少卷名/
  ],
  [
    () => editor.checkChapterExistsForOutline({ bookName: '作品', volumeName: '第一卷' }),
    /缺少章节名/
  ],
  [() => editor.upsertOutlineChapter(), /缺少作品名/],
  [() => editor.upsertOutlineChapter({ bookName: '作品' }), /缺少卷名/],
  [
    () => editor.upsertOutlineChapter({ bookName: '作品', volumeName: '第一卷' }),
    /缺少章节名/
  ],
  [
    () =>
      editor.upsertOutlineChapter({
        bookName: '作品',
        volumeName: '第一卷',
        chapterName: '第一章'
      }),
    /正文为空/
  ],
  [() => editor.upsertChapterDocument(), /缺少作品名/],
  [() => editor.upsertChapterDocument({ bookName: '作品' }), /缺少卷名/],
  [
    () => editor.upsertChapterDocument({ bookName: '作品', volumeName: '第一卷' }),
    /缺少章节名/
  ],
  [() => editor.createChapterDocument('', '第一卷'), /缺少作品名/],
  [() => editor.createChapterDocument('作品', ''), /缺少卷名/],
  [() => editor.saveChapterDocument(), /缺少作品名/],
  [() => editor.saveChapterDocument({ bookName: '作品' }), /缺少卷名/],
  [
    () => editor.saveChapterDocument({ bookName: '作品', volumeName: '第一卷' }),
    /缺少章节名/
  ],
  [() => editor.readOutlineDocument(), /缺少作品名/],
  [() => editor.writeOutlineDocument('', {}), /缺少作品名/],
  [() => editor.writeOutlineDocument('作品', []), /大纲内容格式不正确/],
  [
    () => editor.writeOutlineDocument('作品', { children: {} }),
    /大纲内容格式不正确/
  ],
  [() => editor.readOutlineAiSessionsDocument(), /缺少作品名/],
  [() => editor.writeOutlineAiSessionsDocument('', {}), /缺少作品名/],
  [
    () => editor.writeOutlineAiSessionsDocument('作品', []),
    /会话内容格式不正确/
  ],
  [
    () => editor.writeOutlineAiSessionsDocument('作品', { nodes: [] }),
    /会话内容格式不正确/
  ],
  [() => editor.listChapterTree(), /缺少作品名/],
  [() => editor.createVolumeDocument(), /缺少作品名/],
  [() => editor.editChapterNode(), /缺少作品名/],
  [() => editor.deleteChapterNode(), /缺少作品名/],
  [() => editor.listNoteTree(), /缺少作品名/],
  [() => editor.createNotebookDocument(), /缺少作品名/],
  [() => editor.createNoteDocument('', '笔记本'), /缺少作品名/],
  [() => editor.createNoteDocument('作品', ''), /缺少笔记本名称/],
  [() => editor.ensureNotebookDocument('', '笔记本'), /缺少作品名/],
  [() => editor.ensureNotebookDocument('作品', ''), /缺少笔记本名称/],
  [() => editor.ensureNoteDocument('', '笔记本', '笔记'), /缺少作品名/],
  [() => editor.ensureNoteDocument('作品', '', '笔记'), /缺少笔记本名称/],
  [() => editor.ensureNoteDocument('作品', '笔记本', ''), /缺少笔记名称/],
  [() => editor.readNoteDocument('', '笔记本', '笔记'), /缺少作品名/],
  [() => editor.readNoteDocument('作品', '', '笔记'), /缺少笔记本名称/],
  [() => editor.readNoteDocument('作品', '笔记本', ''), /缺少笔记名称/],
  [() => editor.writeNoteDocument(), /缺少作品名/],
  [() => editor.writeNoteDocument({ bookName: '作品' }), /缺少笔记本名称/],
  [
    () => editor.writeNoteDocument({ bookName: '作品', notebookName: '笔记本' }),
    /缺少笔记名称/
  ],
  [() => editor.readSettingsDocument(), /缺少作品名/],
  [() => editor.writeSettingsDocument('', {}), /缺少作品名/],
  [() => editor.writeSettingsDocument('作品', []), /设定内容格式不正确/],
  [() => editor.writeSettingsDocument('作品', {}), /设定分类格式不正确/],
  [() => editor.readDictionaryDocument(), /缺少作品名/],
  [() => editor.readTimelineDocument(), /缺少作品名/],
  [() => editor.writeTimelineDocument('', []), /缺少作品名/],
  [() => editor.writeTimelineDocument('作品', {}), /时间线内容格式不正确/],
  [() => editor.readSequenceChartsDocument(), /缺少作品名/],
  [() => editor.writeSequenceChartsDocument('', []), /缺少作品名/],
  [() => editor.writeSequenceChartsDocument('作品', {}), /事序图内容格式不正确/],
  [() => editor.readCharactersDocument(), /缺少作品名/],
  [() => editor.writeCharactersDocument('', []), /缺少作品名/],
  [() => editor.writeCharactersDocument('作品', {}), /人物谱内容格式不正确/],
  [() => editor.readMapDocuments(), /缺少作品名/]
]

for (const [call, expected] of invalidCalls) {
  await assert.rejects(call, expected)
}

console.log(`Web 编辑器输入校验测试通过：${invalidCalls.length} 个异常参数`)
