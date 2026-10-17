// Adapter tests do not construct host tools or access credentials.
import { registerHooks } from 'node:module'
const stubs = new Set(['@deepseek-ai/dsh-credentials', '@deepseek-ai/dsh-tools'])
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (stubs.has(specifier)) return { url: `data:text/javascript,${encodeURIComponent('export const credentialRef = () => { throw new Error("unexpected credential access") }; export const defineTool = () => { throw new Error("unexpected host tool construction") };')}`, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})
