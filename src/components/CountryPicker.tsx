import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { PartyType } from '../engine'
import { resolveRisk, searchCountries } from '../risk/countryRisk'
import { RiskChip } from './RiskChip'

interface CountryPickerProps {
  /** A canonical country name, or '' for none. */
  value: string
  onChange: (country: string) => void
  /** "Nationality" for a person, "Country of incorporation" for anything else. */
  placeholder: string
  ariaLabel: string
  /** Who the country is for: the list's top tier reads differently for each. */
  partyType: PartyType
  /** Off until the party has a name: a country belongs to a party, not a row. */
  disabled?: boolean
  className?: string
}

/**
 * A compact type-ahead over Compliance's country list.
 *
 * Only canonical names can be stored. Typing filters the list — by substring,
 * and by common short forms like "UAE" — but whatever is typed and not picked
 * is thrown away on blur, so a party can never end up with a country the risk
 * list does not know. Optional: blank is always fine.
 */
export function CountryPicker({
  value,
  onChange,
  placeholder,
  ariaLabel,
  partyType,
  disabled = false,
  className = 'w-[10rem]',
}: CountryPickerProps) {
  const listId = useId()
  /** What the agent has typed; null while they are not typing. */
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const options = useMemo(() => searchCountries(query ?? ''), [query])

  // Opening on an existing value lands on it, so the list starts where you are.
  useEffect(() => {
    if (!open) return
    const index = query === null && value !== '' ? options.indexOf(value) : 0
    setActive(Math.max(0, index))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options])

  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const close = () => {
    setOpen(false)
    setQuery(null)
  }

  const choose = (country: string) => {
    onChange(country)
    close()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => Math.min(options.length - 1, Math.max(0, current + step)))
    } else if (event.key === 'Enter') {
      if (!open) return
      event.preventDefault()
      const picked = options[active]
      if (picked) choose(picked)
    } else if (event.key === 'Escape') {
      if (open) event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      close()
    }
  }

  const activeId = open && options[active] ? `${listId}-${active}` : undefined
  const rating = resolveRisk(value, partyType)

  return (
    <div className={`relative shrink-0 ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        title={value || undefined}
        placeholder={placeholder}
        value={query ?? value}
        onFocus={(event) => {
          event.currentTarget.select()
          setOpen(true)
        }}
        onBlur={close}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        className={`w-full truncate rounded-input border border-fieldBorder bg-field py-2 pl-2.5 text-body text-ink placeholder:text-muted focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deepTeal disabled:cursor-not-allowed disabled:opacity-60 ${
          value !== '' && !disabled ? 'pr-7' : 'pr-2.5'
        } ${rating && rating !== 'Low' && query === null ? 'font-medium' : ''}`}
      />
      {value !== '' && !disabled ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Clear ${ariaLabel.toLowerCase()}`}
          title="Clear"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose('')}
          className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-pill text-base leading-none text-muted hover:bg-gapTint hover:text-coral"
        >
          ×
        </button>
      ) : null}

      {open && !disabled ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 top-full z-30 mt-1 max-h-64 w-[17rem] overflow-y-auto rounded-input border border-fieldBorder bg-white py-1 shadow-lg"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-small text-muted">No country matches.</li>
          ) : (
            options.map((country, index) => (
              <li
                key={country}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(country)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-small ${
                  index === active ? 'bg-deepTeal-t10 text-navy' : 'text-ink'
                } ${country === value ? 'font-semibold' : ''}`}
              >
                <span>{country}</span>
                <RiskChip rating={resolveRisk(country, partyType)} />
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
