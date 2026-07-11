import { postJson } from './webHttpClient.js'

function requirePlotEvolutionSuccess(result, fallback) {
  if (result?.success !== true) {
    throw new Error(result?.message || result?.error || fallback)
  }
  return result
}

function hasProposalContent(proposal = {}) {
  return Boolean(String(proposal.title || proposal.summary || '').trim())
}

function requirePlotEvolutionGroups(result, fallback) {
  const ok = requirePlotEvolutionSuccess(result, fallback)
  if (!Array.isArray(ok.groups)) {
    throw new Error('剧情推演失败：接口返回格式不正确')
  }
  const groups = ok.groups
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      proposals: Array.isArray(group?.proposals) ? group.proposals.filter(hasProposalContent) : []
    }))
    .filter((group) => !group.error && group.proposals.length > 0)

  if (!visibleGroups.length) {
    const failedGroup = groups.find((group) => group?.error)
    throw new Error(failedGroup?.error || fallback)
  }

  return visibleGroups
}

function requirePlotEvolutionProposal(result, fallback) {
  const ok = requirePlotEvolutionSuccess(result, fallback)
  if (!hasProposalContent(ok.proposal)) {
    throw new Error(ok?.message || ok?.error || fallback)
  }
  return ok.proposal
}

export async function evolvePlot(payload, fallback) {
  return requirePlotEvolutionGroups(
    await postJson('/api/plot-evolution/evolve', payload, { timeoutMs: 120_000 }),
    fallback
  )
}

export async function regeneratePlotProposal(payload, fallback) {
  return requirePlotEvolutionProposal(
    await postJson('/api/plot-evolution/regenerate', payload, { timeoutMs: 120_000 }),
    fallback
  )
}
