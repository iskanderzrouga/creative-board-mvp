import { useId, useMemo, useRef, useState } from 'react'
import {
  getCardTitleLabel,
  getIterationSourceCards,
  getTaskTypeById,
  getTaskTypeGroups,
  isIterationTaskTypeId,
  shouldUseCreativeCreationFlow,
  type GlobalSettings,
  type Portfolio,
  type QuickCreateInput,
} from '../board'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import { XIcon } from './icons/AppIcons'

interface QuickCreateModalProps {
  portfolio: Portfolio
  settings: GlobalSettings
  value: QuickCreateInput
  onChange: (updates: Partial<QuickCreateInput>) => void
  onClose: () => void
  onCreate: () => void
}

export function QuickCreateModal({
  portfolio,
  settings,
  value,
  onChange,
  onClose,
  onCreate,
}: QuickCreateModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const [step, setStep] = useState(1)
  useModalAccessibility(modalRef, true)

  const selectedBrand = portfolio.brands.find((brand) => brand.name === value.brand) ?? null
  const taskType = getTaskTypeById(settings, value.taskTypeId)
  const creativeFlow = shouldUseCreativeCreationFlow(taskType.id)
  const iterationFlow = isIterationTaskTypeId(taskType.id)
  const sourceCards = useMemo(
    () =>
      getIterationSourceCards(
        portfolio,
        settings,
        value.brand,
        value.product ?? selectedBrand?.products[0] ?? '',
      ),
    [portfolio, selectedBrand?.products, settings, value.brand, value.product],
  )
  const selectedSourceCard =
    sourceCards.find((card) => card.id === value.sourceCardId) ?? null
  const canAdvanceFromStepOne = Boolean(
    value.brand &&
      value.taskTypeId &&
      ((selectedBrand?.products.length ?? 0) === 0 || value.product),
  )
  const finalTitle = iterationFlow ? selectedSourceCard?.title ?? '' : value.title.trim()
  const canCreate = iterationFlow ? Boolean(selectedSourceCard) : Boolean(finalTitle)

  function handleBrandChange(nextBrandName: string) {
    const nextBrand = portfolio.brands.find((brand) => brand.name === nextBrandName) ?? null
    onChange({
      brand: nextBrandName,
      product: nextBrand?.products[0] ?? '',
      sourceCardId: null,
    })
  }

  function handleTaskTypeChange(nextTaskTypeId: string) {
    const nextTaskType = getTaskTypeById(settings, nextTaskTypeId)
    onChange({
      taskTypeId: nextTaskTypeId,
      angle: shouldUseCreativeCreationFlow(nextTaskType.id) ? value.angle ?? '' : '',
      sourceCardId: isIterationTaskTypeId(nextTaskType.id) ? value.sourceCardId ?? null : null,
    })
  }

  function renderStepTwo() {
    if (iterationFlow) {
      return (
        <label className="quick-create-field full-width">
          <span>Source card</span>
          <select
            autoFocus
            value={value.sourceCardId ?? ''}
            onChange={(event) => onChange({ sourceCardId: event.target.value || null })}
          >
            <option value="">Select source card</option>
            {sourceCards.map((card) => (
              <option key={card.id} value={card.id}>
                {`${card.id} · ${card.title}`}
              </option>
            ))}
          </select>
        </label>
      )
    }

    return (
      <>
        <label className="quick-create-field full-width">
          <span>{getCardTitleLabel(taskType.id)}</span>
          <input
            autoFocus
            value={value.title}
            onChange={(event) => onChange({ title: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canCreate) {
                event.preventDefault()
                onCreate()
              }
            }}
          />
        </label>

        {creativeFlow ? (
          <label className="quick-create-field full-width">
            <span>Angle / Theme</span>
            <input
              value={value.angle ?? ''}
              onChange={(event) => onChange({ angle: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canCreate) {
                  event.preventDefault()
                  onCreate()
                }
              }}
            />
          </label>
        ) : null}
      </>
    )
  }

  return (
    <>
      <div className="modal-overlay" aria-hidden="true" onClick={onClose} />
      <div
        ref={modalRef}
        className="quick-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="quick-create-head">
          <div>
            <h2 id={titleId}>New Card</h2>
            <p className="muted-copy">
              {step === 1 ? 'Step 1 of 3' : 'Step 2 of 3 · Step 3 opens the full card'}
            </p>
          </div>
          <button
            type="button"
            className="close-icon-button"
            aria-label="Close new card dialog"
            onClick={onClose}
          >
            <XIcon />
          </button>
        </div>

        {step === 1 ? (
          <>
            <label className="quick-create-field full-width">
              <span>Brand</span>
              <select
                autoFocus
                value={value.brand}
                onChange={(event) => handleBrandChange(event.target.value)}
              >
                {portfolio.brands.map((brand) => (
                  <option key={brand.name} value={brand.name}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="quick-create-field full-width">
              <span>Product</span>
              <select
                value={value.product ?? ''}
                onChange={(event) => onChange({ product: event.target.value, sourceCardId: null })}
              >
                {(selectedBrand?.products ?? []).length === 0 ? (
                  <option value="">No products yet</option>
                ) : (
                  (selectedBrand?.products ?? []).map((product) => (
                    <option key={product} value={product}>
                      {product}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="quick-create-field full-width">
              <span>Task type</span>
              <select
                value={value.taskTypeId}
                onChange={(event) => handleTaskTypeChange(event.target.value)}
              >
                {getTaskTypeGroups(settings).map((group) => (
                  <optgroup key={group.category} label={group.category}>
                    {group.items.map((option) => (
                      <option key={option.id} value={option.id}>
                        {`${option.icon} ${option.name}`}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </>
        ) : (
          renderStepTwo()
        )}

        <div className="quick-create-actions">
          {step === 1 ? (
            <button
              type="button"
              className="primary-button"
              disabled={!canAdvanceFromStepOne}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          ) : (
            <>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!canCreate}
                onClick={onCreate}
              >
                Create card
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
