import type { Project, WorktreeMeta } from '../../shared/types'
import {
  getSelectedClaudeAccountIdForTarget,
  type ClaudeAccountSelectionTarget
} from './runtime-selection'
import type { GlobalSettings } from '../../shared/types'

export type ClaudeAccountOverrideStore = {
  getWorktreeMeta(worktreeId: string): WorktreeMeta | undefined
  getProjects(): readonly Project[]
  getSettings?(): Pick<
    GlobalSettings,
    'activeClaudeManagedAccountId' | 'activeClaudeManagedAccountIdsByRuntime'
  >
}

/** Drop pin when it equals the runtime global selection (use shared ~/.claude). */
export function collapseClaudeAccountOverrideIfGlobal(
  overrideAccountId: string | undefined,
  settings:
    | Pick<
        GlobalSettings,
        'activeClaudeManagedAccountId' | 'activeClaudeManagedAccountIdsByRuntime'
      >
    | undefined,
  baseTarget: ClaudeAccountSelectionTarget
): string | undefined {
  if (!overrideAccountId || !settings) {
    return overrideAccountId
  }
  const globalSelectedId = getSelectedClaudeAccountIdForTarget(settings, baseTarget)
  return globalSelectedId === overrideAccountId ? undefined : overrideAccountId
}

function nonEmptyAccountId(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Prefer meta.projectId; else first project that lists repoId in sourceRepoIds. */
export function resolveProjectIdForWorktree(
  store: ClaudeAccountOverrideStore,
  worktreeId: string,
  repoId?: string | null
): string | undefined {
  const metaProjectId = store.getWorktreeMeta(worktreeId)?.projectId
  if (typeof metaProjectId === 'string' && metaProjectId.length > 0) {
    return metaProjectId
  }
  if (typeof repoId !== 'string' || repoId.length === 0) {
    return undefined
  }
  return store.getProjects().find((project) => project.sourceRepoIds.includes(repoId))?.id
}

/**
 * Worktree pin → project default → undefined (caller uses global selection).
 * Spawn-time inherit: null/unset worktree pin picks up project.claudeAccountId.
 */
export function resolveClaudeAccountOverrideForWorktree(
  store: ClaudeAccountOverrideStore,
  worktreeId: string | undefined,
  repoId?: string | null
): string | undefined {
  if (typeof worktreeId !== 'string' || worktreeId.length === 0) {
    return undefined
  }
  const meta = store.getWorktreeMeta(worktreeId)
  const worktreePin = nonEmptyAccountId(meta?.claudeAccountId)
  if (worktreePin) {
    return worktreePin
  }
  const projectId = resolveProjectIdForWorktree(store, worktreeId, repoId)
  if (!projectId) {
    return undefined
  }
  const project = store.getProjects().find((entry) => entry.id === projectId)
  return nonEmptyAccountId(project?.claudeAccountId)
}
