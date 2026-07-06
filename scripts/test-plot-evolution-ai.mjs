import assert from 'node:assert/strict'
import plotEvolutionAiService from '../src/main/services/plotEvolutionAi.js'

function fakeTextProvider({ id = 'fake-provider', name = 'Fake Provider', model = 'fake-model', content, error }) {
  const calls = []
  return {
    id,
    name,
    model,
    calls,
    service: {
      async chat(options = {}) {
        calls.push(options)
        if (error) throw new Error(error)
        return {
          success: true,
          content,
          usage: { total_tokens: 18 },
          model: options.model || model,
          providerId: id
        }
      }
    }
  }
}

{
  const provider = fakeTextProvider({
    id: 'plot-a',
    name: 'Plot A',
    model: 'plot-model-a',
    content: JSON.stringify([
      {
        title: '暗线浮现',
        summary: '主角从旧案线索中发现师门旧敌已经入城，必须在宴会前确认内应身份。',
        conflict: '主角追查旧敌与保护同伴发生冲突',
        emotion: '紧张',
        keyEvents: ['旧案信物出现', '同伴被试探', '宴会前夜设局']
      }
    ])
  })

  const result = await plotEvolutionAiService.evolvePlot({
    outlineTitle: '宴会前夜',
    outlineContent: '主角发现城中有旧敌活动。',
    providers: [provider]
  })

  assert.equal(result.success, true)
  assert.equal(result.groups.length, 1)
  assert.equal(result.groups[0].providerId, 'plot-a')
  assert.equal(result.groups[0].providerName, 'Plot A')
  assert.equal(result.groups[0].model, 'plot-model-a')
  assert.equal(result.groups[0].proposals[0].title, '暗线浮现')
  assert.equal(provider.calls[0].temperature, 0.8)
  assert.equal(provider.calls[0].max_tokens, 4000)
  assert.equal(provider.calls[0].messages[0].role, 'system')
}

{
  const okProvider = fakeTextProvider({
    id: 'plot-ok',
    name: 'Plot OK',
    model: 'plot-model-ok',
    content: '[{"title":"顺藤摸瓜","summary":"主角先放走小卒，再借追踪符确认幕后据点。"}]'
  })
  const failedProvider = fakeTextProvider({
    id: 'plot-failed',
    name: 'Plot Failed',
    model: 'plot-model-failed',
    error: 'provider unavailable'
  })

  const result = await plotEvolutionAiService.evolvePlot({
    outlineContent: '主角需要找出幕后之人。',
    providers: [okProvider, failedProvider]
  })

  assert.equal(result.success, true)
  assert.equal(result.groups.length, 2)
  assert.equal(result.groups[0].proposals[0].title, '顺藤摸瓜')
  assert.equal(result.groups[1].providerId, 'plot-failed')
  assert.match(result.groups[1].error, /provider unavailable/)
}

{
  const malformedProvider = fakeTextProvider({
    id: 'plot-malformed',
    name: 'Plot Malformed',
    model: 'plot-model-malformed',
    content: '我建议主角继续查案，但这里没有按 JSON 返回方案。'
  })
  const okProvider = fakeTextProvider({
    id: 'plot-json-ok',
    name: 'Plot JSON OK',
    model: 'plot-model-json-ok',
    content: '[{"title":"借局破局","summary":"主角顺势接受对手邀约，暗中把局势引到自己熟悉的地盘。"}]'
  })

  const result = await plotEvolutionAiService.evolvePlot({
    outlineContent: '主角需要在两方势力之间寻找机会。',
    providers: [malformedProvider, okProvider]
  })

  assert.equal(result.success, true)
  assert.equal(result.groups.length, 2)
  assert.match(result.groups[0].error, /无法解析为剧情方案/)
  assert.equal(result.groups[0].proposals.length, 0)
  assert.equal(result.groups[1].proposals[0].title, '借局破局')
}

{
  const emptyProvider = fakeTextProvider({
    id: 'plot-empty',
    name: 'Plot Empty',
    model: 'plot-model-empty',
    content: ''
  })

  const result = await plotEvolutionAiService.evolvePlot({
    outlineContent: '主角发现线索断了。',
    providers: [emptyProvider]
  })

  assert.equal(result.success, false)
  assert.match(result.message, /返回内容为空/)
  assert.equal(result.groups.length, 1)
  assert.equal(result.groups[0].proposals.length, 0)
  assert.match(result.groups[0].error, /返回内容为空/)
}

{
  const provider = fakeTextProvider({
    id: 'plot-regenerate',
    name: 'Plot Regenerate',
    model: 'plot-model-regenerate',
    content: JSON.stringify({
      title: '反客为主',
      summary: '主角假装中计，借对手布置反向锁定真正的背叛者。',
      conflict: '信任危机与主动设局互相拉扯',
      emotion: '压迫',
      keyEvents: ['主角故意露出破绽', '对手提前行动', '背叛者暴露']
    })
  })

  const result = await plotEvolutionAiService.regenerateProposal({
    outlineContent: '主角被迫面对同伴中的叛徒。',
    previousProposals: [{ title: '暗线浮现', summary: '旧敌入城。' }],
    provider
  })

  assert.equal(result.success, true)
  assert.equal(result.providerId, 'plot-regenerate')
  assert.equal(result.model, 'plot-model-regenerate')
  assert.equal(result.proposal.title, '反客为主')
  assert.equal(provider.calls[0].max_tokens, 2000)
  assert.match(provider.calls[0].messages[1].content, /避免重复/)
}

await assert.rejects(
  () => plotEvolutionAiService.evolvePlot({ outlineContent: '有内容', providers: [] }),
  /Provider/
)

await assert.rejects(
  () => plotEvolutionAiService.evolvePlot({ outlineContent: '', providers: [fakeTextProvider({ content: '[]' })] }),
  /章纲内容为空/
)

await assert.rejects(
  () => plotEvolutionAiService.regenerateProposal({ outlineContent: '有内容' }),
  /Provider/
)

await assert.rejects(
  () =>
    plotEvolutionAiService.regenerateProposal({
      outlineContent: '有内容',
      provider: fakeTextProvider({ content: '只给一段普通文字，没有结构化方案。' })
    }),
  /无法解析为剧情方案/
)

await assert.rejects(
  () =>
    plotEvolutionAiService.regenerateProposal({
      outlineContent: '有内容',
      provider: fakeTextProvider({ content: '' })
    }),
  /返回内容为空/
)

console.log('plot evolution ai tests passed')
