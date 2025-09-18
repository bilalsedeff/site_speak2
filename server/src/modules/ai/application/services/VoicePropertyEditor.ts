/**
 * Voice Property Editor - Execute element property changes via voice commands
 *
 * Handles the actual execution of property editing commands:
 * - CSS property manipulation with validation and rollback
 * - Safe DOM modifications with undo/redo support
 * - Real-time visual feedback during editing
 * - Property value normalization and unit conversion
 * - History tracking for multi-step editing workflows
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../../shared/utils';
import type {
  DOMElement,
  ElementMatch,
  PropertyEditCommand,
} from './VoiceElementSelector.js';

// Re-export types that other modules need
export type { PropertyEditCommand };

const logger = createLogger({ service: 'voice-property-editor' });

export interface PropertyChangeRecord {
  elementSelector: string;
  property: string;
  oldValue: string | null;
  newValue: string;
  timestamp: Date;
  commandText: string;
  success: boolean;
  error?: string;
}

export interface EditOperation {
  id: string;
  type: 'property_change' | 'element_create' | 'element_delete' | 'element_move';
  elementSelector: string;
  changes: PropertyChangeRecord[];
  timestamp: Date;
  description: string;
  undoable: boolean;
}

export interface ValidationResult {
  valid: boolean;
  normalizedValue?: string;
  warnings: string[];
  errors: string[];
  suggestions: string[];
}

export interface EditorState {
  currentOperation?: EditOperation;
  historyIndex: number;
  operationHistory: EditOperation[];
  maxHistorySize: number;
  autoSave: boolean;
  validationMode: 'strict' | 'permissive' | 'disabled';
}

/**
 * Voice-controlled property editor with undo/redo support
 */
export class VoicePropertyEditor extends EventEmitter {
  private state: EditorState;
  private isProcessing = false;
  private operationCounter = 0;

  constructor() {
    super();

    this.state = {
      historyIndex: -1,
      operationHistory: [],
      maxHistorySize: 50,
      autoSave: true,
      validationMode: 'permissive',
    };

    logger.info('VoicePropertyEditor initialized');
  }

  /**
   * Execute property editing commands on an element
   */
  async executePropertyCommands(
    elementMatch: ElementMatch,
    commands: PropertyEditCommand[],
    commandText: string
  ): Promise<EditOperation> {
    if (this.isProcessing) {
      throw new Error('Property editor is currently processing another operation');
    }

    this.isProcessing = true;

    try {
      const operationId = `prop_edit_${++this.operationCounter}_${Date.now()}`;
      const changes: PropertyChangeRecord[] = [];

      logger.info('Executing property commands', {
        operationId,
        elementTag: elementMatch.element.tagName,
        commandCount: commands.length,
        commandText,
      });

      // Create operation record
      const operation: EditOperation = {
        id: operationId,
        type: 'property_change',
        elementSelector: this.generateElementSelector(elementMatch.element),
        changes: [],
        timestamp: new Date(),
        description: `Voice command: "${commandText}"`,
        undoable: true,
      };

      // Execute each command
      for (const command of commands) {
        try {
          const change = await this.executePropertyCommand(
            elementMatch,
            command,
            commandText
          );

          changes.push(change);
          operation.changes.push(change);

          // Emit real-time update
          this.emit('property_changed', {
            operation,
            change,
            elementMatch,
          });
        } catch (error) {
          const errorChange: PropertyChangeRecord = {
            elementSelector: operation.elementSelector,
            property: command.property,
            oldValue: null,
            newValue: command.value,
            timestamp: new Date(),
            commandText,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };

          changes.push(errorChange);
          operation.changes.push(errorChange);

          logger.error('Property command failed', {
            operationId,
            command,
            error,
          });
        }
      }

      // Add to history
      this.addToHistory(operation);

      // Emit completion
      this.emit('operation_completed', {
        operation,
        successCount: changes.filter(c => c.success).length,
        errorCount: changes.filter(c => !c.success).length,
      });

      logger.info('Property commands executed', {
        operationId,
        totalCommands: commands.length,
        successCount: changes.filter(c => c.success).length,
        errorCount: changes.filter(c => !c.success).length,
      });

      return operation;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a single property command
   */
  private async executePropertyCommand(
    elementMatch: ElementMatch,
    command: PropertyEditCommand,
    commandText: string
  ): Promise<PropertyChangeRecord> {
    const element = elementMatch.element;
    const selector = this.generateElementSelector(element);

    logger.debug('Executing property command', {
      selector,
      command,
      elementTag: element.tagName,
    });

    // Validate the property change
    const validation = this.validatePropertyChange(command, element);

    if (!validation.valid && this.state.validationMode === 'strict') {
      throw new Error(`Invalid property change: ${validation.errors.join(', ')}`);
    }

    // Get current value
    const currentValue = this.getCurrentPropertyValue(element, command.property);

    // Calculate new value
    const newValue = validation.normalizedValue || command.value;

    // Create change record
    const change: PropertyChangeRecord = {
      elementSelector: selector,
      property: command.property,
      oldValue: currentValue,
      newValue,
      timestamp: new Date(),
      commandText,
      success: false,
    };

    try {
      // Apply the property change
      await this.applyPropertyChange(element, command.property, newValue, command.important);

      change.success = true;

      logger.debug('Property command executed successfully', {
        selector,
        property: command.property,
        oldValue: currentValue,
        newValue,
      });

      // Emit warnings if any
      if (validation.warnings.length > 0) {
        this.emit('validation_warnings', {
          change,
          warnings: validation.warnings,
          suggestions: validation.suggestions,
        });
      }

      return change;
    } catch (error) {
      change.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  /**
   * Validate property change
   */
  private validatePropertyChange(
    command: PropertyEditCommand,
    element: DOMElement
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      warnings: [],
      errors: [],
      suggestions: [],
    };

    try {
      // Validate property name
      if (!this.isValidCSSProperty(command.property)) {
        result.valid = false;
        result.errors.push(`Invalid CSS property: ${command.property}`);

        // Suggest similar properties
        const suggestions = this.suggestSimilarProperties(command.property);
        if (suggestions.length > 0) {
          result.suggestions.push(`Did you mean: ${suggestions.join(', ')}?`);
        }
      }

      // Validate and normalize value
      const normalizedValue = this.normalizePropertyValue(
        command.property,
        command.value,
        command.unit
      );

      if (normalizedValue) {
        result.normalizedValue = normalizedValue;
      } else {
        result.warnings.push(`Could not normalize value "${command.value}" for property "${command.property}"`);
      }

      // Element-specific validations
      const elementValidation = this.validateForElement(command, element);
      result.warnings.push(...elementValidation.warnings);
      result.errors.push(...elementValidation.errors);
      result.suggestions.push(...elementValidation.suggestions);

      // Performance warnings
      if (this.isPerformanceHeavyProperty(command.property)) {
        result.warnings.push(`Property "${command.property}" may impact performance`);
        result.suggestions.push('Consider using CSS transforms or opacity for animations');
      }

      if (result.errors.length > 0) {
        result.valid = false;
      }

      logger.debug('Property validation completed', {
        property: command.property,
        value: command.value,
        valid: result.valid,
        warningCount: result.warnings.length,
        errorCount: result.errors.length,
      });

      return result;
    } catch (error) {
      logger.error('Property validation failed', { error, command });
      return {
        valid: false,
        warnings: [],
        errors: ['Validation failed due to internal error'],
        suggestions: [],
      };
    }
  }

  /**
   * Check if CSS property is valid
   */
  private isValidCSSProperty(property: string): boolean {
    const validProperties = [
      // Layout
      'display', 'position', 'top', 'right', 'bottom', 'left', 'zIndex',
      'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',

      // Box model
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'border', 'borderWidth', 'borderStyle', 'borderColor',
      'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
      'borderRadius',

      // Typography
      'color', 'fontSize', 'fontWeight', 'fontFamily', 'fontStyle',
      'lineHeight', 'textAlign', 'textDecoration', 'textTransform',
      'letterSpacing', 'wordSpacing',

      // Background
      'backgroundColor', 'backgroundImage', 'backgroundSize',
      'backgroundPosition', 'backgroundRepeat',

      // Visual effects
      'opacity', 'visibility', 'transform', 'filter',
      'boxShadow', 'textShadow',

      // Flexbox
      'flexDirection', 'justifyContent', 'alignItems', 'flexWrap',
      'flex', 'flexGrow', 'flexShrink', 'flexBasis',

      // Grid
      'gridTemplate', 'gridTemplateColumns', 'gridTemplateRows',
      'gridColumn', 'gridRow', 'gridGap',

      // Transitions and animations
      'transition', 'transitionProperty', 'transitionDuration',
      'animation', 'animationName', 'animationDuration',
    ];

    return validProperties.includes(property);
  }

  /**
   * Suggest similar property names
   */
  private suggestSimilarProperties(property: string): string[] {
    const propertyMap: Record<string, string[]> = {
      'color': ['color', 'backgroundColor'],
      'background': ['backgroundColor', 'backgroundImage'],
      'size': ['fontSize', 'width', 'height'],
      'font': ['fontSize', 'fontWeight', 'fontFamily'],
      'margin': ['margin', 'marginTop', 'marginLeft'],
      'padding': ['padding', 'paddingTop', 'paddingLeft'],
      'border': ['border', 'borderWidth', 'borderColor'],
      'text': ['textAlign', 'textDecoration', 'color'],
    };

    const lower = property.toLowerCase();

    for (const [key, suggestions] of Object.entries(propertyMap)) {
      if (lower.includes(key) || key.includes(lower)) {
        return suggestions;
      }
    }

    return [];
  }

  /**
   * Normalize property value with units
   */
  private normalizePropertyValue(
    property: string,
    value: string,
    unit?: string
  ): string | null {
    try {
      const cleanValue = value.trim().toLowerCase();

      // Handle color values
      if (this.isColorProperty(property)) {
        return this.normalizeColorValue(cleanValue);
      }

      // Handle numeric values with units
      if (this.isNumericProperty(property)) {
        return this.normalizeNumericValue(cleanValue, unit, property);
      }

      // Handle keyword values
      if (this.isKeywordProperty(property)) {
        return this.normalizeKeywordValue(cleanValue, property);
      }

      // Return as-is for other properties
      return value;
    } catch (error) {
      logger.warn('Failed to normalize property value', { property, value, error });
      return null;
    }
  }

  /**
   * Check if property accepts color values
   */
  private isColorProperty(property: string): boolean {
    return ['color', 'backgroundColor', 'borderColor'].includes(property);
  }

  /**
   * Check if property accepts numeric values
   */
  private isNumericProperty(property: string): boolean {
    const numericProperties = [
      'width', 'height', 'margin', 'padding', 'fontSize',
      'borderWidth', 'top', 'left', 'right', 'bottom',
      'zIndex', 'opacity', 'lineHeight', 'letterSpacing',
    ];

    return numericProperties.some(prop => property.includes(prop));
  }

  /**
   * Check if property accepts keyword values
   */
  private isKeywordProperty(property: string): boolean {
    const keywordProperties = [
      'display', 'position', 'textAlign', 'fontWeight',
      'textDecoration', 'visibility', 'overflow',
    ];

    return keywordProperties.includes(property);
  }

  /**
   * Normalize color value
   */
  private normalizeColorValue(value: string): string {
    const colorMap: Record<string, string> = {
      'red': '#ff0000',
      'blue': '#0000ff',
      'green': '#008000',
      'yellow': '#ffff00',
      'black': '#000000',
      'white': '#ffffff',
      'gray': '#808080',
      'grey': '#808080',
      'purple': '#800080',
      'orange': '#ffa500',
      'pink': '#ffc0cb',
      'brown': '#a52a2a',
    };

    // Return mapped color or original value
    return colorMap[value] || value;
  }

  /**
   * Normalize numeric value with appropriate units
   */
  private normalizeNumericValue(
    value: string,
    unit: string | undefined,
    property: string
  ): string {
    // Extract number from value
    const numMatch = value.match(/^(\d+(?:\.\d+)?)/);
    if (!numMatch) {
      return value; // Not a numeric value
    }

    const num = parseFloat(numMatch[1]!);

    // Determine appropriate unit
    if (unit) {
      return `${num}${unit}`;
    }

    // Auto-detect unit based on property
    if (['zIndex', 'opacity'].includes(property)) {
      return num.toString(); // No unit
    }

    if (['fontSize', 'lineHeight'].includes(property)) {
      return `${num}rem`; // Use rem for typography
    }

    // Default to px for layout properties
    return `${num}px`;
  }

  /**
   * Normalize keyword value
   */
  private normalizeKeywordValue(value: string, property: string): string {
    const keywordMaps: Record<string, Record<string, string>> = {
      textAlign: {
        'left': 'left',
        'center': 'center',
        'middle': 'center',
        'right': 'right',
      },
      fontWeight: {
        'bold': 'bold',
        'normal': 'normal',
        'light': '300',
        'heavy': '900',
        'thick': 'bold',
      },
      display: {
        'block': 'block',
        'inline': 'inline',
        'flex': 'flex',
        'grid': 'grid',
        'none': 'none',
        'hidden': 'none',
      },
    };

    const map = keywordMaps[property];
    return map?.[value] || value;
  }

  /**
   * Validate property change for specific element
   */
  private validateForElement(
    command: PropertyEditCommand,
    element: DOMElement
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      warnings: [],
      errors: [],
      suggestions: [],
    };

    // Element-specific validations
    if (element.tagName.toLowerCase() === 'img' && command.property === 'fontSize') {
      result.warnings.push('Font size does not apply to images');
      result.suggestions.push('Consider using width or height instead');
    }

    if (element.tagName.toLowerCase() === 'input' && command.property === 'backgroundColor') {
      result.warnings.push('Background color on inputs may not display consistently across browsers');
    }

    return result;
  }

  /**
   * Check if property may impact performance
   */
  private isPerformanceHeavyProperty(property: string): boolean {
    const heavyProperties = [
      'boxShadow', 'filter', 'borderRadius',
      'width', 'height', 'top', 'left',
    ];

    return heavyProperties.includes(property);
  }

  /**
   * Get current property value from element
   */
  private getCurrentPropertyValue(element: DOMElement, property: string): string | null {
    return element.computedStyle?.[property] || null;
  }

  /**
   * Apply property change to element (placeholder for actual DOM manipulation)
   */
  private async applyPropertyChange(
    element: DOMElement,
    property: string,
    value: string,
    important: boolean = false
  ): Promise<void> {
    // This is a placeholder - in the actual implementation, this would send
    // commands to the client-side DOM manipulation system

    const styleValue = important ? `${value} !important` : value;

    logger.debug('Applying property change', {
      elementSelector: this.generateElementSelector(element),
      property,
      value: styleValue,
    });

    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 10));

    // In real implementation, this would send a PostMessage to the client:
    // this.postMessage({
    //   type: 'property_change',
    //   selector: this.generateElementSelector(element),
    //   property,
    //   value: styleValue,
    // });
  }

  /**
   * Generate unique selector for element
   */
  private generateElementSelector(element: DOMElement): string {
    if (element.id) {
      return `#${element.id}`;
    }

    if (element.className) {
      const classes = element.className.split(' ').filter(Boolean);
      if (classes.length > 0) {
        return `.${classes.join('.')}`;
      }
    }

    // Fallback to XPath or CSS selector
    return element.cssSelector || element.xpath || `${element.tagName.toLowerCase()}`;
  }

  /**
   * Undo last operation
   */
  async undoLastOperation(): Promise<EditOperation | null> {
    if (this.state.historyIndex < 0) {
      logger.warn('No operations to undo');
      return null;
    }

    const operation = this.state.operationHistory[this.state.historyIndex];
    if (!operation || !operation.undoable) {
      logger.warn('Last operation is not undoable');
      return null;
    }

    try {
      // Reverse all changes in the operation
      for (const change of operation.changes.slice().reverse()) {
        if (change.success && change.oldValue !== null) {
          // Apply the old value back
          await this.applyPropertyChangeBySelector(
            change.elementSelector,
            change.property,
            change.oldValue
          );
        }
      }

      this.state.historyIndex--;

      this.emit('operation_undone', { operation });

      logger.info('Operation undone', {
        operationId: operation.id,
        description: operation.description,
      });

      return operation;
    } catch (error) {
      logger.error('Failed to undo operation', { error, operation });
      throw error;
    }
  }

  /**
   * Redo next operation
   */
  async redoNextOperation(): Promise<EditOperation | null> {
    if (this.state.historyIndex >= this.state.operationHistory.length - 1) {
      logger.warn('No operations to redo');
      return null;
    }

    const operation = this.state.operationHistory[this.state.historyIndex + 1];
    if (!operation) {
      return null;
    }

    try {
      // Reapply all changes in the operation
      for (const change of operation.changes) {
        if (change.success) {
          await this.applyPropertyChangeBySelector(
            change.elementSelector,
            change.property,
            change.newValue
          );
        }
      }

      this.state.historyIndex++;

      this.emit('operation_redone', { operation });

      logger.info('Operation redone', {
        operationId: operation.id,
        description: operation.description,
      });

      return operation;
    } catch (error) {
      logger.error('Failed to redo operation', { error, operation });
      throw error;
    }
  }

  /**
   * Apply property change by selector
   */
  private async applyPropertyChangeBySelector(
    selector: string,
    property: string,
    value: string
  ): Promise<void> {
    // Placeholder for actual DOM manipulation
    logger.debug('Applying property change by selector', { selector, property, value });
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  /**
   * Add operation to history
   */
  private addToHistory(operation: EditOperation): void {
    // Remove any operations after current index (for branching undo/redo)
    this.state.operationHistory = this.state.operationHistory.slice(0, this.state.historyIndex + 1);

    // Add new operation
    this.state.operationHistory.push(operation);
    this.state.historyIndex = this.state.operationHistory.length - 1;

    // Trim history if too large
    if (this.state.operationHistory.length > this.state.maxHistorySize) {
      const removeCount = this.state.operationHistory.length - this.state.maxHistorySize;
      this.state.operationHistory.splice(0, removeCount);
      this.state.historyIndex -= removeCount;
    }

    logger.debug('Operation added to history', {
      operationId: operation.id,
      historySize: this.state.operationHistory.length,
      historyIndex: this.state.historyIndex,
    });
  }

  /**
   * Get operation history
   */
  getOperationHistory(): EditOperation[] {
    return [...this.state.operationHistory];
  }

  /**
   * Get current editor state
   */
  getEditorState(): EditorState {
    return { ...this.state };
  }

  /**
   * Clear operation history
   */
  clearHistory(): void {
    this.state.operationHistory = [];
    this.state.historyIndex = -1;
    logger.info('Operation history cleared');
  }

  /**
   * Set validation mode
   */
  setValidationMode(mode: 'strict' | 'permissive' | 'disabled'): void {
    this.state.validationMode = mode;
    logger.info('Validation mode changed', { mode });
  }
}

// Export singleton instance
export const voicePropertyEditor = new VoicePropertyEditor();