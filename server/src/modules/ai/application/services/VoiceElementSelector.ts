/**
 * Voice Element Selector - Natural language element targeting
 *
 * Handles voice commands for element selection and property editing:
 * - Natural language element description parsing ("the red button", "navigation menu")
 * - DOM element matching with fuzzy logic and scoring
 * - Context-aware element selection within editor scope
 * - Property extraction and validation for editing commands
 * - Visual feedback for selected elements
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../../../shared/utils';
import OpenAI from 'openai';
import { config } from '../../../../infrastructure/config/index.js';

const logger = createLogger({ service: 'voice-element-selector' });

export interface ElementDescriptor {
  type?: string;           // 'button', 'input', 'div', etc.
  text?: string;          // visible text content
  className?: string;     // CSS class names
  id?: string;           // element ID
  role?: string;         // ARIA role
  color?: string;        // color description
  position?: string;     // 'top', 'bottom', 'left', 'right'
  context?: string;      // surrounding context
  attributes?: Record<string, string>;
}

export interface ElementMatch {
  element: DOMElement;
  score: number;
  confidence: number;
  reasoning: string;
  properties: ElementProperties;
}

export interface DOMElement {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  attributes: Record<string, string>;
  computedStyle?: Record<string, string>;
  boundingRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  xpath?: string;
  cssSelector?: string;
}

export interface ElementProperties {
  backgroundColor?: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
  width?: string;
  height?: string;
  margin?: string;
  padding?: string;
  border?: string;
  display?: string;
  position?: string;
  zIndex?: string;
  opacity?: string;
  textAlign?: string;
  [key: string]: string | undefined;
}

export interface PropertyEditCommand {
  property: string;
  value: string;
  unit?: string;
  action: 'set' | 'add' | 'remove' | 'toggle';
  important?: boolean;
}

export interface SelectionContext {
  mode: 'editor' | 'preview' | 'design';
  activePanel?: string;
  selectedElements?: DOMElement[];
  viewport?: {
    width: number;
    height: number;
    zoom: number;
  };
  constraints?: {
    allowedTags?: string[];
    forbiddenTags?: string[];
    maxDepth?: number;
  };
}

/**
 * Voice-controlled element selection and property editing
 */
export class VoiceElementSelector extends EventEmitter {
  private openai: OpenAI;
  private isInitialized = false;
  private cachedElements = new Map<string, DOMElement[]>();
  private selectionHistory: ElementMatch[] = [];
  private contextStack: SelectionContext[] = [];

  constructor() {
    super();
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
    });
    this.initialize();
  }

  /**
   * Initialize the element selector
   */
  private async initialize(): Promise<void> {
    try {
      this.isInitialized = true;
      logger.info('VoiceElementSelector initialized');
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize VoiceElementSelector', { error });
      throw error;
    }
  }

  /**
   * Parse natural language element description
   */
  async parseElementDescription(
    description: string,
    context: SelectionContext
  ): Promise<ElementDescriptor> {
    try {
      logger.debug('Parsing element description', { description, context });

      const prompt = `Parse this natural language element description into structured data:
"${description}"

Context: ${context.mode} mode, active panel: ${context.activePanel || 'none'}

Extract:
- type: HTML tag or element type (button, input, text, image, etc.)
- text: any visible text mentioned
- className: CSS class hints from description
- color: any color mentioned (red, blue, dark, light, etc.)
- position: relative position (top, bottom, left, right, first, last)
- role: ARIA role or semantic meaning
- attributes: any other attributes mentioned

Return as JSON object with only the properties that are clearly mentioned.
Be conservative - only include properties you're confident about.

Examples:
"the red submit button" → {"type": "button", "color": "red", "text": "submit"}
"navigation menu" → {"type": "nav", "role": "navigation"}
"first input field" → {"type": "input", "position": "first"}`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at parsing natural language descriptions of UI elements. Return only valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
      });

      const result = completion.choices[0]?.message?.content;
      if (!result) {
        throw new Error('No parsing result received');
      }

      const descriptor = JSON.parse(result) as ElementDescriptor;

      logger.info('Element description parsed', {
        description,
        descriptor,
        confidence: this.calculateDescriptorConfidence(descriptor),
      });

      return descriptor;
    } catch (error) {
      logger.error('Failed to parse element description', { error, description });

      // Fallback to simple keyword extraction
      return this.extractSimpleDescriptor(description);
    }
  }

  /**
   * Simple fallback descriptor extraction
   */
  private extractSimpleDescriptor(description: string): ElementDescriptor {
    const lower = description.toLowerCase();
    const descriptor: ElementDescriptor = {};

    // Extract type
    const typePatterns = {
      button: /button|btn|submit|click/,
      input: /input|field|textbox|text/,
      link: /link|anchor|href/,
      image: /image|img|picture/,
      text: /text|paragraph|heading|title/,
      div: /box|container|panel|section/,
      nav: /nav|menu|navigation/,
    };

    for (const [type, pattern] of Object.entries(typePatterns)) {
      if (pattern.test(lower)) {
        descriptor.type = type;
        break;
      }
    }

    // Extract color
    const colors = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'gray', 'purple', 'orange'];
    for (const color of colors) {
      if (lower.includes(color)) {
        descriptor.color = color;
        break;
      }
    }

    // Extract position
    const positions = ['first', 'last', 'top', 'bottom', 'left', 'right'];
    for (const position of positions) {
      if (lower.includes(position)) {
        descriptor.position = position;
        break;
      }
    }

    // Extract text content (simple approach)
    const textMatch = description.match(/"([^"]+)"/);
    if (textMatch) {
      descriptor.text = textMatch[1];
    }

    logger.debug('Simple descriptor extracted', { description, descriptor });
    return descriptor;
  }

  /**
   * Find elements matching the descriptor
   */
  async findMatchingElements(
    descriptor: ElementDescriptor,
    domElements: DOMElement[],
    context: SelectionContext
  ): Promise<ElementMatch[]> {
    try {
      logger.debug('Finding matching elements', { descriptor, elementCount: domElements.length });

      const matches: ElementMatch[] = [];

      for (const element of domElements) {
        const score = this.calculateElementScore(descriptor, element, context);

        if (score > 0.1) { // Only include reasonably good matches
          const match: ElementMatch = {
            element,
            score,
            confidence: this.calculateConfidence(descriptor, element, score),
            reasoning: this.generateReasoning(descriptor, element, score),
            properties: this.extractElementProperties(element),
          };

          matches.push(match);
        }
      }

      // Sort by score (descending)
      matches.sort((a, b) => b.score - a.score);

      // Limit to top 10 matches
      const topMatches = matches.slice(0, 10);

      logger.info('Element matching completed', {
        descriptor,
        totalElements: domElements.length,
        matchCount: topMatches.length,
        topScore: topMatches[0]?.score || 0,
      });

      return topMatches;
    } catch (error) {
      logger.error('Failed to find matching elements', { error, descriptor });
      return [];
    }
  }

  /**
   * Calculate element matching score
   */
  private calculateElementScore(
    descriptor: ElementDescriptor,
    element: DOMElement,
    context: SelectionContext
  ): number {
    let score = 0;
    const weights = {
      type: 0.3,
      text: 0.25,
      color: 0.2,
      className: 0.15,
      id: 0.1,
      position: 0.1,
      role: 0.1,
    };

    // Type matching
    if (descriptor.type) {
      if (element.tagName.toLowerCase() === descriptor.type.toLowerCase()) {
        score += weights.type;
      } else if (this.isSemanticMatch(descriptor.type, element)) {
        score += weights.type * 0.7;
      }
    }

    // Text content matching
    if (descriptor.text && element.textContent) {
      const similarity = this.calculateTextSimilarity(descriptor.text, element.textContent);
      score += weights.text * similarity;
    }

    // Color matching (basic implementation)
    if (descriptor.color && element.computedStyle) {
      const colorScore = this.calculateColorMatch(descriptor.color, element.computedStyle);
      score += weights.color * colorScore;
    }

    // Class name matching
    if (descriptor.className && element.className) {
      const classScore = this.calculateClassSimilarity(descriptor.className, element.className);
      score += weights.className * classScore;
    }

    // ID matching
    if (descriptor.id && element.id) {
      const idScore = this.calculateTextSimilarity(descriptor.id, element.id);
      score += weights.id * idScore;
    }

    // Role matching
    if (descriptor.role && element.attributes['role']) {
      if (descriptor.role === element.attributes['role']) {
        score += weights.role;
      }
    }

    // Position-based adjustments
    if (descriptor.position) {
      const positionScore = this.calculatePositionScore(descriptor.position, element, context);
      score += weights.position * positionScore;
    }

    // Context-based boosts
    score = this.applyContextualBoosts(score, element, context);

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Check semantic matching between descriptor type and element
   */
  private isSemanticMatch(descriptorType: string, element: DOMElement): boolean {
    const semanticMap: Record<string, string[]> = {
      button: ['input[type="button"]', 'input[type="submit"]', 'a', 'span[role="button"]'],
      link: ['a', 'button', 'span[role="link"]'],
      text: ['p', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      input: ['input', 'textarea', 'select'],
      image: ['img', 'svg', 'picture'],
      menu: ['nav', 'ul', 'ol', 'div[role="menu"]'],
    };

    const tagName = element.tagName.toLowerCase();
    const candidates = semanticMap[descriptorType.toLowerCase()] || [];

    return candidates.some(candidate => {
      if (candidate.includes('[')) {
        // Handle attribute selectors like input[type="button"]
        const [tag, attr] = candidate.split('[');
        if (tagName !== tag) {return false;}

        const [attrName, attrValue] = attr.replace(']', '').split('=');
        const expectedValue = attrValue?.replace(/"/g, '');
        return element.attributes[attrName!] === expectedValue;
      } else {
        return tagName === candidate;
      }
    });
  }

  /**
   * Calculate text similarity using simple string matching
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const t1 = text1.toLowerCase().trim();
    const t2 = text2.toLowerCase().trim();

    if (t1 === t2) {return 1.0;}
    if (t2.includes(t1) || t1.includes(t2)) {return 0.8;}

    // Simple word matching
    const words1 = t1.split(/\s+/);
    const words2 = t2.split(/\s+/);

    let matchingWords = 0;
    for (const word1 of words1) {
      if (words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
        matchingWords++;
      }
    }

    return matchingWords / Math.max(words1.length, words2.length);
  }

  /**
   * Calculate color matching score
   */
  private calculateColorMatch(descriptorColor: string, computedStyle: Record<string, string>): number {
    const colorMap: Record<string, string[]> = {
      red: ['red', '#ff', '#f0', '#e0', 'rgb(255', 'rgb(240', 'rgb(224'],
      blue: ['blue', '#00', '#0f', '#06', 'rgb(0', 'rgb(15', 'rgb(68'],
      green: ['green', '#0f', '#2e', '#28', 'rgb(0', 'rgb(46', 'rgb(40'],
      black: ['black', '#000', '#111', '#222', 'rgb(0,0,0)', 'rgb(17', 'rgb(34'],
      white: ['white', '#fff', '#fef', '#faf', 'rgb(255,255,255)', 'rgb(254', 'rgb(250'],
      gray: ['gray', 'grey', '#777', '#888', '#999', 'rgb(119', 'rgb(136', 'rgb(153'],
    };

    const colorTargets = colorMap[descriptorColor.toLowerCase()] || [descriptorColor];

    const styleValues = [
      computedStyle['backgroundColor'],
      computedStyle['color'],
      computedStyle['borderColor'],
    ].filter(Boolean);

    for (const value of styleValues) {
      for (const target of colorTargets) {
        if (value!.toLowerCase().includes(target.toLowerCase())) {
          return 1.0;
        }
      }
    }

    return 0;
  }

  /**
   * Calculate class name similarity
   */
  private calculateClassSimilarity(descriptorClass: string, elementClass: string): number {
    const descClasses = descriptorClass.toLowerCase().split(/\s+/);
    const elemClasses = elementClass.toLowerCase().split(/\s+/);

    let matches = 0;
    for (const descClass of descClasses) {
      if (elemClasses.some(elemClass =>
        elemClass.includes(descClass) || descClass.includes(elemClass)
      )) {
        matches++;
      }
    }

    return matches / Math.max(descClasses.length, elemClasses.length);
  }

  /**
   * Calculate position-based score
   */
  private calculatePositionScore(
    position: string,
    element: DOMElement,
    context: SelectionContext
  ): number {
    if (!element.boundingRect) {return 0;}

    const viewport = context.viewport || { width: 1920, height: 1080, zoom: 1 };
    const rect = element.boundingRect;

    switch (position.toLowerCase()) {
      case 'top':
        return 1 - (rect.y / viewport.height);
      case 'bottom':
        return rect.y / viewport.height;
      case 'left':
        return 1 - (rect.x / viewport.width);
      case 'right':
        return rect.x / viewport.width;
      case 'first':
        // Prioritize elements higher up and to the left
        return 1 - ((rect.y + rect.x) / (viewport.height + viewport.width));
      case 'last':
        // Prioritize elements lower down and to the right
        return (rect.y + rect.x) / (viewport.height + viewport.width);
      default:
        return 0;
    }
  }

  /**
   * Apply contextual scoring boosts
   */
  private applyContextualBoosts(
    score: number,
    element: DOMElement,
    context: SelectionContext
  ): number {
    let boostedScore = score;

    // Boost for editor mode constraints
    if (context.constraints) {
      if (context.constraints.allowedTags) {
        if (!context.constraints.allowedTags.includes(element.tagName.toLowerCase())) {
          boostedScore *= 0.5; // Penalize disallowed tags
        }
      }

      if (context.constraints.forbiddenTags) {
        if (context.constraints.forbiddenTags.includes(element.tagName.toLowerCase())) {
          boostedScore *= 0.1; // Heavy penalty for forbidden tags
        }
      }
    }

    // Boost for interactive elements in editor mode
    if (context.mode === 'editor') {
      const interactiveTags = ['button', 'input', 'select', 'textarea', 'a'];
      if (interactiveTags.includes(element.tagName.toLowerCase())) {
        boostedScore *= 1.2;
      }
    }

    return boostedScore;
  }

  /**
   * Calculate confidence based on match quality
   */
  private calculateConfidence(
    descriptor: ElementDescriptor,
    element: DOMElement,
    score: number
  ): number {
    let confidence = score;

    // Boost confidence for exact matches
    if (descriptor.id && element.id === descriptor.id) {
      confidence = Math.min(confidence + 0.3, 1.0);
    }

    if (descriptor.text && element.textContent === descriptor.text) {
      confidence = Math.min(confidence + 0.2, 1.0);
    }

    // Reduce confidence for ambiguous descriptors
    const descriptorFields = Object.keys(descriptor).length;
    if (descriptorFields < 2) {
      confidence *= 0.8; // Reduce confidence for vague descriptions
    }

    return confidence;
  }

  /**
   * Generate human-readable reasoning for the match
   */
  private generateReasoning(
    descriptor: ElementDescriptor,
    element: DOMElement,
    score: number
  ): string {
    const reasons: string[] = [];

    if (descriptor.type && element.tagName.toLowerCase() === descriptor.type.toLowerCase()) {
      reasons.push(`matches type "${descriptor.type}"`);
    }

    if (descriptor.text && element.textContent?.includes(descriptor.text)) {
      reasons.push(`contains text "${descriptor.text}"`);
    }

    if (descriptor.id && element.id === descriptor.id) {
      reasons.push(`exact ID match "${descriptor.id}"`);
    }

    if (descriptor.className && element.className?.includes(descriptor.className)) {
      reasons.push(`has class "${descriptor.className}"`);
    }

    if (reasons.length === 0) {
      reasons.push('semantic similarity');
    }

    return `Score ${(score * 100).toFixed(1)}%: ${reasons.join(', ')}`;
  }

  /**
   * Extract element properties for editing
   */
  private extractElementProperties(element: DOMElement): ElementProperties {
    const properties: ElementProperties = {};

    if (element.computedStyle) {
      // Copy relevant CSS properties
      const relevantProps = [
        'backgroundColor', 'color', 'fontSize', 'fontWeight',
        'width', 'height', 'margin', 'padding', 'border',
        'display', 'position', 'zIndex', 'opacity', 'textAlign',
      ];

      for (const prop of relevantProps) {
        if (element.computedStyle[prop]) {
          properties[prop] = element.computedStyle[prop];
        }
      }
    }

    return properties;
  }

  /**
   * Calculate descriptor confidence
   */
  private calculateDescriptorConfidence(descriptor: ElementDescriptor): number {
    let confidence = 0.5; // Base confidence

    // Boost for specific properties
    if (descriptor.id) {confidence += 0.3;}
    if (descriptor.text) {confidence += 0.2;}
    if (descriptor.type) {confidence += 0.15;}
    if (descriptor.className) {confidence += 0.1;}
    if (descriptor.color) {confidence += 0.1;}

    return Math.min(confidence, 1.0);
  }

  /**
   * Parse property editing command
   */
  async parsePropertyEditCommand(
    command: string,
    targetElement: ElementMatch
  ): Promise<PropertyEditCommand[]> {
    try {
      const prompt = `Parse this property editing command for a ${targetElement.element.tagName} element:
"${command}"

Current element properties:
${JSON.stringify(targetElement.properties, null, 2)}

Extract CSS property changes as JSON array of objects with:
- property: CSS property name (camelCase)
- value: new value
- unit: unit if applicable (px, %, em, etc.)
- action: "set", "add", "remove", or "toggle"
- important: boolean if !important should be added

Examples:
"make it red" → [{"property": "color", "value": "red", "action": "set"}]
"change background to blue" → [{"property": "backgroundColor", "value": "blue", "action": "set"}]
"make it bigger" → [{"property": "fontSize", "value": "120%", "unit": "%", "action": "set"}]
"add 10px margin" → [{"property": "margin", "value": "10", "unit": "px", "action": "set"}]

Return only valid JSON array.`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at parsing CSS property editing commands. Return only valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 400,
        temperature: 0.1,
      });

      const result = completion.choices[0]?.message?.content;
      if (!result) {
        throw new Error('No command parsing result received');
      }

      const commands = JSON.parse(result) as PropertyEditCommand[];

      logger.info('Property edit command parsed', {
        command,
        elementTag: targetElement.element.tagName,
        commands,
      });

      return commands;
    } catch (error) {
      logger.error('Failed to parse property edit command', { error, command });
      return [];
    }
  }

  /**
   * Get selection history
   */
  getSelectionHistory(): ElementMatch[] {
    return [...this.selectionHistory];
  }

  /**
   * Clear selection history
   */
  clearSelectionHistory(): void {
    this.selectionHistory = [];
    logger.debug('Selection history cleared');
  }

  /**
   * Add to selection history
   */
  addToHistory(match: ElementMatch): void {
    this.selectionHistory.unshift(match);

    // Keep only last 20 selections
    if (this.selectionHistory.length > 20) {
      this.selectionHistory = this.selectionHistory.slice(0, 20);
    }
  }

  /**
   * Push selection context
   */
  pushContext(context: SelectionContext): void {
    this.contextStack.push(context);
    logger.debug('Selection context pushed', {
      context,
      stackDepth: this.contextStack.length
    });
  }

  /**
   * Pop selection context
   */
  popContext(): SelectionContext | undefined {
    const context = this.contextStack.pop();
    logger.debug('Selection context popped', {
      context,
      stackDepth: this.contextStack.length
    });
    return context;
  }

  /**
   * Get current context
   */
  getCurrentContext(): SelectionContext | undefined {
    return this.contextStack[this.contextStack.length - 1];
  }
}

// Export singleton instance
export const voiceElementSelector = new VoiceElementSelector();