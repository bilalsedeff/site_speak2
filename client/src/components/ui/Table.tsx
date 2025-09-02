import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './Button'
import { MoreHorizontal } from 'lucide-react'

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  density?: 'comfortable' | 'compact'
}

/**
 * Table components following UI/UX guidelines:
 * - Zebra rows for easier scanning
 * - Sticky header for long lists
 * - Density toggle support
 * - Row actions visible on focus/hover
 */
const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, density = 'comfortable', ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn(
          'data-table',
          density === 'comfortable' ? 'density-comfortable' : 'density-compact',
          className
        )}
        {...props}
      />
    </div>
  )
)
Table.displayName = 'Table'

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('', className)} {...props} />
))
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
))
TableBody.displayName = 'TableBody'

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
      className
    )}
    {...props}
  />
))
TableFooter.displayName = 'TableFooter'

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  actions?: React.ReactNode
  onActionClick?: () => void
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, actions, onActionClick, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b transition-colors',
        'hover:bg-muted/50 data-[state=selected]:bg-muted',
        'group', // For styling child elements on row hover
        className
      )}
      {...props}
    >
      {props.children}
      {actions && (
        <TableCell className="w-[50px] p-0">
          <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onActionClick}
              aria-label="Row actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      )}
    </tr>
  )
)
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & {
    sortable?: boolean
    sortDirection?: 'asc' | 'desc' | null
    onSort?: () => void
  }
>(({ className, sortable, sortDirection, onSort, children, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-10 px-2 text-left align-middle font-medium text-muted-foreground',
      '[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
      'bg-muted/50 border-b border-border sticky top-0 z-10',
      sortable && 'cursor-pointer hover:text-foreground',
      className
    )}
    onClick={sortable ? onSort : undefined}
    {...props}
  >
    {sortable ? (
      <div className="flex items-center space-x-2">
        <span>{children}</span>
        {sortDirection && (
          <span className="text-xs" aria-hidden="true">
            {sortDirection === 'asc' ? '↑' : '↓'}
          </span>
        )}
      </div>
    ) : (
      children
    )}
  </th>
))
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
      className
    )}
    {...props}
  />
))
TableCell.displayName = 'TableCell'

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-sm text-muted-foreground', className)}
    {...props}
  />
))
TableCaption.displayName = 'TableCaption'

/**
 * Table toolbar for density controls and other actions
 */
interface TableToolbarProps {
  title?: string
  description?: string
  density?: 'comfortable' | 'compact'
  onDensityChange?: (density: 'comfortable' | 'compact') => void
  actions?: React.ReactNode
  className?: string
}

const TableToolbar: React.FC<TableToolbarProps> = ({
  title,
  description,
  density = 'comfortable',
  onDensityChange,
  actions,
  className,
}) => {
  return (
    <div className={cn('flex items-center justify-between py-4', className)}>
      <div className="flex-1 min-w-0">
        {title && (
          <h3 className="text-lg font-semibold max-heading-width">
            {title}
          </h3>
        )}
        {description && (
          <p className="text-sm text-muted-foreground max-reading-width">
            {description}
          </p>
        )}
      </div>
      
      <div className="flex items-center space-x-2">
        {onDensityChange && (
          <div className="flex items-center space-x-1">
            <Button
              variant={density === 'comfortable' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onDensityChange('comfortable')}
              className="text-xs"
            >
              Comfortable
            </Button>
            <Button
              variant={density === 'compact' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onDensityChange('compact')}
              className="text-xs"
            >
              Compact
            </Button>
          </div>
        )}
        
        {actions}
      </div>
    </div>
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableToolbar,
}