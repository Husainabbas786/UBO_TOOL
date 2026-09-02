import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-slate-800 text-white hover:bg-slate-700 disabled:bg-slate-300 disabled:text-slate-500',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
  danger: 'text-slate-400 hover:bg-rose-50 hover:text-rose-600',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export function TextInput({ invalid = false, className = '', ...props }: TextInputProps) {
  return (
    <input
      className={`w-full rounded-md border px-2.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 ${
        invalid
          ? 'border-rose-400 bg-rose-50 focus-visible:ring-rose-300'
          : 'border-slate-300 bg-white focus-visible:ring-slate-400'
      } ${className}`}
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
  /** Handle on the whole block — the export in the next milestone targets this. */
  sectionRef?: Ref<HTMLElement>
}) {
  return (
    <section ref={sectionRef} className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

/** Inline validation message attached to a row or a company. */
export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-xs text-rose-600">{children}</p>
}
