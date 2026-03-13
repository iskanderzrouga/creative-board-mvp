import type { ReactNode, RefObject } from 'react'
import { SearchIcon, XIcon } from './icons/AppIcons'

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
            <SearchIcon className="search-icon" />
            <input
              ref={searchRef}
              className="search-input"
              value={searchValue}
              aria-label="Search cards"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search cards..."
            />
            {searchValue ? (
              <button
                type="button"
                className="search-clear"
                aria-label="Clear card search"
                onClick={onSearchClear}
              >
                <XIcon />
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
