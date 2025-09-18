/**
 * Core engine types to replace 'any' usage throughout the system
 * These types provide proper type safety for AI orchestration, voice processing, and DOM operations
 */

// ==================== TOOL RESULT TYPES ====================

export interface ToolResult<TOutput = unknown> {
  toolName: string;
  input: ToolInput;
  output: TOutput;
  success: boolean;
  error?: string;
  executionTime?: number;
  metadata?: ToolExecutionMetadata;
}

export interface ToolInput {
  [key: string]: ToolParameterValue;
}

export type ToolParameterValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ToolParameterValue[]
  | { [key: string]: ToolParameterValue };

export interface ToolExecutionMetadata {
  startTime: number;
  endTime: number;
  retryCount?: number;
  warnings?: string[];
  debugInfo?: Record<string, string | number | boolean>;
}

// ==================== ACTION PLAN TYPES ====================

export interface ActionPlan {
  actions: ActionPlanItem[];
  reasoning: string;
  estimatedDuration?: number;
  riskAssessment: ActionRiskAssessment;
  dependencies?: ActionDependency[];
}

export interface ActionPlanItem {
  actionName: string;
  parameters: ActionParameters;
  reasoning: string;
  riskLevel: ActionRiskLevel;
  priority?: number;
  dependsOn?: string[];
  confirmation?: ActionConfirmation;
}

export interface ActionParameters {
  [key: string]: ActionParameterValue;
}

export type ActionParameterValue =
  | string
  | number
  | boolean
  | null
  | ActionParameterValue[]
  | { [key: string]: ActionParameterValue };

export type ActionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ActionRiskAssessment {
  overallRisk: ActionRiskLevel;
  riskFactors: string[];
  mitigations: string[];
  requiresConfirmation: boolean;
}

export interface ActionDependency {
  actionName: string;
  dependsOn: string;
  relationship: 'sequential' | 'parallel' | 'conditional';
}

export interface ActionConfirmation {
  required: boolean;
  message: string;
  timeout?: number;
}

// ==================== DOM ELEMENT TYPES ====================

export interface DOMElement {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  attributes: DOMElementAttributes;
  computedStyle: DOMComputedStyle;
  boundingRect: DOMBoundingRect;
  cssSelector: string;
  xpath?: string;
  children?: DOMElement[];
  parent?: string; // selector of parent
}

export interface DOMElementAttributes {
  [attributeName: string]: string | number | boolean | null;
}

export interface DOMComputedStyle {
  backgroundColor?: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
  display?: string;
  position?: string;
  zIndex?: string;
  opacity?: string;
  transform?: string;
  visibility?: string;
  [property: string]: string | undefined;
}

export interface DOMBoundingRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
}

// ==================== VOICE ACTION CHANGE TYPES ====================

export interface VoiceActionChange {
  type: VoiceActionChangeType;
  target: VoiceActionTarget;
  before: VoiceActionValue;
  after: VoiceActionValue;
  timestamp: number;
  reversible: boolean;
  metadata?: VoiceActionChangeMetadata;
}

export type VoiceActionChangeType =
  | 'property_update'
  | 'element_selection'
  | 'navigation'
  | 'content_edit'
  | 'style_change'
  | 'structure_change';

export interface VoiceActionTarget {
  selector: string;
  elementType: string;
  elementId?: string;
  path?: string[];
}

export type VoiceActionValue =
  | string
  | number
  | boolean
  | null
  | VoiceActionObject
  | VoiceActionValue[];

export interface VoiceActionObject {
  [key: string]: VoiceActionValue;
}

export interface VoiceActionChangeMetadata {
  reason?: string;
  confidence?: number;
  userId?: string;
  sessionId?: string;
  source: 'voice' | 'ai' | 'manual';
}

// ==================== JSON-LD SCHEMA TYPES ====================

export interface JsonLdContext {
  [key: string]: string | JsonLdContextDefinition;
}

export interface JsonLdContextDefinition {
  '@id': string;
  '@type'?: string;
  '@language'?: string;
  '@container'?: string;
}

export type JsonLdValue =
  | string
  | string[]
  | number
  | boolean
  | null
  | JsonLdSchema
  | JsonLdContext
  | JsonLdValue[];

export interface JsonLdSchema {
  '@context'?: JsonLdValue;
  '@type': JsonLdValue;
  '@id'?: string;
  [property: string]: JsonLdValue;
}

// ==================== AI TOOL CALLING RESULT TYPES ====================

export interface AIToolCallingResult {
  toolCalls: AIToolCall[];
  reasoning: string;
  confidence: number;
  processing: AIProcessingMetadata;
  followUp?: AIFollowUpSuggestion[];
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: AIToolArguments;
  result?: AIToolCallResult;
  error?: AIToolCallError;
  metadata: AIToolCallMetadata;
}

export interface AIToolArguments {
  [argumentName: string]: AIArgumentValue;
}

export type AIArgumentValue =
  | string
  | number
  | boolean
  | null
  | AIArgumentValue[]
  | { [key: string]: AIArgumentValue };

export interface AIToolCallResult {
  success: boolean;
  data: AIResultData;
  messages?: string[];
  warnings?: string[];
}

export type AIResultData =
  | string
  | number
  | boolean
  | null
  | AIResultObject
  | AIResultData[];

export interface AIResultObject {
  [key: string]: AIResultData;
}

export interface AIToolCallError {
  code: string;
  message: string;
  details?: AIErrorDetails;
  retryable: boolean;
}

export interface AIErrorDetails {
  [key: string]: string | number | boolean | null;
}

export interface AIToolCallMetadata {
  executionTime: number;
  model?: string;
  tokensUsed?: number;
  retryCount?: number;
  cacheHit?: boolean;
}

export interface AIProcessingMetadata {
  totalTime: number;
  modelLatency: number;
  toolExecutionTime: number;
  tokensUsed: number;
  model: string;
  temperature?: number;
}

export interface AIFollowUpSuggestion {
  text: string;
  confidence: number;
  actionType?: string;
  reasoning?: string;
}

// ==================== VOICE COMMAND EXECUTION TYPES ====================

export interface VoiceCommandParameters {
  [parameterName: string]: VoiceParameterValue;
}

export type VoiceParameterValue =
  | string
  | number
  | boolean
  | null
  | VoiceParameterValue[]
  | { [key: string]: VoiceParameterValue };

export interface VoiceExecutionResult {
  success: boolean;
  result: VoiceResultData;
  changes?: VoiceActionChange[];
  feedback?: VoiceVisualFeedback[];
  suggestions?: string[];
  metadata: VoiceExecutionMetadata;
}

export type VoiceResultData =
  | string
  | number
  | boolean
  | null
  | VoiceResultObject
  | VoiceResultData[]
  | Record<string, unknown>; // Allow for complex objects that don't fit the strict structure

export interface VoiceResultObject {
  [key: string]: VoiceResultData;
}

export interface VoiceVisualFeedback {
  type: 'highlight' | 'animate' | 'overlay' | 'toast' | 'cursor' | 'selection';
  target: string;
  duration: number;
  style?: VoiceVisualStyle;
  message?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface VoiceVisualStyle {
  [property: string]: string | number;
}

export interface VoiceExecutionMetadata {
  executionTime: number;
  confidence: number;
  actionType: string;
  userId?: string;
  sessionId: string;
  source: 'voice' | 'ai' | 'manual';
}

// ==================== SITE CONTRACT CONFIGURATION TYPES ====================

export interface SiteContractConfiguration {
  components: ComponentConfiguration[];
  actions: ActionConfiguration[];
  aria: AriaConfiguration;
  jsonld: JsonLdConfiguration;
  sitemap: SitemapConfiguration;
  metadata: ContractMetadata;
}

export interface ComponentConfiguration {
  name: string;
  version: string;
  category: string;
  props: ComponentPropsDefinition;
  metadata: ComponentConfigurationMetadata;
}

export interface ComponentPropsDefinition {
  [propName: string]: ComponentPropDefinition;
}

export interface ComponentPropDefinition {
  type: ComponentPropType;
  required: boolean;
  defaultValue?: ComponentPropValue;
  description?: string;
  validation?: ComponentPropValidation;
}

export type ComponentPropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'enum'
  | 'date'
  | 'color'
  | 'url';

export type ComponentPropValue =
  | string
  | number
  | boolean
  | null
  | ComponentPropValue[]
  | { [key: string]: ComponentPropValue };

export interface ComponentPropValidation {
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
  custom?: string; // Custom validation function name
}

export interface ComponentConfigurationMetadata {
  description?: string;
  examples?: ComponentPropValue[];
  deprecated?: boolean;
  replacedBy?: string;
  category?: string;
}

export interface ActionConfiguration {
  name: string;
  description: string;
  category: string;
  parameters: ActionParameterConfiguration[];
  security: ActionSecurityConfiguration;
  metadata: ActionConfigurationMetadata;
}

export interface ActionParameterConfiguration {
  name: string;
  type: ActionParameterType;
  required: boolean;
  description?: string;
  validation?: ActionParameterValidation;
  defaultValue?: ActionParameterValue;
}

export type ActionParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'selector'
  | 'coordinates'
  | 'color'
  | 'url';

export interface ActionParameterValidation {
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
  customValidator?: string;
}

export interface ActionSecurityConfiguration {
  requiresConfirmation: boolean;
  allowedOrigins?: string[];
  rateLimit?: ActionRateLimit;
  requiresAuthentication: boolean;
  permissions?: string[];
}

export interface ActionRateLimit {
  maxCalls: number;
  windowMs: number;
  skipOnSuccess?: boolean;
}

export interface ActionConfigurationMetadata {
  examples?: ActionParameterValue[];
  riskLevel?: ActionRiskLevel;
  category?: string;
  version?: string;
}

export interface AriaConfiguration {
  strictMode: boolean;
  landmarkValidation: boolean;
  colorContrastMinimum: number;
  keyboardNavigationRequired: boolean;
  customRules?: AriaCustomRule[];
}

export interface AriaCustomRule {
  name: string;
  selector: string;
  validation: AriaValidationType;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export type AriaValidationType = 'required' | 'forbidden' | 'conditional' | 'custom';

export interface JsonLdConfiguration {
  enableValidation: boolean;
  strictSchemaValidation: boolean;
  allowedTypes: string[];
  customTypes?: JsonLdCustomType[];
  minificationEnabled: boolean;
}

export interface JsonLdCustomType {
  type: string;
  schema: JsonLdSchema;
  validation?: JsonLdValidationRule[];
}

export interface JsonLdValidationRule {
  property: string;
  rule: 'required' | 'unique' | 'format' | 'custom';
  value?: string;
  message?: string;
}

export interface SitemapConfiguration {
  autoGenerate: boolean;
  includeImages: boolean;
  maxUrls: number;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
  excludePatterns?: string[];
}

export interface ContractMetadata {
  version: string;
  generatedAt: Date;
  generatedBy: string;
  environment: 'development' | 'staging' | 'production';
  build?: string;
  checksum?: string;
}

// ==================== TYPE GUARDS ====================

export function isToolResult(value: unknown): value is ToolResult {
  return typeof value === 'object' &&
         value !== null &&
         'toolName' in value &&
         'success' in value &&
         typeof (value as any).toolName === 'string' &&
         typeof (value as any).success === 'boolean';
}

export function isActionPlanItem(value: unknown): value is ActionPlanItem {
  return typeof value === 'object' &&
         value !== null &&
         'actionName' in value &&
         'parameters' in value &&
         'riskLevel' in value &&
         typeof (value as any).actionName === 'string';
}

export function isDOMElement(value: unknown): value is DOMElement {
  return typeof value === 'object' &&
         value !== null &&
         'tagName' in value &&
         'cssSelector' in value &&
         typeof (value as any).tagName === 'string' &&
         typeof (value as any).cssSelector === 'string';
}

export function isVoiceActionChange(value: unknown): value is VoiceActionChange {
  return typeof value === 'object' &&
         value !== null &&
         'type' in value &&
         'target' in value &&
         'timestamp' in value &&
         typeof (value as any).type === 'string' &&
         typeof (value as any).timestamp === 'number';
}

export function isJsonLdSchema(value: unknown): value is JsonLdSchema {
  return typeof value === 'object' &&
         value !== null &&
         '@type' in value &&
         (typeof (value as any)['@type'] === 'string' || Array.isArray((value as any)['@type']));
}

// ==================== UTILITY TYPES ====================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type NonNullable<T> = T extends null | undefined ? never : T;

export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;