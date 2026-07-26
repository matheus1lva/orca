import { describe, expect, it } from 'vitest'
import type { Project, WorktreeMeta } from '../../shared/types'
import {
  collapseClaudeAccountOverrideIfGlobal,
  resolveClaudeAccountOverrideForWorktree,
  resolveProjectIdForWorktree
} from './worktree-claude-account-override'

function makeStore(args: {
  meta?: Record<string, Partial<WorktreeMeta>>
  projects?: Project[]
}) {
  const meta = args.meta ?? {}
  const projects = args.projects ?? []
  return {
    getWorktreeMeta(worktreeId: string): WorktreeMeta | undefined {
      const entry = meta[worktreeId]
      return entry as WorktreeMeta | undefined
    },
    getProjects() {
      return projects
    }
  }
}

function makeProject(
  overrides: Partial<Project> & Pick<Project, 'id' | 'sourceRepoIds'>
): Project {
  return {
    displayName: overrides.displayName ?? overrides.id,
    badgeColor: '#000',
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('resolveClaudeAccountOverrideForWorktree', () => {
  it('prefers worktree pin over project default', () => {
    const store = makeStore({
      meta: {
        'repo-1::/wt': { claudeAccountId: 'acct-wt', projectId: 'proj-1' }
      },
      projects: [makeProject({ id: 'proj-1', sourceRepoIds: ['repo-1'], claudeAccountId: 'acct-proj' })]
    })
    expect(resolveClaudeAccountOverrideForWorktree(store, 'repo-1::/wt', 'repo-1')).toBe('acct-wt')
  })

  it('uses project default when worktree pin is null/unset', () => {
    const store = makeStore({
      meta: {
        'repo-1::/wt': { claudeAccountId: null, projectId: 'proj-1' }
      },
      projects: [makeProject({ id: 'proj-1', sourceRepoIds: ['repo-1'], claudeAccountId: 'acct-proj' })]
    })
    expect(resolveClaudeAccountOverrideForWorktree(store, 'repo-1::/wt', 'repo-1')).toBe(
      'acct-proj'
    )
  })

  it('falls back to project via sourceRepoIds when meta.projectId missing', () => {
    const store = makeStore({
      meta: {
        'repo-1::/wt': {}
      },
      projects: [makeProject({ id: 'proj-1', sourceRepoIds: ['repo-1'], claudeAccountId: 'acct-proj' })]
    })
    expect(resolveClaudeAccountOverrideForWorktree(store, 'repo-1::/wt', 'repo-1')).toBe(
      'acct-proj'
    )
  })

  it('returns undefined when neither worktree nor project is pinned', () => {
    const store = makeStore({
      meta: {
        'repo-1::/wt': { projectId: 'proj-1' }
      },
      projects: [makeProject({ id: 'proj-1', sourceRepoIds: ['repo-1'] })]
    })
    expect(resolveClaudeAccountOverrideForWorktree(store, 'repo-1::/wt', 'repo-1')).toBeUndefined()
  })

  it('returns undefined without worktree id', () => {
    const store = makeStore({
      projects: [makeProject({ id: 'proj-1', sourceRepoIds: ['repo-1'], claudeAccountId: 'acct-proj' })]
    })
    expect(resolveClaudeAccountOverrideForWorktree(store, undefined, 'repo-1')).toBeUndefined()
  })
})

describe('resolveProjectIdForWorktree', () => {
  it('prefers meta.projectId', () => {
    const store = makeStore({
      meta: { 'repo-1::/wt': { projectId: 'proj-meta' } },
      projects: [makeProject({ id: 'proj-src', sourceRepoIds: ['repo-1'] })]
    })
    expect(resolveProjectIdForWorktree(store, 'repo-1::/wt', 'repo-1')).toBe('proj-meta')
  })
})

describe('collapseClaudeAccountOverrideIfGlobal', () => {
  it('clears pin when it matches host global selection', () => {
    expect(
      collapseClaudeAccountOverrideIfGlobal(
        'acct-a',
        {
          activeClaudeManagedAccountId: 'acct-a',
          activeClaudeManagedAccountIdsByRuntime: { host: 'acct-a', wsl: {} }
        },
        { runtime: 'host' }
      )
    ).toBeUndefined()
  })

  it('keeps pin when it differs from global', () => {
    expect(
      collapseClaudeAccountOverrideIfGlobal(
        'acct-pinned',
        {
          activeClaudeManagedAccountId: 'acct-global',
          activeClaudeManagedAccountIdsByRuntime: { host: 'acct-global', wsl: {} }
        },
        { runtime: 'host' }
      )
    ).toBe('acct-pinned')
  })
})
