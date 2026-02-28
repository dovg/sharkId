import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Sidebar } from './Sidebar'

interface BreadcrumbItem {
  label: string
  to: string
}

interface PageLayoutProps {
  title: string
  subtitle?: string
  breadcrumb?: BreadcrumbItem[]
  breadcrumbCurrent?: string
  actions?: ReactNode
  children: ReactNode
}

export function PageLayout({ title, subtitle, breadcrumb, breadcrumbCurrent, actions, children }: PageLayoutProps) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="page-header">
          <div>
            {breadcrumb && breadcrumb.length > 0 && (
              <div className="breadcrumb">
                {breadcrumb.map((b, i) => (
                  <span key={i}>
                    <Link to={b.to}>{b.label}</Link>
                    {' / '}
                  </span>
                ))}
                {breadcrumbCurrent ?? title}
              </div>
            )}
            <h1 className="page-title">{title}</h1>
            {subtitle && <div className="page-subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="page-header-actions">{actions}</div>}
        </div>
        <div className="page-body">
          {children}
        </div>
      </div>
    </div>
  )
}
