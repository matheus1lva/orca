import {
  SUPPORTED_GLOBAL_SKILL_TOPOLOGIES,
  type SkillFreshnessInstallation,
  type SkillFreshnessInventory
} from '../../../shared/skill-freshness'

export type SkillFreshnessDisplayStatus =
  | 'installed'
  | 'up-to-date'
  | 'update-available'
  | 'needs-attention'

// Why: incomplete plugin/repo scans invent inaccessible rows for every official
// skill name as a conservative poison. When a real current copy already exists,
// that poison is not actionable drift and must not amber-badge healthy installs.
const SCAN_LIMIT_ERROR_CATEGORIES = new Set([
  'plugin-cache-scan-incomplete',
  'repository-scan-limit'
])

function isScanLimitPoison(installation: SkillFreshnessInstallation): boolean {
  return (
    installation.status === 'inaccessible' &&
    installation.errorCategory != null &&
    SCAN_LIMIT_ERROR_CATEGORIES.has(installation.errorCategory)
  )
}

function materialInstallations(
  inventory: SkillFreshnessInventory | null,
  skillName: string
): SkillFreshnessInstallation[] {
  return (inventory?.installations ?? []).filter(
    (installation) => installation.name === skillName && !isScanLimitPoison(installation)
  )
}

export function getSkillFreshnessDisplayStatus(
  inventory: SkillFreshnessInventory | null,
  skillName: string
): SkillFreshnessDisplayStatus {
  if (inventory?.eligibleUpdateNames.includes(skillName)) {
    return 'update-available'
  }

  const installations = materialInstallations(inventory, skillName)
  let hasPlacement = false
  let hasBlockedCopy = false
  for (const installation of installations) {
    hasPlacement = true
    if (installation.status !== 'current') {
      hasBlockedCopy = true
    }
  }
  // Why: with no scan yet (or nothing found) the only honest answer is presence.
  // Reporting attention here would flash amber on every launch before the first scan.
  if (!hasPlacement) {
    return 'installed'
  }
  // Why: no eligible update is not proof a copy is fine — it can equally mean a copy
  // is out of date somewhere the update command cannot reach. Saying "Installed" there
  // reads as all-clear and hides real drift, so that case gets its own attention state.
  return hasBlockedCopy ? 'needs-attention' : 'up-to-date'
}

/**
 * Whether a copy needs the user's own hands — it is not current, and running the update
 * would not resolve it. This is what marks the review affordance as carrying a problem
 * rather than a routine update, so the badge can stay a badge and the dialog explains.
 */
export function hasSkillCopyNeedingAttention(
  inventory: SkillFreshnessInventory | null,
  skillName: string
): boolean {
  return materialInstallations(inventory, skillName).some(
    (installation) =>
      installation.status !== 'current' &&
      // Why: an out-of-date copy the command converges is ordinary work, not a problem.
      !(
        SUPPORTED_GLOBAL_SKILL_TOPOLOGIES.has(installation.topology) &&
        installation.status === 'outdated'
      )
  )
}
