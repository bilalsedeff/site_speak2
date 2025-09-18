import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  Check,
  X,
  Pause,
  Play,
  AlertTriangle,
  List,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { MultiStepAction, ConfirmationResponse } from '@shared/types/confirmation';
import { ConfirmationDialog } from './ConfirmationDialog';
import { RiskIndicator } from './RiskIndicator';
import { ActionPreview } from './ActionPreview';

interface MultiStepConfirmationProps {
  multiStepAction: MultiStepAction;
  isOpen: boolean;
  onStepConfirm: (stepIndex: number, response: ConfirmationResponse) => void;
  onComplete: () => void;
  onCancel: () => void;
  onPause: () => void;
  className?: string;
}

interface StepStatus {
  status: 'pending' | 'confirmed' | 'skipped' | 'cancelled';
  response?: ConfirmationResponse;
  timestamp?: number;
}

export function MultiStepConfirmation({
  multiStepAction,
  isOpen,
  onStepConfirm,
  onComplete,
  onCancel,
  onPause,
  className
}: MultiStepConfirmationProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(multiStepAction.currentStep);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(
    multiStepAction.steps.map(() => ({ status: 'pending' }))
  );
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showBatchOptions, setShowBatchOptions] = useState(false);

  // Update current step when prop changes
  useEffect(() => {
    setCurrentStepIndex(multiStepAction.currentStep);
  }, [multiStepAction.currentStep]);

  // Auto-advance to next step if not allowing step skipping
  useEffect(() => {
    if (!multiStepAction.allowStepSkipping && currentStepIndex < multiStepAction.steps.length - 1) {
      const currentStatus = stepStatuses[currentStepIndex];
      if (currentStatus?.status === 'confirmed') {
        const timer = setTimeout(() => {
          setCurrentStepIndex(prev => Math.min(prev + 1, multiStepAction.steps.length - 1));
          setShowStepDialog(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [stepStatuses, currentStepIndex, multiStepAction.allowStepSkipping, multiStepAction.steps.length]);

  const handleStepResponse = useCallback((response: ConfirmationResponse) => {
    const stepIndex = currentStepIndex;

    setStepStatuses(prev => {
      const newStatuses = [...prev];
      newStatuses[stepIndex] = {
        status: response.action === 'confirm' ? 'confirmed' : 'cancelled',
        response,
        timestamp: Date.now()
      };
      return newStatuses;
    });

    onStepConfirm(stepIndex, response);

    if (response.action === 'cancel') {
      onCancel();
      return;
    }

    // Check if all steps are complete
    const allStepsComplete = stepStatuses.every((status, index) =>
      index === stepIndex || status.status === 'confirmed' || status.status === 'skipped'
    );

    if (allStepsComplete && stepIndex === multiStepAction.steps.length - 1) {
      onComplete();
    } else if (stepIndex < multiStepAction.steps.length - 1) {
      if (multiStepAction.allowStepSkipping) {
        setCurrentStepIndex(prev => prev + 1);
      }
    }

    setShowStepDialog(false);
  }, [currentStepIndex, stepStatuses, onStepConfirm, onCancel, onComplete, multiStepAction.steps.length, multiStepAction.allowStepSkipping]);

  const handleStepNavigation = useCallback((stepIndex: number) => {
    if (!multiStepAction.allowStepSkipping) {return;}

    setCurrentStepIndex(stepIndex);
    setShowStepDialog(true);
  }, [multiStepAction.allowStepSkipping]);

  const handleSkipStep = useCallback(() => {
    if (!multiStepAction.allowStepSkipping) {return;}

    setStepStatuses(prev => {
      const newStatuses = [...prev];
      newStatuses[currentStepIndex] = {
        status: 'skipped',
        timestamp: Date.now()
      };
      return newStatuses;
    });

    if (currentStepIndex < multiStepAction.steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      onComplete();
    }

    setShowStepDialog(false);
  }, [currentStepIndex, multiStepAction.allowStepSkipping, multiStepAction.steps.length, onComplete]);

  const handleBatchConfirm = useCallback(() => {
    if (!multiStepAction.allowBatchConfirmation) {return;}

    const batchResponse: ConfirmationResponse = {
      action: 'confirm',
      method: 'visual',
      timestamp: Date.now()
    };

    // Confirm all remaining steps
    setStepStatuses(prev =>
      prev.map((status, index) =>
        index >= currentStepIndex && status.status === 'pending'
          ? { status: 'confirmed' as const, response: batchResponse, timestamp: Date.now() }
          : status
      )
    );

    // Notify for all remaining steps
    for (let i = currentStepIndex; i < multiStepAction.steps.length; i++) {
      if (stepStatuses[i]?.status === 'pending') {
        onStepConfirm(i, batchResponse);
      }
    }

    onComplete();
    setShowStepDialog(false);
    setShowBatchOptions(false);
  }, [currentStepIndex, multiStepAction.allowBatchConfirmation, multiStepAction.steps.length, stepStatuses, onStepConfirm, onComplete]);

  const handlePause = useCallback(() => {
    setIsPaused(!isPaused);
    onPause();
  }, [isPaused, onPause]);

  const currentStep = multiStepAction.steps[currentStepIndex];
  const completedSteps = stepStatuses.filter(status => status.status === 'confirmed' || status.status === 'skipped').length;
  const progressPercentage = (completedSteps / multiStepAction.steps.length) * 100;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
              'w-full max-w-2xl max-h-[90vh] overflow-hidden',
              'bg-background border border-border rounded-xl shadow-2xl',
              className
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex-1">
                <h2 className="text-xl font-semibold">{multiStepAction.title}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {multiStepAction.description}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onCancel}
                className="flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Progress indicator */}
            <div className="px-6 py-4 bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">
                  Step {currentStepIndex + 1} of {multiStepAction.steps.length}
                </span>
                <span className="text-sm text-muted-foreground">
                  {completedSteps} completed
                </span>
              </div>

              <div className="w-full bg-muted rounded-full h-2 mb-3">
                <motion.div
                  className="h-2 bg-primary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Step indicators */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {multiStepAction.steps.map((step, index) => (
                  <motion.button
                    key={step.id}
                    onClick={() => handleStepNavigation(index)}
                    disabled={!multiStepAction.allowStepSkipping}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium',
                      'transition-colors whitespace-nowrap',
                      index === currentStepIndex && 'bg-primary text-primary-foreground',
                      index !== currentStepIndex && stepStatuses[index]?.status === 'confirmed' && 'bg-green-100 text-green-700',
                      index !== currentStepIndex && stepStatuses[index]?.status === 'skipped' && 'bg-amber-100 text-amber-700',
                      index !== currentStepIndex && stepStatuses[index]?.status === 'pending' && 'bg-muted text-muted-foreground',
                      multiStepAction.allowStepSkipping && 'cursor-pointer hover:bg-accent',
                      !multiStepAction.allowStepSkipping && 'cursor-default'
                    )}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    {stepStatuses[index]?.status === 'confirmed' && <CheckCircle2 className="w-3 h-3" />}
                    {stepStatuses[index]?.status === 'skipped' && <ChevronRight className="w-3 h-3" />}
                    {stepStatuses[index]?.status === 'pending' && <div className="w-3 h-3 rounded-full border-2 border-current" />}
                    <span>{index + 1}</span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Current step content */}
            <div className="p-6 max-h-[400px] overflow-y-auto">
              {currentStep && (
                <motion.div
                  key={currentStepIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <RiskIndicator
                      level={currentStep.riskLevel}
                      variant="compact"
                      animate
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold">{currentStep.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {currentStep.description}
                      </p>
                    </div>
                  </div>

                  <ActionPreview
                    action={currentStep}
                    compact
                    className="mt-4"
                  />

                  {currentStep.warnings && currentStep.warnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="text-sm font-medium text-amber-800">Warnings:</h4>
                          <ul className="text-sm text-amber-700 mt-1 space-y-1">
                            {currentStep.warnings.map((warning, index) => (
                              <li key={index}>• {warning}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-6 border-t border-border">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePause}
                  className="gap-2"
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  {isPaused ? 'Resume' : 'Pause'}
                </Button>

                {multiStepAction.allowBatchConfirmation && currentStepIndex < multiStepAction.steps.length - 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBatchOptions(!showBatchOptions)}
                    className="gap-2"
                  >
                    <List className="w-4 h-4" />
                    Batch
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={onCancel}
                >
                  Cancel All
                </Button>

                {multiStepAction.allowStepSkipping && (
                  <Button
                    variant="outline"
                    onClick={handleSkipStep}
                  >
                    Skip Step
                  </Button>
                )}

                <Button
                  onClick={() => setShowStepDialog(true)}
                  disabled={isPaused}
                >
                  Confirm Step
                </Button>
              </div>
            </div>

            {/* Batch confirmation options */}
            <AnimatePresence>
              {showBatchOptions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-border overflow-hidden"
                >
                  <div className="p-4 bg-muted/30">
                    <h4 className="text-sm font-medium mb-3">Batch Confirmation Options</h4>
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        onClick={handleBatchConfirm}
                        className="gap-2"
                      >
                        <Check className="w-4 h-4" />
                        Confirm All Remaining
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowBatchOptions(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      This will confirm all remaining steps without individual prompts.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Individual step confirmation dialog */}
          {currentStep && (
            <ConfirmationDialog
              action={currentStep}
              isOpen={showStepDialog}
              onConfirm={handleStepResponse}
              onCancel={() => setShowStepDialog(false)}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}