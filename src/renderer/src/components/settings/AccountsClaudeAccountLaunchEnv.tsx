import { useId, useState } from 'react'
import type { ClaudeManagedAccountSummary, ClaudeRateLimitAccountsState } from '../../../../shared/types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  parseAgentDefaultEnvDraft,
  stringifyAgentDefaultEnvDraft
} from './agent-default-env-draft'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type AccountsClaudeAccountLaunchEnvProps = {
  account: ClaudeManagedAccountSummary
  disabled?: boolean
  onUpdated: (next: ClaudeRateLimitAccountsState) => void
}

export function AccountsClaudeAccountLaunchEnv({
  account,
  disabled = false,
  onUpdated
}: AccountsClaudeAccountLaunchEnvProps): React.JSX.Element {
  const stored = account.launchEnv ?? {}
  const draftSeed = stringifyAgentDefaultEnvDraft(stored)
  const [envDraft, setEnvDraft] = useState(draftSeed)
  const [seed, setSeed] = useState(draftSeed)
  const [envDraftTooLarge, setEnvDraftTooLarge] = useState(false)
  const [saving, setSaving] = useState(false)
  const envDraftErrorId = useId()

  if (seed !== draftSeed) {
    setSeed(draftSeed)
    setEnvDraft(draftSeed)
    setEnvDraftTooLarge(false)
  }

  const commitEnv = async (): Promise<void> => {
    const parsed = parseAgentDefaultEnvDraft(envDraft)
    setEnvDraftTooLarge(parsed.tooLarge)
    if (parsed.tooLarge || disabled || saving) {
      return
    }
    const nextText = stringifyAgentDefaultEnvDraft(parsed.env)
    if (nextText === draftSeed) {
      return
    }
    setSaving(true)
    try {
      const next = await window.api.claudeAccounts.setLaunchEnv({
        accountId: account.id,
        launchEnv: Object.keys(parsed.env).length === 0 ? null : parsed.env
      })
      onUpdated(next as ClaudeRateLimitAccountsState)
    } catch {
      // Non-fatal: leave draft for retry.
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 flex w-full flex-col gap-1 border-t border-border/50 pt-2">
      <span className="text-[11px] text-muted-foreground">
        {translate(
          'auto.components.settings.AccountsClaudeAccountLaunchEnv.label',
          'Launch env (KEY=value)'
        )}
      </span>
      <div className="flex items-center gap-2">
        <Input
          value={envDraft}
          disabled={disabled || saving}
          onChange={(event) => {
            setEnvDraft(event.target.value)
            if (envDraftTooLarge) {
              setEnvDraftTooLarge(false)
            }
          }}
          onBlur={() => {
            void commitEnv()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void commitEnv()
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              setEnvDraft(draftSeed)
              setEnvDraftTooLarge(false)
              event.currentTarget.blur()
            }
          }}
          placeholder={translate(
            'auto.components.settings.AccountsClaudeAccountLaunchEnv.placeholder',
            'MY_SKILLS_DIR=/path OTHER=value'
          )}
          spellCheck={false}
          aria-invalid={envDraftTooLarge || undefined}
          aria-describedby={envDraftTooLarge ? envDraftErrorId : undefined}
          className={cn(
            'h-7 flex-1 font-mono text-[11px]',
            envDraftTooLarge && 'border-destructive/50 bg-destructive/5'
          )}
        />
        {draftSeed.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled || saving}
            onClick={() => {
              setEnvDraft('')
              void (async () => {
                setSaving(true)
                try {
                  const next = await window.api.claudeAccounts.setLaunchEnv({
                    accountId: account.id,
                    launchEnv: null
                  })
                  onUpdated(next as ClaudeRateLimitAccountsState)
                } finally {
                  setSaving(false)
                }
              })()
            }}
            className="h-7 shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {translate('auto.components.settings.AccountsClaudeAccountLaunchEnv.clear', 'Clear')}
          </Button>
        ) : null}
      </div>
      {envDraftTooLarge ? (
        <p id={envDraftErrorId} className="text-[11px] text-destructive">
          {translate(
            'auto.components.settings.AccountsClaudeAccountLaunchEnv.tooLarge',
            'Environment text is too large to parse safely.'
          )}
        </p>
      ) : null}
    </div>
  )
}
