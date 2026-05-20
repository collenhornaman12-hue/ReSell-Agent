import * as React from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, children, ...props }, ref) => (
    <div className="flex items-center gap-2">
      {label && (
        <label className="text-xs text-muted-foreground uppercase tracking-wide whitespace-nowrap">
          {label}
        </label>
      )}
      <select
        ref={ref}
        className={cn(
          'flex h-8 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
)
Select.displayName = 'Select'

export { Select }
