import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  Clock,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { ConfirmationAction, ConfirmationResponse, RISK_LEVELS } from '@shared/types/confirmation';

interface ConfirmationDialogProps {
  action: ConfirmationAction | null;
  isOpen: boolean;
  onConfirm: (response: ConfirmationResponse) => void;
  onCancel: () => void;
  className?: string;
  showVoicePrompt?: boolean;
  voiceTimeout?: number;
}

const RISK_ICONS = {
  low: Info,
  medium: AlertCircle,
  high: AlertTriangle,
  critical: AlertOctagon
} as const;

const ANIMATION_VARIANTS = {
  overlay: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  },
  content: {
    initial: { scale: 0.96, opacity: 0, y: 8 },
    animate: { scale: 1, opacity: 1, y: 0 },
    exit: { scale: 0.96, opacity: 0, y: 8 }
  }
};

export function ConfirmationDialog({
  action,
  isOpen,
  onConfirm,
  onCancel,
  className,
  showVoicePrompt = false,
  voiceTimeout = 5000
}: ConfirmationDialogProps) {
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize timeout when dialog opens
  useEffect(() => {
    if (isOpen && action && voiceTimeout > 0) {
      setTimeRemaining(voiceTimeout);
      const interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev === null || prev <= 100) {
            clearInterval(interval);
            return null;
          }
          return prev - 100;
        });
      }, 100);

      return () => clearInterval(interval);
    }
    return undefined;
  }, [isOpen, action, voiceTimeout]);

  // Reset input when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setConfirmationInput('');
      setIsProcessing(false);
    }
  }, [isOpen]);

  const handleConfirm = useCallback(async () => {
    if (!action) {return;}

    setIsProcessing(true);

    const response: ConfirmationResponse = {
      action: 'confirm',
      method: 'visual',
      timestamp: Date.now(),
      ...(action.confirmationPhrase && confirmationInput && { customInput: confirmationInput })
    };

    // Validate phrase-based confirmation
    if (action.confirmationPhrase && confirmationInput.toLowerCase() !== action.confirmationPhrase.toLowerCase()) {
      setIsProcessing(false);
      return;
    }

    onConfirm(response);
  }, [action, confirmationInput, onConfirm]);

  const handleCancel = useCallback(() => {
    setIsProcessing(false);
    onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isProcessing) {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  }, [handleConfirm, handleCancel, isProcessing]);

  if (!action) {return null;}

  const riskConfig = RISK_LEVELS[action.riskLevel];
  const RiskIcon = RISK_ICONS[action.riskLevel];
  const timeoutProgress = timeRemaining ? (timeRemaining / voiceTimeout) * 100 : 0;
  const requiresPhrase = action.riskLevel === 'critical' && !!action.confirmationPhrase;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                variants={ANIMATION_VARIANTS.overlay}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                className={cn(
                  "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
                  "w-full max-w-md max-h-[85vh] overflow-hidden",
                  "bg-background border border-border rounded-xl shadow-2xl",
                  "focus:outline-none",
                  className
                )}
                variants={ANIMATION_VARIANTS.content}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                onKeyDown={handleKeyDown}
              >
                {/* Header with risk indicator */}
                <div className={cn(
                  "flex items-center gap-3 p-6 border-b border-border",
                  riskConfig.color
                )}>
                  <div className="flex-shrink-0">
                    <RiskIcon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Dialog.Title className="text-lg font-semibold text-foreground truncate">
                      {action.title}
                    </Dialog.Title>
                    <p className="text-sm opacity-80 mt-1">
                      {riskConfig.description}
                    </p>
                  </div>
                  <Dialog.Close asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0 h-8 w-8"
                      onClick={handleCancel}
                    >
                      <X className="w-4 h-4" />
                      <span className="sr-only">Close</span>
                    </Button>
                  </Dialog.Close>
                </div>

                {/* Voice timeout indicator */}
                {showVoicePrompt && timeRemaining && (
                  <div className="px-6 pt-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <Clock className="w-4 h-4" />
                      <span>Voice confirmation available</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1">
                      <motion.div
                        className="h-1 bg-primary rounded-full"
                        initial={{ width: '100%' }}
                        animate={{ width: `${timeoutProgress}%` }}
                        transition={{ duration: 0.1, ease: 'linear' }}
                      />
                    </div>
                  </div>
                )}

                {/* Content */}
                <div className="p-6 space-y-4">
                  <Dialog.Description className="text-sm text-muted-foreground leading-relaxed">
                    {action.description}
                  </Dialog.Description>

                  {/* Warnings */}
                  {action.warnings && action.warnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-amber-800 mb-2">
                        Important Warnings:
                      </h4>
                      <ul className="text-sm text-amber-700 space-y-1">
                        {action.warnings.map((warning, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">•</span>
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Target information */}
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Target:</span>
                        <p className="font-medium truncate">{action.context.targetName}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <p className="font-medium capitalize">{action.context.targetType}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Impact:</span>
                        <p className="font-medium capitalize">{action.context.estimatedImpact}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Recoverable:</span>
                        <p className="font-medium">
                          {action.context.recoverable ? 'Yes' : 'No'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Recovery instructions */}
                  {action.recoveryInstructions && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-blue-800 mb-2">
                        Recovery Information:
                      </h4>
                      <p className="text-sm text-blue-700">
                        {action.recoveryInstructions}
                      </p>
                    </div>
                  )}

                  {/* Phrase confirmation for critical actions */}
                  {requiresPhrase && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">
                        To confirm this critical action, please type:
                        <code className="ml-2 px-2 py-1 bg-muted rounded text-xs font-mono">
                          {action.confirmationPhrase}
                        </code>
                      </p>
                      <input
                        type="text"
                        value={confirmationInput}
                        onChange={(e) => setConfirmationInput(e.target.value)}
                        placeholder="Type confirmation phrase..."
                        className="w-full px-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isProcessing}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant={action.riskLevel === 'critical' ? 'destructive' : 'default'}
                    onClick={handleConfirm}
                    disabled={
                      isProcessing ||
                      Boolean(requiresPhrase && action.confirmationPhrase && confirmationInput.toLowerCase() !== action.confirmationPhrase.toLowerCase())
                    }
                    className="min-w-[100px]"
                  >
                    {isProcessing ? (
                      <motion.div
                        className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                    ) : (
                      'Confirm'
                    )}
                  </Button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}