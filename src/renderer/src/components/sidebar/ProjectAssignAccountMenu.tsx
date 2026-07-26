import { useEffect, useMemo, useState } from 'react'
import { UserCog } from 'lucide-react'
import type { ClaudeManagedAccountSummary, Project, Repo } from '../../../../shared/types'
import {
  filterClaudeAccountsByRuntime,
  INHERIT_GLOBAL_CLAUDE_ACCOUNT_VALUE,
  isLocalClaudeAccountRepoTarget
} from '@/lib/claude-account-runtime-filter'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useAppStore } from '@/store'
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'

type ProjectAssignAccountMenuProps = {
  project: Project | null | undefined
  repo: Pick<Repo, 'id' | 'path' | 'connectionId' | 'executionHostId'> | null | undefined
}

export function canAssignClaudeAccountToProject(
  project: Project | null | undefined,
  repo: ProjectAssignAccountMenuProps['repo']
): boolean {
  return Boolean(project) && !isWebClientLocation() && isLocalClaudeAccountRepoTarget(repo)
}

export function ProjectAssignAccountMenu({
  project,
  repo
}: ProjectAssignAccountMenuProps): React.JSX.Element | null {
  const updateProject = useAppStore((s) => s.updateProject)
  const [accounts, setAccounts] = useState<ClaudeManagedAccountSummary[]>([])
  const canAssign = canAssignClaudeAccountToProject(project, repo)

  useEffect(() => {
    if (!canAssign) {
      setAccounts([])
      return
    }
    let cancelled = false
    void window.api.claudeAccounts
      .list()
      .then((result) => {
        if (!cancelled) {
          setAccounts(result.accounts)
        }
      })
      .catch(() => {
        // Non-fatal: hide assign when catalog unavailable.
      })
    return () => {
      cancelled = true
    }
  }, [canAssign])

  const filteredAccounts = useMemo(
    () => (canAssign ? filterClaudeAccountsByRuntime(accounts, repo?.path) : []),
    [accounts, canAssign, repo?.path]
  )

  if (!project || !canAssign) {
    return null
  }
  if (filteredAccounts.length === 0 && !project.claudeAccountId) {
    return null
  }

  const value = project.claudeAccountId ?? INHERIT_GLOBAL_CLAUDE_ACCOUNT_VALUE

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <UserCog className="size-3.5" />
        {translate(
          'auto.components.sidebar.ProjectAssignAccountMenu.assignAccount',
          'Assign Account'
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            void updateProject(project.id, {
              claudeAccountId: next === INHERIT_GLOBAL_CLAUDE_ACCOUNT_VALUE ? null : next
            })
          }}
        >
          <DropdownMenuRadioItem value={INHERIT_GLOBAL_CLAUDE_ACCOUNT_VALUE}>
            {translate(
              'auto.components.sidebar.ProjectAssignAccountMenu.inheritGlobal',
              'Inherit global'
            )}
          </DropdownMenuRadioItem>
          {filteredAccounts.map((account) => (
            <DropdownMenuRadioItem key={account.id} value={account.id}>
              <span className="max-w-48 truncate">{account.email}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
