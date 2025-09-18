import React from 'react';
import { motion } from 'framer-motion';
import {
  Info,
  AlertCircle,
  AlertTriangle,
  AlertOctagon,
  Shield,
  ShieldAlert,
  ShieldX
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RiskLevel, RISK_LEVELS } from '@shared/types/confirmation';

interface RiskIndicatorProps {
  level: RiskLevel['level'];
  variant?: 'default' | 'compact' | 'minimal';
  showIcon?: boolean;
  showLabel?: boolean;
  showDescription?: boolean;
  animate?: boolean;
  className?: string;
}

const RISK_ICONS = {
  low: Info,
  medium: AlertCircle,
  high: AlertTriangle,
  critical: AlertOctagon
} as const;

const SHIELD_ICONS = {
  low: Shield,
  medium: Shield,
  high: ShieldAlert,
  critical: ShieldX
} as const;

const RISK_ANIMATIONS = {
  low: {
    scale: [1, 1.05, 1] as number[],
    transition: { duration: 0.3, ease: 'easeInOut' }
  },
  medium: {
    scale: [1, 1.08, 1] as number[],
    rotate: [0, 2, -2, 0] as number[],
    transition: { duration: 0.4, ease: 'easeInOut' }
  },
  high: {
    scale: [1, 1.1, 1] as number[],
    rotate: [0, 3, -3, 0] as number[],
    transition: { duration: 0.5, ease: 'easeInOut' }
  },
  critical: {
    scale: [1, 1.15, 1] as number[],
    rotate: [0, 5, -5, 0] as number[],
    y: [0, -2, 0] as number[],
    transition: { duration: 0.6, ease: 'easeInOut', repeat: 2 }
  }
};

export function RiskIndicator({
  level,
  variant = 'default',
  showIcon = true,
  showLabel = true,
  showDescription = false,
  animate = false,
  className
}: RiskIndicatorProps) {
  const riskConfig = RISK_LEVELS[level];
  const Icon = RISK_ICONS[level];
  const ShieldIcon = SHIELD_ICONS[level];

  if (variant === 'minimal') {
    return (
      <motion.div
        className={cn(
          'inline-flex items-center gap-2',
          className
        )}
        initial={animate ? { opacity: 0, scale: 0.8 } : false}
        animate={animate ? { opacity: 1, scale: 1 } : false}
        transition={{ duration: 0.2 }}
      >
        {showIcon && (
          <motion.div
            className={cn(
              'flex items-center justify-center w-4 h-4',
              riskConfig.color.split(' ')[0] // Extract text color
            )}
            animate={animate ? RISK_ANIMATIONS[level] : false}
          >
            <Icon className="w-full h-full" />
          </motion.div>
        )}
        {showLabel && (
          <span className={cn(
            'text-xs font-medium capitalize',
            riskConfig.color.split(' ')[0] // Extract text color
          )}>
            {level} Risk
          </span>
        )}
      </motion.div>
    );
  }

  if (variant === 'compact') {
    return (
      <motion.div
        className={cn(
          'inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium',
          riskConfig.color,
          className
        )}
        initial={animate ? { opacity: 0, y: 4 } : false}
        animate={animate ? { opacity: 1, y: 0 } : false}
        transition={{ duration: 0.2 }}
      >
        {showIcon && (
          <motion.div
            animate={animate ? RISK_ANIMATIONS[level] : false}
          >
            <Icon className="w-3 h-3" />
          </motion.div>
        )}
        {showLabel && (
          <span className="capitalize">{level}</span>
        )}
      </motion.div>
    );
  }

  // Default variant
  return (
    <motion.div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border',
        riskConfig.color,
        className
      )}
      initial={animate ? { opacity: 0, scale: 0.95 } : false}
      animate={animate ? { opacity: 1, scale: 1 } : false}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {showIcon && (
        <motion.div
          className="flex-shrink-0 mt-0.5"
          animate={animate ? RISK_ANIMATIONS[level] : false}
        >
          <div className="relative">
            <ShieldIcon className="w-5 h-5 opacity-20 absolute" />
            <Icon className="w-5 h-5 relative z-10" />
          </div>
        </motion.div>
      )}

      <div className="flex-1 min-w-0">
        {showLabel && (
          <h4 className="text-sm font-semibold capitalize mb-1">
            {level} Risk Level
          </h4>
        )}

        {showDescription && (
          <p className="text-xs opacity-90 leading-relaxed">
            {riskConfig.description}
          </p>
        )}
      </div>
    </motion.div>
  );
}

interface RiskMeterProps {
  level: RiskLevel['level'];
  className?: string;
  animate?: boolean;
}

export function RiskMeter({ level, className, animate = false }: RiskMeterProps) {
  const riskValue = {
    low: 25,
    medium: 50,
    high: 75,
    critical: 100
  }[level];

  const riskConfig = RISK_LEVELS[level];
  const baseColor = riskConfig.color.split(' ')[0]?.replace('text-', '') || 'gray';

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">
          Risk Level
        </span>
        <span className={cn(
          'text-xs font-semibold capitalize',
          riskConfig.color.split(' ')[0]
        )}>
          {level}
        </span>
      </div>

      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={cn(
            'h-full rounded-full',
            `bg-${baseColor.split('-')[0]}-500`
          )}
          initial={animate ? { width: 0 } : { width: `${riskValue}%` }}
          animate={{ width: `${riskValue}%` }}
          transition={{
            duration: animate ? 0.8 : 0,
            ease: [0.16, 1, 0.3, 1],
            delay: animate ? 0.2 : 0
          }}
        />

        {/* Pulsing effect for high risk */}
        {(level === 'high' || level === 'critical') && animate && (
          <motion.div
            className={cn(
              'absolute inset-0 rounded-full',
              `bg-${baseColor.split('-')[0]}-400`,
              'opacity-50'
            )}
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.5, 0.8, 0.5]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
          />
        )}
      </div>
    </div>
  );
}

interface RiskBadgeProps {
  level: RiskLevel['level'];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function RiskBadge({ level, size = 'md', className }: RiskBadgeProps) {
  const riskConfig = RISK_LEVELS[level];
  const Icon = RISK_ICONS[level];

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-2.5 py-1.5 text-xs',
    lg: 'px-3 py-2 text-sm'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4'
  };

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 font-medium rounded-full',
      riskConfig.color,
      sizeClasses[size],
      className
    )}>
      <Icon className={iconSizes[size]} />
      <span className="capitalize">{level}</span>
    </span>
  );
}