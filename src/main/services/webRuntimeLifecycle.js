import {
  closeAllAgentTaskQueues,
  stopAcceptingAgentTaskJobs
} from './agentTaskQueueService.js'
import { stopAgentTaskProgressServer } from './agentTaskProgressWebSocket.js'

let registered = false
let shuttingDown = false
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIG' + 'TERM']

export function registerWebRuntimeLifecycle(options = {}) {
  if (registered) return { success: true, reused: true }
  registered = true

  const onShutdown = async (signalName) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[web-api] received ${signalName}, graceful shutdown...`)
    try {
      await stopAcceptingAgentTaskJobs()
      await closeAllAgentTaskQueues(options.queue || {})
      await stopAgentTaskProgressServer({
        ...(options.progressServer || {}),
        closeQueueProgress: true
      })
      if (typeof options.onAfterClose === 'function') {
        await options.onAfterClose(signalName)
      }
      console.log('[web-api] graceful shutdown complete')
    } catch (error) {
      console.error('[web-api] graceful shutdown failed:', error?.message || error)
    }
  }

  for (const signalName of SHUTDOWN_SIGNALS) {
    process.once(signalName, () => {
      onShutdown(signalName).finally(() => {
        setTimeout(() => process.exit(0), 50).unref?.()
      })
    })
  }

  return { success: true, reused: false }
}

export default {
  registerWebRuntimeLifecycle
}
