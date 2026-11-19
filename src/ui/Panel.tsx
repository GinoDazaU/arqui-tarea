import type { ReactNode } from 'react'

interface Props {
  title: string
  icon?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function Panel({ title, icon, actions, className = '', children }: Props) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <h2>
          {icon}
          {title}
        </h2>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}
