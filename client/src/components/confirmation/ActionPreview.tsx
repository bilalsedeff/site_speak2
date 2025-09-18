import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  ArrowRight,
  Diff,
  Clock,
  MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { ConfirmationAction } from '@shared/types/confirmation';

interface ActionPreviewProps {
  action: ConfirmationAction;
  showDiff?: boolean;
  compact?: boolean;
  className?: string;
}

interface StatePreviewProps {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  title: string;
  showDiff: boolean;
}

function StatePreview({ before, after, title, showDiff }: StatePreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!before && !after) {return null;}

  const hasChanges = before && after && JSON.stringify(before) !== JSON.stringify(after);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted/80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Diff className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
          {hasChanges && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded-full">
              Changes detected
            </span>
          )}
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4">
              {showDiff && before && after ? (
                <DiffView before={before} after={after} />
              ) : (
                <div className="grid gap-4">
                  {before && (
                    <StateCard
                      title="Current State"
                      data={before}
                      variant="before"
                    />
                  )}
                  {after && (
                    <StateCard
                      title="After Action"
                      data={after}
                      variant="after"
                    />
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface StateCardProps {
  title: string;
  data: Record<string, unknown>;
  variant: 'before' | 'after';
}

function StateCard({ title, data, variant }: StateCardProps) {
  const [showRaw, setShowRaw] = useState(false);

  const variantStyles = {
    before: 'border-blue-200 bg-blue-50',
    after: 'border-green-200 bg-green-50'
  };

  return (
    <div className={cn(
      'border rounded-lg overflow-hidden',
      variantStyles[variant]
    )}>
      <div className="flex items-center justify-between p-3 border-b border-current/20">
        <h4 className="text-sm font-medium">{title}</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowRaw(!showRaw)}
          className="h-6 px-2 text-xs"
        >
          {showRaw ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showRaw ? 'Simple' : 'Raw'}
        </Button>
      </div>

      <div className="p-3">
        {showRaw ? (
          <pre className="text-xs bg-background/50 p-2 rounded border overflow-x-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        ) : (
          <div className="space-y-2">
            {Object.entries(data).map(([key, value]) => (
              <div key={key} className="flex justify-between text-xs">
                <span className="font-medium text-muted-foreground">{key}:</span>
                <span className="text-right max-w-[60%] truncate">
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface DiffViewProps {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

function DiffView({ before, after }: DiffViewProps) {
  const changes = findChanges(before, after);

  return (
    <div className="space-y-3">
      {changes.map((change, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg border text-sm',
            change.type === 'added' && 'border-green-200 bg-green-50',
            change.type === 'removed' && 'border-red-200 bg-red-50',
            change.type === 'changed' && 'border-amber-200 bg-amber-50'
          )}
        >
          <div className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            change.type === 'added' && 'bg-green-500',
            change.type === 'removed' && 'bg-red-500',
            change.type === 'changed' && 'bg-amber-500'
          )} />

          <div className="flex-1 min-w-0">
            <div className="font-medium">{change.path}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              {change.type === 'changed' && (
                <>
                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                    -{String(change.oldValue)}
                  </span>
                  <ArrowRight className="w-3 h-3" />
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                    +{String(change.newValue)}
                  </span>
                </>
              )}
              {change.type === 'added' && (
                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                  +{String(change.newValue)}
                </span>
              )}
              {change.type === 'removed' && (
                <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                  -{String(change.oldValue)}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function findChanges(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Array<{
    type: 'added' | 'removed' | 'changed';
    path: string;
    oldValue?: unknown;
    newValue?: unknown;
  }> = [];

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const beforeValue = before[key];
    const afterValue = after[key];

    if (!(key in before)) {
      changes.push({
        type: 'added',
        path: key,
        newValue: afterValue
      });
    } else if (!(key in after)) {
      changes.push({
        type: 'removed',
        path: key,
        oldValue: beforeValue
      });
    } else if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes.push({
        type: 'changed',
        path: key,
        oldValue: beforeValue,
        newValue: afterValue
      });
    }
  }

  return changes;
}

export function ActionPreview({
  action,
  showDiff = true,
  compact = false,
  className
}: ActionPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);

  const hasPreviewData = action.beforeState || action.afterState;
  const estimatedTime = action.estimatedDuration ? Math.round(action.estimatedDuration / 1000) : null;

  if (!hasPreviewData && compact) {
    return (
      <div className={cn(
        'flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-dashed',
        className
      )}>
        <MapPin className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          No preview available for this action
        </span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Action summary */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-sm font-medium mb-1">Action Preview</h3>
          <p className="text-xs text-muted-foreground">
            Review the changes that will be made to{' '}
            <span className="font-medium text-foreground">
              {action.context.targetName}
            </span>
          </p>
        </div>

        {estimatedTime && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>~{estimatedTime}s</span>
          </div>
        )}
      </div>

      {/* Dependencies warning */}
      {action.context.dependencies && action.context.dependencies.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-amber-50 border border-amber-200 rounded-lg"
        >
          <h4 className="text-sm font-medium text-amber-800 mb-1">
            Dependencies Affected
          </h4>
          <div className="flex flex-wrap gap-1">
            {action.context.dependencies.map((dep, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded"
              >
                {dep}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* State preview */}
      {hasPreviewData && (
        <StatePreview
          {...(action.beforeState !== undefined && { before: action.beforeState })}
          {...(action.afterState !== undefined && { after: action.afterState })}
          title="State Changes"
          showDiff={showDiff}
        />
      )}

      {/* Expand/collapse for compact mode */}
      {compact && hasPreviewData && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full justify-center gap-2"
        >
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
          {isExpanded ? 'Show Less' : 'Show More'}
        </Button>
      )}
    </div>
  );
}