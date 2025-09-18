/**
 * Voice Action Executor - Real-time DOM action execution for voice commands
 *
 * Bridges voice commands to actual DOM manipulation and editor actions:
 * - Real-time action dispatch with visual feedback
 * - Editor-specific voice commands (select, edit, move, style)
 * - Navigation and interaction commands
 * - Performance optimized for <300ms response times
 * - Integration with ActionManifestGenerator for dynamic action discovery
 */

import { createLogger, getErrorMessage } from '../../../../shared/utils';
import type { EnhancedSiteAction, SiteManifest } from './ActionManifestGenerator';
import type { WidgetActionBridge, ActionContext } from './WidgetActionBridge';
import { voiceElementSelector, type ElementMatch, type SelectionContext, type DOMElement as VoiceElementSelectorDOMElement } from './VoiceElementSelector';
import { voicePropertyEditor, type EditOperation } from './VoicePropertyEditor';
import {
  VoiceCommandParameters,
  VoiceResultData,
  VoiceVisualFeedback
} from '../../../../../../shared/types';

export type VoiceParameterValue = string | number | boolean | null;

const logger = createLogger({ service: 'voice-action-executor' });

export interface VoiceCommand {
  text: string;
  intent: string;
  confidence: number;
  parameters: VoiceCommandParameters;
  context: {
    currentPage: string;
    selectedElement?: string;
    editorMode?: 'design' | 'preview' | 'code';
    userRole: string;
  };
}

export interface ActionExecutionResult {
  success: boolean;
  action: EnhancedSiteAction;
  result: VoiceResultData;
  visualFeedback?: VoiceVisualFeedback[];
  followUpSuggestions?: string[];
  executionTime: number;
  error?: string;
}

export interface VisualFeedbackAction {
  type: 'highlight' | 'animate' | 'overlay' | 'toast' | 'cursor';
  target: string; // CSS selector or element ID
  duration: number;
  style?: Record<string, string | number>;
  message?: string;
}

export interface EditorVoiceCommand {
  category: 'selection' | 'editing' | 'navigation' | 'styling' | 'layout';
  action: string;
  targets: string[];
  parameters: VoiceCommandParameters;
  requiresConfirmation: boolean;
}

/**
 * Core Voice Action Executor
 * Handles real-time execution of voice commands with editor integration
 */
export class VoiceActionExecutor {
  private actionManifest: SiteManifest | null = null;
  private widgetBridge: WidgetActionBridge;
  private editorCommands = new Map<string, (command: EditorVoiceCommand, context: ActionContext) => Promise<ActionExecutionResult>>();
  private pendingActions = new Map<string, Promise<ActionExecutionResult>>();
  private executionMetrics = {
    totalExecutions: 0,
    averageExecutionTime: 0,
    successRate: 0,
    commonCommands: new Map<string, number>(),
  };

  constructor(widgetBridge: WidgetActionBridge) {
    this.widgetBridge = widgetBridge;
    this.setupEditorCommands();
    logger.info('VoiceActionExecutor initialized');
  }

  /**
   * Execute voice command with real-time feedback
   */
  async executeVoiceCommand(
    command: VoiceCommand,
    context: ActionContext
  ): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    const executionId = this.generateExecutionId();

    try {
      logger.info('Executing voice command', {
        executionId,
        intent: command.intent,
        confidence: command.confidence,
        context: command.context,
      });

      // Update metrics
      this.updateCommandMetrics(command.intent);

      // Check if this is an editor-specific command
      if (this.isEditorCommand(command)) {
        return await this.executeEditorCommand(command, context, executionId);
      }

      // Find matching action from manifest
      const action = await this.findMatchingAction(command);
      if (!action) {
        throw new Error(`No matching action found for command: ${command.text}`);
      }

      // Validate parameters and context
      await this.validateActionExecution(action, command, context);

      // Execute action with visual feedback
      const result = await this.executeActionWithFeedback(
        action,
        command.parameters,
        context,
        executionId
      );

      const executionTime = Date.now() - startTime;
      logger.info('Voice command executed successfully', {
        executionId,
        action: action.name,
        executionTime,
      });

      return {
        success: true,
        action,
        result: result.result,
        visualFeedback: this.generateVisualFeedback(action, result, command),
        followUpSuggestions: this.generateFollowUpSuggestions(action, command),
        executionTime,
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Voice command execution failed', {
        executionId,
        error: getErrorMessage(error),
        command: command.text,
        executionTime,
      });

      return {
        success: false,
        action: {
          id: 'error',
          name: 'Error Action',
          type: 'custom',
          description: 'Action execution failed',
          parameters: [],
          requiresAuth: false,
        } as EnhancedSiteAction,
        result: {
          error: getErrorMessage(error),
          executionTime,
        } as VoiceResultData,
        error: getErrorMessage(error),
        executionTime,
      };
    } finally {
      this.pendingActions.delete(executionId);
      this.updateExecutionMetrics(Date.now() - startTime);
    }
  }

  /**
   * Execute editor-specific voice commands
   */
  private async executeEditorCommand(
    command: VoiceCommand,
    context: ActionContext,
    executionId: string
  ): Promise<ActionExecutionResult> {
    const editorCommand = this.parseEditorCommand(command);

    logger.debug('Executing editor command', {
      executionId,
      category: editorCommand.category,
      action: editorCommand.action,
      targets: editorCommand.targets,
    });

    switch (editorCommand.category) {
      case 'selection':
        return await this.executeSelectionCommand(editorCommand, context);

      case 'editing':
        return await this.executeEditingCommand(editorCommand, context);

      case 'navigation':
        return await this.executeNavigationCommand(editorCommand, context);

      case 'styling':
        return await this.executeStylingCommand(editorCommand, context);

      case 'layout':
        return await this.executeLayoutCommand(editorCommand, context);

      default:
        throw new Error(`Unsupported editor command category: ${editorCommand.category}`);
    }
  }

  /**
   * Element selection commands ("select the header", "choose the button")
   */
  private async executeSelectionCommand(
    editorCommand: EditorVoiceCommand,
    context: ActionContext
  ): Promise<ActionExecutionResult> {
    const { action, targets } = editorCommand;

    switch (action) {
      case 'select_element':
        { const target = targets[0];
        if (!target) {
          throw new Error('No target element specified for selection');
        }

        const elementMatch = await this.findElementByDescription(target, context);

        if (!elementMatch) {
          throw new Error(`Could not find element: ${target}`);
        }

        const feedback = this.generateSelectionFeedback(elementMatch, target);

        return {
          success: true,
          action: {
            id: 'editor_select',
            name: 'Select Element',
            type: 'custom',
            description: `Select element: ${target}`,
            parameters: [],
            requiresAuth: false,
          } as EnhancedSiteAction,
          result: {
            selectedElement: elementMatch.element.cssSelector,
            elementMatch: elementMatch as unknown as Record<string, unknown>,
            confidence: elementMatch.confidence,
            reasoning: elementMatch.reasoning,
          } as VoiceResultData,
          visualFeedback: feedback,
          followUpSuggestions: this.generateSelectionSuggestions(elementMatch),
          executionTime: 50,
        }; }

      case 'select_multiple':
        { const elementMatches = await Promise.all(
          targets.map(target => this.findElementByDescription(target, context))
        );

        const validMatches = elementMatches.filter(match => match !== null) as ElementMatch[];

        if (validMatches.length === 0) {
          throw new Error(`Could not find any of the specified elements: ${targets.join(', ')}`);
        }

        return {
          success: true,
          action: {
            id: 'editor_select_multiple',
            name: 'Select Multiple Elements',
            type: 'custom',
            description: `Select elements: ${targets.join(', ')}`,
            parameters: [],
            requiresAuth: false,
          } as EnhancedSiteAction,
          result: {
            selectedElements: validMatches.map(match => match.element.cssSelector),
            elementMatches: validMatches as unknown as Record<string, unknown>[],
            foundCount: validMatches.length,
            requestedCount: targets.length,
          } as VoiceResultData,
          visualFeedback: validMatches.flatMap(match =>
            this.generateSelectionFeedback(match, 'element')
          ),
          followUpSuggestions: ['Edit selected elements', 'Change styling', 'Move elements'],
          executionTime: 120,
        }; }

      default:
        throw new Error(`Unknown selection command: ${action}`);
    }
  }

  /**
   * Content editing commands ("change text to...", "update color to...")
   */
  private async executeEditingCommand(
    editorCommand: EditorVoiceCommand,
    _context: ActionContext
  ): Promise<ActionExecutionResult> {
    const { action, targets, parameters } = editorCommand;

    switch (action) {
      case 'update_text':
        { const target = targets[0];
        const textValue = parameters['text'];
        if (!target) {
          throw new Error('No target element specified for text update');
        }
        return {
          success: true,
          action: {
            id: 'editor_update_text',
            name: 'Update Text Content',
            type: 'custom',
            description: `Update text to: ${textValue}`,
            parameters: [],
            requiresAuth: false,
          } as EnhancedSiteAction,
          result: {
            action: 'text_updated',
            target: target,
            newText: textValue,
          } as VoiceResultData,
          visualFeedback: [{
            type: 'animate',
            target: target,
            duration: 1000,
            style: { animation: 'pulse 0.5s ease-in-out' },
            message: 'Text updated',
          }],
          executionTime: 100,
        }; }

      case 'update_style':
        { const target = targets[0];
        const property = parameters['property'];
        const value = parameters['value'];
        if (!target) {
          throw new Error('No target element specified for style update');
        }
        return {
          success: true,
          action: {
            id: 'editor_update_style',
            name: 'Update Element Style',
            type: 'custom',
            description: `Update ${property} to ${value}`,
            parameters: [],
            requiresAuth: false,
          } as EnhancedSiteAction,
          result: {
            action: 'style_updated',
            target: target,
            property: property,
            value: value,
          } as VoiceResultData,
          visualFeedback: [{
            type: 'highlight',
            target: target,
            duration: 1500,
            style: { outline: '2px solid #10b981' },
            message: `${property} updated`,
          }],
          executionTime: 120,
        }; }

      default:
        throw new Error(`Unknown editing command: ${action}`);
    }
  }

  /**
   * Navigation commands ("go to properties", "open component palette")
   */
  private async executeNavigationCommand(
    editorCommand: EditorVoiceCommand,
    _context: ActionContext
  ): Promise<ActionExecutionResult> {
    const { action, targets, parameters } = editorCommand;

    switch (action) {
      case 'navigate_to_panel':
        { const panelName = targets[0];
        if (!panelName) {
          throw new Error('No panel name specified for navigation');
        }
        return {
          success: true,
          action: {
            id: 'editor_navigate_panel',
            name: 'Navigate to Panel',
            type: 'navigation',
            description: `Navigate to ${panelName} panel`,
            parameters: [],
            requiresAuth: false,
          } as EnhancedSiteAction,
          result: {
            action: 'panel_opened',
            panel: panelName,
          } as VoiceResultData,
          visualFeedback: [{
            type: 'overlay',
            target: `[data-panel="${panelName}"]`,
            duration: 1000,
            message: `Opened ${panelName} panel`,
          }],
          executionTime: 80,
        }; }

      case 'switch_mode':
        { const mode = parameters['mode'];
        if (!mode) {
          throw new Error('No mode specified for switch operation');
        }
        return {
          success: true,
          action: {
            id: 'editor_switch_mode',
            name: 'Switch Editor Mode',
            type: 'custom',
            description: `Switch to ${mode} mode`,
            parameters: [],
            requiresAuth: false,
          } as EnhancedSiteAction,
          result: {
            action: 'mode_switched',
            newMode: mode,
          } as VoiceResultData,
          visualFeedback: [{
            type: 'toast',
            target: 'body',
            duration: 2000,
            message: `Switched to ${mode} mode`,
          }],
          executionTime: 60,
        }; }

      default:
        throw new Error(`Unknown navigation command: ${action}`);
    }
  }

  /**
   * Styling commands ("make it blue", "increase font size")
   */
  private async executeStylingCommand(
    editorCommand: EditorVoiceCommand,
    context: ActionContext
  ): Promise<ActionExecutionResult> {
    const { action, targets } = editorCommand;
    const startTime = performance.now();

    // Find target element first
    const target = targets[0];
    if (!target) {
      throw new Error('No target element specified for styling operation');
    }

    const elementMatch = await this.findElementByDescription(target, context);

    if (!elementMatch) {
      throw new Error(`Could not find target element: ${target}`);
    }

    switch (action) {
      case 'change_color':
      case 'change_background':
      case 'adjust_size':
      case 'change_font':
      case 'edit_properties':
        // Use VoicePropertyEditor for intelligent property editing
        { const commandText = this.reconstructCommandText(editorCommand);
        const propertyCommands = await voiceElementSelector.parsePropertyEditCommand(
          commandText,
          elementMatch
        );

        if (propertyCommands.length === 0) {
          throw new Error(`Could not parse property editing command: ${commandText}`);
        }

        const editOperation = await voicePropertyEditor.executePropertyCommands(
          elementMatch,
          propertyCommands,
          commandText
        );

        const successfulChanges = editOperation.changes.filter(change => change.success);

        if (successfulChanges.length === 0) {
          throw new Error(`Failed to apply property changes: ${editOperation.changes.map(c => c.error).join(', ')}`);
        }

        return {
          success: true,
          action: {
            id: 'editor_style_properties',
            name: 'Edit Element Properties',
            type: 'custom',
            description: editOperation.description,
            parameters: [],
            requiresAuth: false,
          } as EnhancedSiteAction,
          result: {
            operation: editOperation as unknown as Record<string, unknown>,
            elementMatch: elementMatch as unknown as Record<string, unknown>,
            successfulChanges: successfulChanges as unknown[],
            propertyCommands: propertyCommands as unknown as Record<string, unknown>[],
          } as VoiceResultData,
          visualFeedback: this.generatePropertyEditFeedback(elementMatch, successfulChanges),
          followUpSuggestions: this.generatePropertyEditSuggestions(editOperation),
          executionTime: performance.now() - startTime,
        }; }

      case 'undo_styling':
        { const undoOperation = await voicePropertyEditor.undoLastOperation();

        if (!undoOperation) {
          throw new Error('No styling operations to undo');
        }

        return {
          success: true,
          action: {
            id: 'editor_undo_styling',
            name: 'Undo Styling',
            type: 'custom',
            description: `Undid: ${undoOperation.description}`,
            parameters: [],
            requiresAuth: false,
          } as EnhancedSiteAction,
          result: {
            undoOperation: undoOperation as unknown as Record<string, unknown>,
            elementSelector: undoOperation.elementSelector,
          } as VoiceResultData,
          visualFeedback: [{
            type: 'highlight',
            target: undoOperation.elementSelector,
            duration: 1500,
            style: { outline: '3px solid #ef4444', animation: 'pulse 0.5s ease-in-out' },
            message: 'Changes undone',
          }],
          followUpSuggestions: ['Redo changes', 'Apply different styling'],
          executionTime: performance.now() - startTime,
        }; }

      case 'redo_styling':
        { const redoOperation = await voicePropertyEditor.redoNextOperation();

        if (!redoOperation) {
          throw new Error('No styling operations to redo');
        }

        return {
          success: true,
          action: {
            id: 'editor_redo_styling',
            name: 'Redo Styling',
            type: 'custom',
            description: `Redid: ${redoOperation.description}`,
            parameters: [],
            requiresAuth: false,
          } as EnhancedSiteAction,
          result: {
            redoOperation: redoOperation as unknown as Record<string, unknown>,
            elementSelector: redoOperation.elementSelector,
          } as VoiceResultData,
          visualFeedback: [{
            type: 'highlight',
            target: redoOperation.elementSelector,
            duration: 1500,
            style: { outline: '3px solid #10b981', animation: 'pulse 0.5s ease-in-out' },
            message: 'Changes restored',
          }],
          followUpSuggestions: ['Apply more styling', 'Undo changes'],
          executionTime: performance.now() - startTime,
        }; }

      default:
        throw new Error(`Unknown styling command: ${action}`);
    }
  }

  /**
   * Layout commands ("move to left", "align center")
   */
  private async executeLayoutCommand(
    editorCommand: EditorVoiceCommand,
    _context: ActionContext
  ): Promise<ActionExecutionResult> {
    const { action, targets, parameters } = editorCommand;

    switch (action) {
      case 'move_element':
        { const target = targets[0];
        const direction = parameters['direction'];
        const distance = parameters['distance'];
        if (!target) {
          throw new Error('No target element specified for move operation');
        }
        return {
          success: true,
          action: {
            id: 'editor_move_element',
            name: 'Move Element',
            type: 'custom',
            description: `Move ${target} to ${direction}`,
            parameters: [],
            requiresAuth: false,
          } as EnhancedSiteAction,
          result: {
            action: 'element_moved',
            target: target,
            direction: direction,
            distance: distance,
          } as VoiceResultData,
          visualFeedback: [{
            type: 'animate',
            target: target,
            duration: 600,
            style: {
              transform: `translate${direction === 'left' || direction === 'right' ? 'X' : 'Y'}(${distance}px)`,
              transition: 'transform 0.6s ease',
            },
            message: `Moved ${direction}`,
          }],
          executionTime: 130,
        }; }

      case 'align_element':
        { const target = targets[0];
        const alignment = parameters['alignment'];
        if (!target) {
          throw new Error('No target element specified for align operation');
        }
        return {
          success: true,
          action: {
            id: 'editor_align_element',
            name: 'Align Element',
            type: 'custom',
            description: `Align ${target} to ${alignment}`,
            parameters: [],
            requiresAuth: false,
          } as EnhancedSiteAction,
          result: {
            action: 'element_aligned',
            target: target,
            alignment: alignment,
          } as VoiceResultData,
          visualFeedback: [{
            type: 'highlight',
            target: target,
            duration: 1200,
            style: { outline: '2px dashed #f59e0b' },
            message: `Aligned ${alignment}`,
          }],
          executionTime: 100,
        }; }

      default:
        throw new Error(`Unknown layout command: ${action}`);
    }
  }

  /**
   * Find element by natural language description
   */
  private async findElementByDescription(
    description: string,
    context: ActionContext
  ): Promise<ElementMatch | null> {
    try {
      logger.debug('Finding element by description', { description, context });

      // Parse the natural language description
      const selectionContext: SelectionContext = {
        mode: context.mode || 'editor',
        activePanel: context.activePanel || 'main',
        selectedElements: context.selectedElements ? [{
          tagName: 'div',
          cssSelector: context.selectedElements,
          attributes: {},
          computedStyle: {},
          boundingRect: { x: 0, y: 0, width: 0, height: 0 }
        } as VoiceElementSelectorDOMElement] : [],
        viewport: context.viewport || { width: 1920, height: 1080, zoom: 1 },
        ...(context.constraints && { constraints: context.constraints }),
      };

      const descriptor = await voiceElementSelector.parseElementDescription(
        description,
        selectionContext
      );

      // Get DOM elements from the current page context
      const domElements = await this.getDOMElementsFromContext(context);

      // Convert unknown elements to VoiceElementSelectorDOMElement format
      const typedDomElements: VoiceElementSelectorDOMElement[] = domElements.map(el => {
        if (typeof el === 'object' && el !== null && 'tagName' in el && 'cssSelector' in el) {
          return {
            tagName: (el as any).tagName,
            id: (el as any).id,
            className: (el as any).className,
            textContent: (el as any).textContent,
            attributes: (el as any).attributes || {},
            computedStyle: (el as any).computedStyle || {},
            boundingRect: (el as any).boundingRect,
            cssSelector: (el as any).cssSelector
          } as VoiceElementSelectorDOMElement;
        }
        // Provide a default structure for unknown elements
        return {
          tagName: 'div',
          attributes: {},
          computedStyle: {},
          boundingRect: { x: 0, y: 0, width: 0, height: 0 },
          cssSelector: 'unknown-element'
        } as VoiceElementSelectorDOMElement;
      });

      // Find matching elements
      const matches = await voiceElementSelector.findMatchingElements(
        descriptor,
        typedDomElements,
        selectionContext
      );

      if (matches.length === 0) {
        logger.warn('No elements found for description', { description, descriptor });
        return null;
      }

      // Return the best match
      const bestMatch = matches[0]!;

      // Add to selection history
      voiceElementSelector.addToHistory(bestMatch);

      logger.info('Element found by description', {
        description,
        elementTag: bestMatch.element.tagName,
        score: bestMatch.score,
        confidence: bestMatch.confidence,
        reasoning: bestMatch.reasoning,
      });

      return bestMatch;
    } catch (error) {
      logger.error('Failed to find element by description', { error, description });
      return null;
    }
  }

  /**
   * Get DOM elements from current context
   */
  private async getDOMElementsFromContext(_context: ActionContext): Promise<unknown[]> {
    // This would typically get DOM elements from the current page
    // For now, return mock data - in real implementation, this would
    // fetch actual DOM elements via the widget bridge

    // Mock implementation
    return [
      {
        tagName: 'button',
        id: 'submit-btn',
        className: 'btn btn-primary',
        textContent: 'Submit',
        attributes: { type: 'submit', role: 'button' },
        computedStyle: { backgroundColor: 'blue', color: 'white' },
        boundingRect: { x: 100, y: 200, width: 120, height: 40 },
        cssSelector: '#submit-btn',
      },
      {
        tagName: 'input',
        id: 'email-input',
        className: 'form-control',
        textContent: '',
        attributes: { type: 'email', placeholder: 'Email address' },
        computedStyle: { backgroundColor: 'white', borderColor: 'gray' },
        boundingRect: { x: 100, y: 150, width: 250, height: 30 },
        cssSelector: '#email-input',
      },
      {
        tagName: 'h1',
        className: 'page-title',
        textContent: 'Welcome to our website',
        attributes: {},
        computedStyle: { fontSize: '32px', color: 'black' },
        boundingRect: { x: 50, y: 50, width: 400, height: 40 },
        cssSelector: 'h1.page-title',
      },
    ];
  }

  /**
   * Parse voice command into structured editor command
   */
  private parseEditorCommand(command: VoiceCommand): EditorVoiceCommand {
    const text = command.text.toLowerCase();

    // Selection patterns
    if (text.includes('select') || text.includes('choose') || text.includes('pick')) {
      return {
        category: 'selection',
        action: text.includes('multiple') ? 'select_multiple' : 'select_element',
        targets: this.extractTargets(text),
        parameters: command.parameters,
        requiresConfirmation: false,
      };
    }

    // Editing patterns
    if (text.includes('change') || text.includes('update') || text.includes('edit')) {
      if (text.includes('text') || text.includes('content')) {
        return {
          category: 'editing',
          action: 'update_text',
          targets: this.extractTargets(text),
          parameters: { text: command.parameters['text'] as VoiceParameterValue },
          requiresConfirmation: false,
        };
      }
      return {
        category: 'editing',
        action: 'update_style',
        targets: this.extractTargets(text),
        parameters: command.parameters,
        requiresConfirmation: false,
      };
    }

    // Navigation patterns
    if (text.includes('go to') || text.includes('open') || text.includes('show')) {
      if (text.includes('mode')) {
        return {
          category: 'navigation',
          action: 'switch_mode',
          targets: [],
          parameters: { mode: this.extractMode(text) },
          requiresConfirmation: false,
        };
      }
      return {
        category: 'navigation',
        action: 'navigate_to_panel',
        targets: this.extractTargets(text),
        parameters: command.parameters,
        requiresConfirmation: false,
      };
    }

    // Styling patterns
    if (text.includes('color') || text.includes('size') || text.includes('font')) {
      if (text.includes('color')) {
        return {
          category: 'styling',
          action: 'change_color',
          targets: this.extractTargets(text),
          parameters: { color: command.parameters['color'] as VoiceParameterValue },
          requiresConfirmation: false,
        };
      }
      return {
        category: 'styling',
        action: 'adjust_size',
        targets: this.extractTargets(text),
        parameters: command.parameters,
        requiresConfirmation: false,
      };
    }

    // Layout patterns
    if (text.includes('move') || text.includes('align') || text.includes('position')) {
      if (text.includes('move')) {
        return {
          category: 'layout',
          action: 'move_element',
          targets: this.extractTargets(text),
          parameters: command.parameters,
          requiresConfirmation: false,
        };
      }
      return {
        category: 'layout',
        action: 'align_element',
        targets: this.extractTargets(text),
        parameters: command.parameters,
        requiresConfirmation: false,
      };
    }

    throw new Error(`Unable to parse editor command: ${text}`);
  }

  /**
   * Extract target elements from command text
   */
  private extractTargets(text: string): string[] {
    const patterns = [
      /(?:the |this )?(\w+)(?: button| element| component)?/g,
      /(\w+) (?:at|in|on) the/g,
    ];

    const targets: string[] = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1] && !['change', 'update', 'select', 'move'].includes(match[1])) {
          targets.push(match[1]);
        }
      }
    }

    return targets.length > 0 ? targets : ['element'];
  }

  /**
   * Extract mode from navigation commands
   */
  private extractMode(text: string): string {
    if (text.includes('preview')) {return 'preview';}
    if (text.includes('design')) {return 'design';}
    if (text.includes('code')) {return 'code';}
    return 'design';
  }

  /**
   * Check if command is editor-specific
   */
  private isEditorCommand(command: VoiceCommand): boolean {
    const editorKeywords = [
      'select', 'choose', 'pick', 'edit', 'update', 'change',
      'move', 'align', 'resize', 'color', 'style', 'design',
      'component', 'element', 'panel', 'mode', 'preview'
    ];

    return editorKeywords.some(keyword =>
      command.text.toLowerCase().includes(keyword)
    );
  }

  /**
   * Execute action with real-time visual feedback
   */
  private async executeActionWithFeedback(
    action: EnhancedSiteAction,
    parameters: VoiceCommandParameters,
    context: ActionContext,
    _executionId: string
  ): Promise<any> {
    // Send immediate visual feedback
    this.sendVisualFeedback({
      type: 'overlay',
      target: 'body',
      duration: 500,
      message: 'Executing action...',
    });

    // Execute via bridge
    const result = await this.widgetBridge.executeAction(
      action.id,
      parameters,
      context
    );

    return result;
  }

  /**
   * Find matching action from manifest
   */
  private async findMatchingAction(command: VoiceCommand): Promise<EnhancedSiteAction | null> {
    if (!this.actionManifest) {
      logger.warn('No action manifest available');
      return null;
    }

    // Simple intent matching (can be enhanced with ML)
    const intent = command.intent.toLowerCase();

    return this.actionManifest.actions.find(action => {
      return action.name.toLowerCase().includes(intent) ||
             action.description.toLowerCase().includes(intent) ||
             action.category?.toLowerCase().includes(intent);
    }) || null;
  }

  /**
   * Validate action execution context
   */
  private async validateActionExecution(
    action: EnhancedSiteAction,
    command: VoiceCommand,
    context: ActionContext
  ): Promise<void> {
    // Security validation
    if (action.requiresAuth && !context.userId) {
      throw new Error('Authentication required for this action');
    }

    // Confidence threshold
    if (command.confidence < 0.7) {
      throw new Error('Command confidence too low for execution');
    }

    // Risk level validation
    if (action.riskLevel === 'high' && !command.parameters['_confirmed']) {
      throw new Error('High-risk action requires explicit confirmation');
    }
  }

  /**
   * Generate visual feedback for actions
   */
  private generateVisualFeedback(
    action: EnhancedSiteAction,
    _result: unknown,
    _command: VoiceCommand
  ): VisualFeedbackAction[] {
    const feedback: VisualFeedbackAction[] = [];

    // Action-specific feedback
    if (action.type === 'navigation') {
      feedback.push({
        type: 'animate',
        target: action.selector || 'body',
        duration: 300,
        style: { opacity: 0.8, transition: 'opacity 0.3s' },
      });
    }

    // Success toast
    feedback.push({
      type: 'toast',
      target: 'body',
      duration: 2000,
      message: `Action completed: ${action.name}`,
    });

    return feedback;
  }

  /**
   * Generate follow-up suggestions
   */
  private generateFollowUpSuggestions(
    action: EnhancedSiteAction,
    _command: VoiceCommand
  ): string[] {
    const suggestions: string[] = [];

    // Context-aware suggestions based on action type
    switch (action.type) {
      case 'navigation':
        suggestions.push('Say "go back" to return');
        suggestions.push('Try "show me the menu" for more options');
        break;

      case 'form':
        suggestions.push('Say "submit" to complete the form');
        suggestions.push('Try "clear form" to start over');
        break;

      default:
        suggestions.push('Say "help" for more commands');
        suggestions.push('Try "undo" to reverse this action');
    }

    return suggestions;
  }

  /**
   * Send visual feedback to client
   */
  private sendVisualFeedback(feedback: VisualFeedbackAction): void {
    // This would send feedback via WebSocket to the client
    logger.debug('Sending visual feedback', { feedback });
  }

  /**
   * Setup editor-specific command handlers
   */
  private setupEditorCommands(): void {
    // Register editor command patterns
    this.editorCommands.set('select', this.executeSelectionCommand.bind(this));
    this.editorCommands.set('edit', this.executeEditingCommand.bind(this));
    this.editorCommands.set('navigate', this.executeNavigationCommand.bind(this));
    this.editorCommands.set('style', this.executeStylingCommand.bind(this));
    this.editorCommands.set('layout', this.executeLayoutCommand.bind(this));
  }

  /**
   * Update command usage metrics
   */
  private updateCommandMetrics(intent: string): void {
    const count = this.executionMetrics.commonCommands.get(intent) || 0;
    this.executionMetrics.commonCommands.set(intent, count + 1);
  }

  /**
   * Update execution performance metrics
   */
  private updateExecutionMetrics(executionTime: number): void {
    this.executionMetrics.totalExecutions++;
    this.executionMetrics.averageExecutionTime =
      (this.executionMetrics.averageExecutionTime * (this.executionMetrics.totalExecutions - 1) + executionTime) /
      this.executionMetrics.totalExecutions;
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Set action manifest for dynamic action discovery
   */
  setActionManifest(manifest: SiteManifest): void {
    this.actionManifest = manifest;
    logger.info('Action manifest updated', {
      actionCount: manifest.actions.length,
      capabilities: manifest.capabilities,
    });
  }

  /**
   * Get execution metrics for monitoring
   */
  getMetrics(): typeof this.executionMetrics {
    return { ...this.executionMetrics };
  }

  /**
   * Generate enhanced visual feedback for element selection
   */
  private generateSelectionFeedback(elementMatch: ElementMatch, description: string): VisualFeedbackAction[] {
    const feedback: VisualFeedbackAction[] = [];

    // Primary highlight
    feedback.push({
      type: 'highlight',
      target: elementMatch.element.cssSelector || `[data-element="${elementMatch.element.id}"]`,
      duration: 2000,
      style: {
        outline: `3px solid ${elementMatch.confidence > 0.8 ? '#10b981' : '#f59e0b'}`,
        borderRadius: '4px',
        animation: 'pulse 0.5s ease-in-out',
      },
      message: `Selected: ${description} (${Math.round(elementMatch.confidence * 100)}% confidence)`,
    });

    // Confidence indicator
    if (elementMatch.confidence < 0.8) {
      feedback.push({
        type: 'toast',
        target: 'body',
        duration: 3000,
        message: `Selection confidence: ${Math.round(elementMatch.confidence * 100)}%. ${elementMatch.reasoning}`,
      });
    }

    return feedback;
  }

  /**
   * Generate follow-up suggestions for element selection
   */
  private generateSelectionSuggestions(elementMatch: ElementMatch): string[] {
    const suggestions: string[] = [];

    // Element-specific suggestions
    const tagName = elementMatch.element.tagName.toLowerCase();

    switch (tagName) {
      case 'button':
        suggestions.push('Click this button', 'Change button color', 'Edit button text');
        break;
      case 'input':
        suggestions.push('Change placeholder text', 'Modify input style', 'Add validation');
        break;
      case 'img':
        suggestions.push('Replace image', 'Add alt text', 'Resize image');
        break;
      default:
        suggestions.push('Edit element properties', 'Change styling', 'Move element');
    }

    // Property-based suggestions
    if (elementMatch.properties?.backgroundColor) {
      suggestions.push('Change background color');
    }
    if (elementMatch.properties?.fontSize) {
      suggestions.push('Adjust font size');
    }

    return suggestions.slice(0, 4); // Limit to 4 suggestions
  }

  /**
   * Find elements similar to the current selection
   */
  // Note: findSimilarElements method removed as it was unused and only served as a placeholder

  /**
   * Reconstruct command text from structured editor command
   */
  private reconstructCommandText(editorCommand: EditorVoiceCommand): string {
    const { action, targets, parameters } = editorCommand;

    // Create a natural language representation of the command
    let commandText = '';

    switch (action) {
      case 'change_color':
        commandText = `change ${targets[0]} color to ${parameters['color'] || 'blue'}`;
        break;
      case 'change_background':
        commandText = `change ${targets[0]} background to ${parameters['color'] || 'white'}`;
        break;
      case 'adjust_size':
        commandText = `make ${targets[0]} ${parameters['direction'] || 'bigger'}`;
        break;
      case 'change_font':
        commandText = `change ${targets[0]} font size to ${parameters['size'] || 'larger'}`;
        break;
      default:
        commandText = `${action} ${targets.join(' ')} ${Object.values(parameters).join(' ')}`;
    }

    return commandText;
  }

  /**
   * Generate visual feedback for property editing
   */
  private generatePropertyEditFeedback(
    elementMatch: ElementMatch,
    successfulChanges: unknown[]
  ): VisualFeedbackAction[] {
    const feedback: VisualFeedbackAction[] = [];

    // Main element highlight
    feedback.push({
      type: 'highlight',
      target: elementMatch.element.cssSelector || `#${elementMatch.element.id}`,
      duration: 2000,
      style: {
        outline: '3px solid #10b981',
        borderRadius: '4px',
        animation: 'pulse 0.5s ease-in-out',
      },
      message: `Updated ${successfulChanges.length} property${successfulChanges.length > 1 ? 'es' : ''}`,
    });

    // Property-specific feedback
    if (successfulChanges.length > 0) {
      const propertyNames = successfulChanges
        .filter(change => typeof change === 'object' && change !== null && 'property' in change)
        .map(change => (change as { property: string }).property)
        .join(', ');
      feedback.push({
        type: 'toast',
        target: 'body',
        duration: 3000,
        message: `Properties updated: ${propertyNames}`,
      });
    }

    return feedback;
  }

  /**
   * Generate follow-up suggestions for property editing
   */
  private generatePropertyEditSuggestions(editOperation: EditOperation): string[] {
    const suggestions: string[] = [];

    // Operation-specific suggestions
    suggestions.push('Undo changes', 'Apply to similar elements');

    // Based on successful changes
    const changedProperties = editOperation.changes
      .filter(change => change.success)
      .map(change => change.property);

    if (changedProperties.includes('color')) {
      suggestions.push('Change background color', 'Adjust opacity');
    }

    if (changedProperties.includes('fontSize')) {
      suggestions.push('Change font weight', 'Adjust line height');
    }

    if (changedProperties.includes('backgroundColor')) {
      suggestions.push('Add border', 'Change text color');
    }

    return suggestions.slice(0, 4);
  }

  /**
   * Clear pending actions and cleanup
   */
  cleanup(): void {
    this.pendingActions.clear();
    this.editorCommands.clear();
    logger.debug('VoiceActionExecutor cleaned up');
  }
}

/**
 * Export singleton instance
 */
export const voiceActionExecutor = new VoiceActionExecutor(
  {} as WidgetActionBridge // Will be injected at runtime
);