import { describe, it, expect } from 'vitest'
import { LLMRouter } from '../../src/core/llm/router'

describe('LLMRouter', () => {
  it('creates router and returns fast/strong clients', () => {
    const router = new LLMRouter({
      provider: 'openrouter',
      api_key: 'test-key',
      fast_model: 'test/fast',
      strong_model: 'test/strong'
    })
    expect(router.fast()).toBeDefined()
    expect(router.strong()).toBeDefined()
  })
})
