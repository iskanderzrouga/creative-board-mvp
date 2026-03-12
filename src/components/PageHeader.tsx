import type { ReactNode, RefObject } from 'react'

interface PageHeaderProps {
  title: string
  searchValue?: string
  searchCountLabel?: string
  onSearchChange?: (value: string) => void
  onSearchClear?: () => void
  searchRef?: RefObject<HTMLInputElement | null>
  rightContent?: ReactNode
}

export function PageHeader({
  title,
  searchValue,
  searchCountLabel,
  onSearchChange,
  onSearchClear,
  searchRef,
  rightContent,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
      </div>
      <div className="page-header-actions">
        {searchValue !== undefined && onSearchChange ? (
          <div className="search-shell">
            <input
              ref={searchRef}
              className="search-input"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search cards..."
            />
            {searchValue ? (
              <button type="button" className="search-clear" onClick={onSearchClear}>
                ×
              </button>
            ) : null}
            {searchValue && searchCountLabel ? (
              <span className="search-summary-pill">{searchCountLabel}</span>
            ) : null}
          </div>
        ) : null}
        {rightContent}
      </div>
    </div>
  )
}
