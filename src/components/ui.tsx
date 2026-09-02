import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react'

/**
 * Buttons are pills, per the web-elements section of BRAND.md. Only buttons —
 * inputs stay at a 6px radius.
 */
type ButtonVariant = 'primary' | 'green' | 'secondary' | 'quiet' | 'danger'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  // Teal → navy gradient, white SemiBold text.
  primary:
    'bg-gradient-to-r from-deepTeal to-navy text-white shadow-sm hover:brightness-110 disabled:bg-none disabled:bg-disabled disabled:text-muted disabled:shadow-none',
  // The main call to action. Dark green leads so white text keeps AA contrast.
  green:
    'bg-gradient-to-r from-darkGreen to-mfzGreen text-white shadow-sm hover:brightness-110 disabled:bg-none disabled:bg-disabled disabled:text-muted disabled:shadow-none',
  secondary:
    'bg-white text-deepTeal border-[1.5px] border-deepTeal hover:bg-deepTeal-t10 disabled:border-disabled disabled:text-muted',
  quiet: 'text-navy hover:bg-field disabled:text-disabled',
  danger: 'text-muted hover:bg-gapTint hover:text-coral',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-pill px-4 py-2 text-cta font-semibold transition-[filter,background-color,color] disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

/** Light fill, 1px border, 6px radius, teal focus ring. */
export function TextInput({ invalid = false, className = '', ...props }: TextInputProps) {
  return (
    <input
      className={`w-full rounded-input border px-2.5 py-2 text-body text-ink placeholder:text-muted focus:outline-none focus-visible:outline-none focus-visible:ring-2 ${
        invalid
          ? 'border-coral bg-gapTint focus-visible:ring-coral'
          : 'border-fieldBorder bg-field focus-visible:ring-deepTeal'
      } ${className}`}
      {...props}
    />
  )
}

/** Field label: above the field, Medium, navy. */
export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-h4 font-medium text-navy">
      {children}
    </label>
  )
}

export function Select({ className = '', ...props }: InputHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-input border border-fieldBorder bg-field px-2.5 py-2 text-body text-ink focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-deepTeal ${className}`}
      {...props}
    />
  )
}

export function Card({ title, description, children, actions, sectionRef }: {
  title: string
  description?: string
  children: ReactNode
  /** Controls shown on the right of the header, e.g. the download buttons. */
  actions?: ReactNode
  /** Handle on the whole block — the PNG/PDF export targets this element. */
  sectionRef?: Ref<HTMLElement>
}) {
  return (
    <section ref={sectionRef} className="rounded-card border border-line bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-6 py-4">
        <div>
          <h2 className="text-cardTitle font-semibold text-mfzBlue">{title}</h2>
          {description ? <p className="mt-1 text-body text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className="p-6">{children}</div>
    </section>
  )
}

/** Inline validation message attached to a row or a company. */
export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-small text-coral">{children}</p>
}
