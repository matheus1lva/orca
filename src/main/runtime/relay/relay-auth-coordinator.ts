import type { RelayBrokerStatus } from './relay-session-broker'
import {
  RELAY_RATE_LIMIT_DEFAULT_MS,
  RelayHttpError,
  shouldRetryRelayConnectionError
} from './relay-http-client'

export type RelayAuthIdentity = {
  userId: string
  profileId: string
  organizationId: string
}

export type RelayAuthContext = {
  identity: RelayAuthIdentity
  accessToken: string
  relayEntitled: boolean
}

export type CoordinatedRelayBroker = {
  closeNow(): void
}

type RelayAuthCoordinatorOptions = {
  readContext: () => Promise<RelayAuthContext | null>
  hasDemand?: (context: RelayAuthContext) => boolean
  openBroker: (input: {
    context: RelayAuthContext
    isCurrent: () => boolean
    refreshAccessToken: () => Promise<string | null>
  }) => Promise<CoordinatedRelayBroker>
  onStatus: (status: RelayBrokerStatus) => void
  lingerMs?: number
  random?: () => number
}

type BrokerOwnership = {
  identityKey: string
  broker: CoordinatedRelayBroker | null
  valid: boolean
}

function identityKey(identity: RelayAuthIdentity): string {
  return `${identity.userId}\0${identity.profileId}\0${identity.organizationId}`
}

export class RelayAuthCoordinator {
  // Why: recover brief failures quickly without turning a sustained outage into auth/director load.
  private static readonly RETRY_BASE_MS = 1_000
  private static readonly RETRY_MAX_MS = 5 * 60_000
  private readonly options: RelayAuthCoordinatorOptions
  private authEpoch = 0
  private ownership: BrokerOwnership | null = null
  private readonly pendingOwnerships = new Set<BrokerOwnership>()
  private latestReconcile: Promise<void> = Promise.resolve()
  private lingerTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryAttempt = 0
  private stopped = false
  private lastFailureReason: string | null = null
  // Why: director 429s; regenerate must not reset short backoff and re-hammer assign.
  private rateLimitCooldownUntil = 0

  constructor(options: RelayAuthCoordinatorOptions) {
    this.options = options
  }

  reconcile(): void {
    this.beginReconcile(true)
  }

  private beginReconcile(resetRetry: boolean, expectedIdentityKey?: string): void {
    if (this.stopped) {
      return
    }
    this.cancelRetry()
    if (resetRetry) {
      this.retryAttempt = 0
    }
    const epoch = ++this.authEpoch
    this.invalidatePendingOwnerships()
    const reconcile = this.reconcileEpoch(epoch, expectedIdentityKey)
    this.latestReconcile = reconcile
    void reconcile
  }

  fenceAndCloseNow(): void {
    ++this.authEpoch
    this.cancelLinger()
    this.cancelRetry()
    this.retryAttempt = 0
    this.invalidatePendingOwnerships()
    this.invalidateOwnership()
    this.options.onStatus('offline')
  }

  getActiveBroker(): CoordinatedRelayBroker | null {
    return this.ownership?.valid ? this.ownership.broker : null
  }

  getLastFailureReason(): string | null {
    return this.lastFailureReason
  }

  /**
   * Wait until a broker is active, or reconcile settles without one.
   * When open fails transiently, a background retry is scheduled; pass
   * `maxRetryWaitMs` so callers (pairing) wait for those retries instead of
   * treating the first failure as terminal.
   */
  async waitForActiveBroker(options?: {
    maxRetryWaitMs?: number
  }): Promise<CoordinatedRelayBroker | null> {
    const deadline =
      options?.maxRetryWaitMs != null && options.maxRetryWaitMs > 0
        ? Date.now() + options.maxRetryWaitMs
        : null
    while (!this.stopped) {
      const broker = this.getActiveBroker()
      if (broker) {
        return broker
      }
      const pending = this.latestReconcile
      await pending
      const active = this.getActiveBroker()
      if (active) {
        return active
      }
      if (pending !== this.latestReconcile) {
        continue
      }
      // Why: pairing holds transient demand through this wait; bailing on the
      // first open failure would ignore scheduled retries and degrade to LAN.
      if (this.retryTimer && deadline != null && Date.now() < deadline) {
        await this.waitWhileRetryScheduled(deadline)
        continue
      }
      return null
    }
    return null
  }

  stop(): void {
    this.stopped = true
    this.fenceAndCloseNow()
  }

  private async reconcileEpoch(epoch: number, expectedIdentityKey?: string): Promise<void> {
    let retryIdentityKey: string | undefined
    try {
      const context = await this.options.readContext()
      if (!this.isEpochCurrent(epoch)) {
        return
      }
      if (!context) {
        this.lastFailureReason = 'relay_auth_unavailable'
        this.cancelLinger()
        this.retryAttempt = 0
        this.invalidateOwnership()
        this.options.onStatus('offline')
        return
      }
      if (!context.relayEntitled) {
        this.lastFailureReason = 'relay_not_entitled'
        this.cancelLinger()
        this.retryAttempt = 0
        this.invalidateOwnership()
        this.options.onStatus('offline')
        return
      }
      const nextIdentityKey = identityKey(context.identity)
      if (expectedIdentityKey && nextIdentityKey !== expectedIdentityKey) {
        this.retryAttempt = 0
        this.options.onStatus('offline')
        return
      }
      if (!(this.options.hasDemand?.(context) ?? true)) {
        this.retryAttempt = 0
        if (this.ownership?.valid && this.ownership.identityKey !== nextIdentityKey) {
          this.cancelLinger()
          this.invalidateOwnership()
        } else if (this.ownership?.valid) {
          this.scheduleLinger(context, this.ownership)
        }
        this.options.onStatus('standby')
        return
      }
      this.cancelLinger()
      if (this.ownership?.valid && this.ownership.identityKey === nextIdentityKey) {
        this.retryAttempt = 0
        this.lastFailureReason = null
        this.options.onStatus('registered')
        return
      }
      retryIdentityKey = nextIdentityKey
      const cooldownMs = this.rateLimitCooldownUntil - Date.now()
      if (cooldownMs > 0) {
        this.lastFailureReason = this.lastFailureReason ?? 'relay_assignment_failed_429'
        this.options.onStatus('offline')
        console.warn(
          `[relay] control open deferred rate_limit_cooldown_ms=${Math.ceil(cooldownMs)}`
        )
        this.scheduleRetry(epoch, retryIdentityKey, cooldownMs)
        return
      }
      this.invalidateOwnership()
      this.options.onStatus('connecting')
      const ownership: BrokerOwnership = {
        identityKey: nextIdentityKey,
        broker: null,
        valid: true
      }
      this.pendingOwnerships.add(ownership)
      const isCurrent = (): boolean =>
        ownership.valid &&
        !this.stopped &&
        (ownership.broker ? this.ownership === ownership : this.isEpochCurrent(epoch))
      let broker: CoordinatedRelayBroker
      try {
        broker = await this.options.openBroker({
          context,
          isCurrent,
          refreshAccessToken: () => this.refreshAccessToken(ownership, nextIdentityKey)
        })
      } finally {
        this.pendingOwnerships.delete(ownership)
      }
      ownership.broker = broker
      if (!this.isEpochCurrent(epoch) || !ownership.valid) {
        broker.closeNow()
        return
      }
      this.ownership = ownership
      this.retryAttempt = 0
      this.rateLimitCooldownUntil = 0
      this.lastFailureReason = null
      this.options.onStatus('registered')
    } catch (error) {
      if (this.isEpochCurrent(epoch)) {
        const message = error instanceof Error ? error.message : String(error)
        this.lastFailureReason = message
        console.warn(`[relay] control open failed reason=${message}`)
        this.options.onStatus('offline')
        if (error instanceof RelayHttpError && error.statusCode === 429) {
          const wait = error.retryAfterMs ?? RELAY_RATE_LIMIT_DEFAULT_MS
          this.rateLimitCooldownUntil = Math.max(this.rateLimitCooldownUntil, Date.now() + wait)
        }
        if (shouldRetryRelayConnectionError(error)) {
          this.scheduleRetry(epoch, retryIdentityKey, this.retryDelayMsForError(error))
        }
      }
    }
  }

  private waitWhileRetryScheduled(deadlineMs: number): Promise<void> {
    return new Promise((resolve) => {
      const tick = (): void => {
        if (this.stopped || !this.retryTimer || Date.now() >= deadlineMs) {
          resolve()
          return
        }
        setTimeout(tick, 25)
      }
      tick()
    })
  }

  private retryDelayMsForError(error: unknown): number {
    const random = this.options.random ?? Math.random
    if (error instanceof RelayHttpError && error.statusCode === 429) {
      const floor = Math.max(
        error.retryAfterMs ?? RELAY_RATE_LIMIT_DEFAULT_MS,
        Math.max(0, this.rateLimitCooldownUntil - Date.now())
      )
      // Mild jitter above the floor so concurrent hosts don't stampede.
      const jitter = Math.floor(random() * Math.max(1, floor * 0.25))
      return Math.min(RelayAuthCoordinator.RETRY_MAX_MS, floor + jitter)
    }
    const exponent = Math.min(
      this.retryAttempt,
      Math.ceil(Math.log2(RelayAuthCoordinator.RETRY_MAX_MS / RelayAuthCoordinator.RETRY_BASE_MS))
    )
    const capMs = Math.min(
      RelayAuthCoordinator.RETRY_MAX_MS,
      RelayAuthCoordinator.RETRY_BASE_MS * 2 ** exponent
    )
    return Math.floor(random() * (capMs + 1))
  }

  private scheduleRetry(
    epoch: number,
    expectedIdentityKey?: string,
    delayMsOverride?: number
  ): void {
    if (this.retryTimer || !this.isEpochCurrent(epoch)) {
      return
    }
    const delayMs =
      delayMsOverride != null
        ? Math.min(RelayAuthCoordinator.RETRY_MAX_MS, Math.max(1, delayMsOverride))
        : this.retryDelayMsForError(undefined)
    this.retryAttempt++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.isEpochCurrent(epoch)) {
        // Retry still re-reads entitlement and demand; the timer grants no authority.
        this.beginReconcile(false, expectedIdentityKey)
      }
    }, delayMs)
  }

  private async refreshAccessToken(
    ownership: { valid: boolean },
    expectedIdentityKey: string
  ): Promise<string | null> {
    if (!ownership.valid || this.stopped) {
      return null
    }
    const epoch = this.authEpoch
    const context = await this.options.readContext()
    if (
      !ownership.valid ||
      !this.isEpochCurrent(epoch) ||
      !context?.relayEntitled ||
      identityKey(context.identity) !== expectedIdentityKey
    ) {
      return null
    }
    return context.accessToken
  }

  private invalidateOwnership(): void {
    const ownership = this.ownership
    this.ownership = null
    if (ownership) {
      ownership.valid = false
      ownership.broker?.closeNow()
    }
  }

  private scheduleLinger(context: RelayAuthContext, ownership: BrokerOwnership): void {
    if (this.lingerTimer) {
      return
    }
    const lingerMs = this.options.lingerMs ?? 10 * 60_000
    this.lingerTimer = setTimeout(() => {
      this.lingerTimer = null
      if (
        this.ownership === ownership &&
        ownership.valid &&
        !(this.options.hasDemand?.(context) ?? true)
      ) {
        this.invalidateOwnership()
        this.options.onStatus('standby')
      }
    }, lingerMs)
  }

  private cancelLinger(): void {
    if (this.lingerTimer) {
      clearTimeout(this.lingerTimer)
      this.lingerTimer = null
    }
  }

  private cancelRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  private invalidatePendingOwnerships(): void {
    for (const ownership of this.pendingOwnerships) {
      ownership.valid = false
    }
    this.pendingOwnerships.clear()
  }

  private isEpochCurrent(epoch: number): boolean {
    return !this.stopped && this.authEpoch === epoch
  }
}
