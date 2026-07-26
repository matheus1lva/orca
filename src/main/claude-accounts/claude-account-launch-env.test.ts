import { describe, expect, it } from 'vitest'
import { expandClaudeAccountLaunchEnvValue, normalizeClaudeAccountLaunchEnv } from './service'
import { homedir } from 'node:os'
import { join } from 'node:path'

describe('claude account launch env expand', () => {
  it('expands ~ and ~/', () => {
    const home = homedir()
    expect(expandClaudeAccountLaunchEnvValue('~')).toBe(home)
    expect(expandClaudeAccountLaunchEnvValue('~/.claude-work')).toBe(join(home, '.claude-work'))
  })

  it('normalizes map with expansion', () => {
    const home = homedir()
    expect(
      normalizeClaudeAccountLaunchEnv({ CLAUDE_CONFIG_DIR: '~/.claude-tether', FOO: 'bar' })
    ).toEqual({
      CLAUDE_CONFIG_DIR: join(home, '.claude-tether'),
      FOO: 'bar'
    })
  })
})
