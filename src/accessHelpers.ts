import type {
  AccessScopeMode,
  Portfolio,
  PortfolioAccessScope,
  RoleMode,
} from './board'

interface AccessRecordLike {
  roleMode: RoleMode
  editorName: string | null
  scopeMode?: AccessScopeMode | null
  scopeAssignments?: PortfolioAccessScope[] | null
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

function getContributorIdentity(access: AccessRecordLike | null) {
  return access?.editorName?.trim() || null
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
  if (!access || access.roleMode === 'owner') {
    return portfolios.map((portfolio) => portfolio.id)
  }

  if (access.roleMode === 'contributor') {
    const identity = getContributorIdentity(access)
    if (!identity) {
      return []
    }

    return portfolios
      .filter((portfolio) => portfolio.cards.some((card) => card.owner === identity))
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

  if (!access || access.roleMode === 'owner') {
    return allBrandNames
  }

  if (access.roleMode === 'contributor') {
    const identity = getContributorIdentity(access)
    if (!identity) {
      return []
    }

    return Array.from(
      new Set(
        portfolio.cards
          .filter((card) => card.owner === identity)
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
  const contributorIdentity = access?.roleMode === 'contributor' ? getContributorIdentity(access) : null

  return {
    ...portfolio,
    brands: portfolio.brands.filter((brand) => visibleBrandNames.has(brand.name)),
    cards: portfolio.cards.filter((card) => {
      if (!visibleBrandNames.has(card.brand)) {
        return false
      }

      if (access?.roleMode === 'contributor') {
        return contributorIdentity !== null && card.owner === contributorIdentity
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

  return portfolios
    .filter((portfolio) => visiblePortfolioIds.has(portfolio.id))
    .map((portfolio) => getScopedPortfolio(portfolio, access))
}

export function getScopeLabel(
  access: AccessRecordLike,
  portfolios: Portfolio[],
) {
  if (access.roleMode === 'owner') {
    return 'All portfolios'
  }

  if (access.roleMode === 'contributor') {
    return 'Own cards only'
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

      const brandLabels = assignment.brandNames.filter((brandName) =>
        portfolio.brands.some((brand) => brand.name === brandName),
      )

      return brandLabels.length > 0
        ? `${portfolio.name} > ${brandLabels.join(', ')}`
        : null
    })
    .filter((value): value is string => Boolean(value))

  return scopeLabels.length > 0 ? scopeLabels.join(' • ') : 'Selected brands'
}

export function getEffectiveAccessSummary(
  access: AccessRecordLike,
  portfolios: Portfolio[],
) {
  switch (access.roleMode) {
    case 'owner':
      return 'Can see and manage all portfolios, brands, products, settings, people, and access.'
    case 'contributor':
      return access.editorName
        ? `Can work only on cards assigned to ${access.editorName}.`
        : 'Needs a teammate profile before this person can work cards.'
    case 'viewer': {
      const scopeLabel = getScopeLabel(access, portfolios)
      return scopeLabel === 'All portfolios'
        ? 'Can view all portfolios, brands, and products in read-only mode.'
        : `Can view ${scopeLabel} in read-only mode.`
    }
    case 'manager': {
      const scopeLabel = getScopeLabel(access, portfolios)
      return scopeLabel === 'All portfolios'
        ? 'Can manage cards, assignments, and people across all portfolios, brands, and products.'
        : `Can manage cards, assignments, and people in ${scopeLabel}.`
    }
  }
}
