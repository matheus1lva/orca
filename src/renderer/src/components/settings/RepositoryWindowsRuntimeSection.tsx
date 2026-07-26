import type { GlobalSettings, Project, ProjectUpdateArgs, Repo } from '../../../../shared/types'
import { LOCAL_EXECUTION_HOST_ID, getRepoExecutionHostId } from '../../../../shared/execution-host'
import { SearchableSetting } from './SearchableSetting'
import type { SettingsSearchEntry } from './settings-search'
import { matchesSettingsSearch } from './settings-search'
import { ProjectWindowsRuntimeSetting } from './ProjectWindowsRuntimeSetting'
import { ProjectClaudeAccountSetting } from './ProjectClaudeAccountSetting'
import type { ProjectRuntimeSessionSummary } from './repository-runtime-session-summary'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/lib/web-client-location'

type RepositoryWindowsRuntimeSectionProps = {
  repoDisplayName: string
  repo: Pick<Repo, 'path' | 'connectionId' | 'executionHostId'>
  project: Project | null
  settings: Pick<GlobalSettings, 'localWindowsRuntimeDefault'> | null
  isLocalWindowsProject: boolean
  wslAvailable: boolean
  wslDistros: string[]
  wslCapabilitiesLoading: boolean
  runtimeSessionSummary?: ProjectRuntimeSessionSummary
  updateProject?: (
    projectId: string,
    updates: ProjectUpdateArgs['updates']
  ) => void | Promise<unknown>
  forceVisible: boolean
  searchQuery: string
  searchEntries: SettingsSearchEntry[]
}

export function RepositoryWindowsRuntimeSection({
  repoDisplayName,
  repo,
  project,
  settings,
  isLocalWindowsProject,
  wslAvailable,
  wslDistros,
  wslCapabilitiesLoading,
  runtimeSessionSummary,
  updateProject,
  forceVisible,
  searchQuery,
  searchEntries
}: RepositoryWindowsRuntimeSectionProps): React.JSX.Element | null {
  if (!settings || !project || !updateProject) {
    return null
  }

  const isLocalProject = getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
  const showRuntime = isLocalWindowsProject
  const showClaudeAccount = isLocalProject && !isWebClientLocation()
  if (!showRuntime && !showClaudeAccount) {
    return null
  }

  return (
    <>
      {showRuntime ? (
        <SearchableSetting
          title={translate(
            'auto.components.settings.RepositoryPane.projectRuntime',
            'Project Runtime'
          )}
          description={translate(
            'auto.components.settings.RepositoryPane.projectRuntimeDescription',
            'Choose whether this project runs on Windows or WSL.'
          )}
          keywords={[
            repoDisplayName,
            'runtime',
            'execution',
            'windows host',
            'wsl',
            'distro',
            'agent runtime',
            'skill runtime'
          ]}
          className="space-y-3"
          forceVisible={forceVisible || matchesSettingsSearch(searchQuery, searchEntries)}
        >
          <ProjectWindowsRuntimeSetting
            project={project}
            settings={settings}
            isLocalWindowsProject={isLocalWindowsProject}
            wslAvailable={wslAvailable}
            wslDistros={wslDistros}
            wslCapabilitiesLoading={wslCapabilitiesLoading}
            runtimeSessionSummary={runtimeSessionSummary}
            updateProject={updateProject}
          />
        </SearchableSetting>
      ) : null}

      {showClaudeAccount ? (
        <SearchableSetting
          title={translate(
            'auto.components.settings.RepositoryPane.projectClaudeAccount',
            'Default Claude Account'
          )}
          description={translate(
            'auto.components.settings.RepositoryPane.projectClaudeAccountDescription',
            'Claude account for workspaces in this project that do not pin their own.'
          )}
          keywords={[
            repoDisplayName,
            'claude',
            'account',
            'default account',
            'managed account',
            'assign account'
          ]}
          className="space-y-3"
          forceVisible={forceVisible || matchesSettingsSearch(searchQuery, searchEntries)}
        >
          <ProjectClaudeAccountSetting
            project={project}
            repoPath={repo.path}
            isLocalProject={isLocalProject}
            updateProject={updateProject}
          />
        </SearchableSetting>
      ) : null}
    </>
  )
}
