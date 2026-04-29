import type {
  AccessScopeMode,
  Portfolio,
  PortfolioAccessScope,
  RoleMode,
} from './board'

interface AccessRecordLike {
  email?: string | null
  roleMode: RoleMode
  editorName: string | null
  scopeMode?: AccessScopeMode | null
  scopeAssignments?: PortfolioAccessScope[] | null
}

function normalizeIdentity(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function normalizeBrandNames(brandNames: string[]) {
  return Array.from(
    new Set(
      brandNames
        .map((brandName) => brandName.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right))
}

export function normalizeScopeAssignments(
  assignments: PortfolioAccessScope[] | null | undefined,
): PortfolioAccessScope[] {
  const normalized = new Map<string, Set<string>>()

  ;(assignments ?? []).forEach((assignment) => {
    const portfolioId = assignment.portfolioId?.trim()
    if (!portfolioId) {
      return
    }

    const current = normalized.get(portfolioId) ?? new Set<string>()
    normalizeBrandNames(assignment.brandNames).forEach((brandName) => current.add(brandName))
    normalized.set(portfolioId, current)
  })

  return Array.from(normalized.entries())
    .map(([portfolioId, brandNames]) => ({
      portfolioId,
      brandNames: Array.from(brandNames).sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.portfolioId.localeCompare(right.portfolioId))
}

function getEffectiveScopeMode(access: AccessRecordLike | null) {
  if (!access) {
    return 'all-portfolios' satisfies AccessScopeMode
  }

  return access.scopeMode ?? 'all-portfolios'
}

function getEffectiveScopeAssignments(access: AccessRecordLike | null) {
  return normalizeScopeAssignments(access?.scopeAssignments)
}

function getContributorIdentityNames(
  portfolio: Portfolio,
  access: AccessRecordLike | null,
) {
  if (access?.roleMode !== 'contributor') {
    return new Set<string>()
  }

  const names = new Set<string>()
  const editorName = access.editorName?.trim()
  if (editorName) {
    names.add(editorName)
  }

  const accessEmail = normalizeIdentity(access.email)
  if (accessEmail) {
    portfolio.team.forEach((member) => {
      if (normalizeIdentity(member.accessEmail) === accessEmail) {
        names.add(member.name)
      }
    })
  }

  return names
}

function contributorCanSeeCard(
  portfolio: Portfolio,
  access: AccessRecordLike | null,
  owner: string | null,
) {
  if (!owner) {
    return false
  }

  return getContributorIdentityNames(portfolio, access).has(owner)
}

export function getAccessLevelLabel(roleMode: RoleMode) {
  switch (roleMode) {
    case 'owner':
      return 'Owner'
    case 'manager':
      return 'Manager'
    case 'contributor':
      return 'Contributor'
    case 'viewer':
      return 'Viewer'
  }
}

export function getVisiblePortfolioIds(
  portfolios: Portfolio[],
  access: AccessRecordLike | null,
) {
  if (!access) {
    return portfolios.map((portfolio) => portfolio.id)
  }

  if (access.roleMode === 'contributor') {
    return portfolios
      .filter((portfolio) => portfolio.cards.some((card) => contributorCanSeeCard(portfolio, access, card.owner)))
      .map((portfolio) => portfolio.id)
  }

  const scopeMode = getEffectiveScopeMode(access)
  if (scopeMode === 'all-portfolios') {
    return portfolios.map((portfolio) => portfolio.id)
  }

  const assignments = getEffectiveScopeAssignments(access)
  return portfolios
    .filter((portfolio) => assignments.some((assignment) => assignment.portfolioId === portfolio.id))
    .map((portfolio) => portfolio.id)
}

export function getVisibleBrandNamesForPortfolio(
  portfolio: Portfolio,
  access: AccessRecordLike | null,
) {
  const allBrandNames = portfolio.brands.map((brand) => brand.name)

  if (!access) {
    return allBrandNames
  }

  if (access.roleMode === 'contributor') {
    return Array.from(
      new Set(
        portfolio.cards
          .filter((card) => contributorCanSeeCard(portfolio, access, card.owner))
          .map((card) => card.brand),
      ),
    ).sort((left, right) => left.localeCompare(right))
  }

  const scopeMode = getEffectiveScopeMode(access)
  if (scopeMode === 'all-portfolios') {
    return allBrandNames
  }

  const assignment = getEffectiveScopeAssignments(access).find(
    (item) => item.portfolioId === portfolio.id,
  )
  if (!assignment) {
    return []
  }

  if (scopeMode === 'selected-portfolios') {
    return allBrandNames
  }

  if (assignment.brandNames.length === 0) {
    return allBrandNames
  }

  const allowedBrands = new Set(assignment.brandNames)
  return portfolio.brands
    .map((brand) => brand.name)
    .filter((brandName) => allowedBrands.has(brandName))
}

export function getScopedPortfolio(
  portfolio: Portfolio,
  access: AccessRecordLike | null,
) {
  const visibleBrandNames = new Set(getVisibleBrandNamesForPortfolio(portfolio, access))

  return {
    ...portfolio,
    brands: portfolio.brands.filter((brand) => visibleBrandNames.has(brand.name)),
    cards: portfolio.cards.filter((card) => {
      if (!visibleBrandNames.has(card.brand)) {
        return false
      }

      if (access?.roleMode === 'contributor') {
        return contributorCanSeeCard(portfolio, access, card.owner)
      }

      return true
    }),
  } satisfies Portfolio
}

export function getScopedPortfolios(
  portfolios: Portfolio[],
  access: AccessRecordLike | null,
) {
  const visiblePortfolioIds = new Set(getVisiblePortfolioIds(portfolios, access))
  if (access?.roleMode === 'contributor') {
    const identity = access.editorName?.trim() || normalizeIdentity(access.email) || 'null'
    console.log(
      `[contributor-filter] identity=${identity ?? 'null'} checked=${portfolios.length} matched=${visiblePortfolioIds.size}`,
    )
  }

  return portfolios
    .filter((portfolio) => visiblePortfolioIds.has(portfolio.id))
    .map((portfolio) => getScopedPortfolio(portfolio, access))
}

export function getScopeLabel(
  access: AccessRecordLike,
  portfolios: Portfolio[],
) {
  if (access.roleMode === 'contributor') {
    return 'Assigned cards only'
  }

  const scopeMode = getEffectiveScopeMode(access)
  if (scopeMode === 'all-portfolios') {
    return 'All portfolios'
  }

  if (scopeMode === 'selected-portfolios') {
    const portfolioLabels = getEffectiveScopeAssignments(access)
      .map((assignment) => portfolios.find((item) => item.id === assignment.portfolioId)?.name ?? null)
      .filter((value): value is string => Boolean(value))

    return portfolioLabels.length > 0 ? portfolioLabels.join(' • ') : 'Selected portfolios'
  }

  const scopeLabels = getEffectiveScopeAssignments(access)
    .map((assignment) => {
      const portfolio = portfolios.find((item) => item.id === assignment.portfolioId)
      if (!portfolio) {
        return null
      }

      if (assignment.brandNames.length === 0) {
        return portfolio.name
      }

      const brandLabels = assignment.brandNames.filter((brandName) =>
        portfolio.brands.some((brand) => brand.name === brandName),
      )

      return brandLabels.length > 0
        ? `${portfolio.name} > ${brandLabels.join(', ')}`
        : null
    })
    .filter((value): value is string => Boolean(value))

  return scopeLabels.length > 0 ? scopeLabels.join(' • ') : 'Specific brands'
}

export function getEffectiveAccessSummary(
  access: AccessRecordLike,
  portfolios: Portfolio[],
) {
  switch (access.roleMode) {
    case 'owner':
      {
        const scopeLabel = getScopeLabel(access, portfolios)
        return scopeLabel === 'All portfolios'
          ? 'Can see and manage everything across all portfolios.'
          : `Can see and manage ${scopeLabel}.`
      }
    case 'contributor':
      return access.editorName
        ? `Can work only on cards assigned to ${access.editorName}.`
        : 'Needs a team member before this person can work cards.'
    case 'viewer': {
      const scopeLabel = getScopeLabel(access, portfolios)
      return scopeLabel === 'All portfolios'
        ? 'Can view all portfolios, brands, and products in read-only mode.'
        : `Can view ${scopeLabel} in read-only mode.`
    }
    case 'manager': {
      const scopeLabel = getScopeLabel(access, portfolios)
      return scopeLabel === 'All portfolios'
        ? 'Can manage cards, assignments, and people across all portfolios.'
        : `Can manage cards, assignments, and people in ${scopeLabel}.`
    }
  }
}
