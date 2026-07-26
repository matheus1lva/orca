import { useMemo } from 'react'
import type { ClaudeManagedAccountSummary, Project, ProjectUpdateArgs } from '../../../../shared/types'
import {
  filterClaudeAccountsByRuntime,
  INHERIT_GLOBAL_CLAUDE_ACCOUNT_VALUE,
  isLocalClaudeAccountRepoTarget
} from '@/lib/claude-account-runtime-filter'
import { useComposerClaudeAccounts } from '@/hooks/use-composer-claude-accounts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { SettingsRow } from './SettingsFormControls'
import { translate } from '@/i18n/i18n'

type ProjectClaudeAccountSettingProps = {
  project: Project | null
  repoPath: string | null | undefined
  isLocalProject: boolean
  updateProject: (
    projectId: string,
    updates: ProjectUpdateArgs['updates']
  ) => void | Promise<unknown>
}

export function ProjectClaudeAccountSetting({
  project,
  repoPath,
  isLocalProject,
  updateProject
}: ProjectClaudeAccountSettingProps): React.JSX.Element | null {
  const enabled = Boolean(project && isLocalProject)
  const accounts = useComposerClaudeAccounts(enabled)
  const filteredAccounts = useMemo(
    () => (enabled ? filterClaudeAccountsByRuntime(accounts, repoPath) : []),
    [accounts, enabled, repoPath]
  )

  if (!project || !isLocalProject) {
    return null
  }
  if (filteredAccounts.length === 0 && !project.claudeAccountId) {
    return null
  }

  const value = project.claudeAccountId ?? INHERIT_GLOBAL_CLAUDE_ACCOUNT_VALUE

  return (
    <SettingsRow
      label={translate(
        'auto.components.settings.ProjectClaudeAccountSetting.defaultClaudeAccount',
        'Default Claude account'
      )}
      description={translate(
        'auto.components.settings.ProjectClaudeAccountSetting.defaultClaudeAccountHelp',
        'Used by workspaces in this project that do not pin their own account.'
      )}
      control={
        <Select
          value={value}
          onValueChange={(next) => {
            void updateProject(project.id, {
              claudeAccountId: next === INHERIT_GLOBAL_CLAUDE_ACCOUNT_VALUE ? null : next
            })
          }}
        >
          <SelectTrigger className="h-9 w-full min-w-[12rem] max-w-sm border-input text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT_GLOBAL_CLAUDE_ACCOUNT_VALUE}>
              {translate(
                'auto.components.settings.ProjectClaudeAccountSetting.inheritGlobal',
                'Inherit global'
              )}
            </SelectItem>
            {filteredAccounts.map((account: ClaudeManagedAccountSummary) => (
              <SelectItem key={account.id} value={account.id}>
                {account.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  )
}

export function canShowProjectClaudeAccountSetting(args: {
  project: Project | null | undefined
  repo: Parameters<typeof isLocalClaudeAccountRepoTarget>[0]
  isPairedWebClient: boolean
}): boolean {
  return (
    Boolean(args.project) &&
    !args.isPairedWebClient &&
    isLocalClaudeAccountRepoTarget(args.repo)
  )
}
