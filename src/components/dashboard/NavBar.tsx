import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const links = [
  { to: '/inventory', label: 'Inventory' },
  { to: '/review', label: 'Review' },
  { to: '/upload', label: 'Upload' },
]

export function NavBar() {
  return (
    <header className="border-b border-border bg-card px-6 py-3 flex items-center gap-6 sticky top-0 z-40">
      <span className="text-sm font-semibold text-foreground">ResellAgent</span>
      <nav className="flex items-center gap-1">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
