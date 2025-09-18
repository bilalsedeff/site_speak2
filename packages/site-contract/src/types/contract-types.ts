/**
 * Core types for the site contract system
 */

import {
  ComponentPropsDefinition,
  ComponentPropValue,
  JsonLdSchema
} from '../../../../shared/types/core-engine.types';

export interface SiteContract {
  version: string
  generatedAt: string
  baseUrl: string
  
  // Component metadata
  components: Record<string, ComponentContract>
  
  // Action manifest
  actions: ActionManifest
  
  // ARIA audit report
  aria: AriaAuditReport
  
  // JSON-LD structured data
  jsonld: JsonLdReport
  
  // Sitemap information
  sitemap: SitemapInfo
  
  // Performance and accessibility scores
  scores: QualityScores
}

export interface ComponentContract {
  name: string
  version: string
  category: string
  instances: ComponentInstance[]
  metadata: {
    props: ComponentPropsDefinition
    aria: ComponentAriaContract
    jsonld?: ComponentJsonLdContract
    actions?: ComponentActionContract[]
  }
}

export interface ComponentInstance {
  id: string
  selector: string
  props: Record<string, ComponentPropValue>
  location: {
    page: string
    xpath: string
    coordinates?: { x: number; y: number; width: number; height: number }
  }
  rendered: {
    html: string
    jsonld?: JsonLdSchema
    ariaAttributes: Record<string, string | boolean | null>
    actionAttributes: Record<string, string | number | boolean>
  }
}

export interface ComponentAriaContract {
  role?: string
  landmarkRole?: string
  requiredAttributes: string[]
  recommendedAttributes: string[]
  keyboardNavigation: boolean
  focusable: boolean
  liveRegion?: 'polite' | 'assertive' | 'off'
}

export interface ComponentJsonLdContract {
  schemaType: string
  template: JsonLdSchema
  propMapping: Record<string, string>
  conditions?: Record<string, string | number | boolean>
}

export interface ComponentActionContract {
  name: string
  description: string
  category: string
  selector: string
  event: string
  parameters: ActionParameter[]
  security: ActionSecurity
}

export interface ActionParameter {
  name: string
  type: string
  required: boolean
  description?: string
  validation?: {
    min?: number
    max?: number
    pattern?: string
    enum?: string[]
  }
  defaultValue?: ComponentPropValue
}

export interface ActionSecurity {
  requiresConfirmation: boolean
  allowedOrigins?: string[]
  rateLimit?: {
    maxCalls: number
    windowMs: number
  }
  requiresAuthentication: boolean
}

export interface ActionManifest {
  version: string
  lastUpdated: string
  baseUrl: string
  security: {
    csrfProtection: boolean
    allowedOrigins: string[]
    requireAuthentication: string[]
  }
  actions: Record<string, ComponentActionContract[]>
  categories: Record<string, string>
  statistics: {
    totalActions: number
    actionsByCategory: Record<string, number>
    secureActions: number
  }
}

export interface AriaAuditReport {
  version: string
  lastUpdated: string
  score: number // 0-100
  
  // Landmark analysis
  landmarks: {
    present: string[]
    missing: string[]
    duplicates: string[]
    score: number
  }
  
  // Component-level ARIA compliance
  components: Record<string, ComponentAriaAudit>
  
  // Page-level issues
  issues: AriaIssue[]
  
  // Recommendations
  recommendations: AriaRecommendation[]
  
  // Statistics
  statistics: {
    totalElements: number
    compliantElements: number
    elementsWithIssues: number
    criticalIssues: number
    warningIssues: number
  }
}

export interface ComponentAriaAudit {
  componentName: string
  instances: number
  compliant: number
  issues: AriaIssue[]
  score: number
}

export interface AriaIssue {
  type: 'critical' | 'warning' | 'info'
  category: 'landmark' | 'focus' | 'labeling' | 'structure' | 'navigation'
  description: string
  element: {
    selector: string
    tagName: string
    xpath: string
  }
  recommendation: string
  wcagReference?: string
}

export interface AriaRecommendation {
  priority: 'high' | 'medium' | 'low'
  category: string
  description: string
  implementation: string
  impact: string
}

export interface JsonLdReport {
  version: string
  lastUpdated: string
  
  // Schema.org entities found
  entities: JsonLdEntity[]
  
  // Validation results
  validation: {
    valid: number
    invalid: number
    warnings: number
    issues: JsonLdIssue[]
  }
  
  // Coverage analysis
  coverage: {
    pagesWithStructuredData: number
    totalPages: number
    coveragePercentage: number
    entitiesByType: Record<string, number>
  }
  
  // Generated JSON-LD blocks
  blocks: JsonLdBlock[]
}

export interface JsonLdEntity {
  '@type': string
  '@id'?: string
  page: string
  selector: string
  component: string
  data: JsonLdSchema
  validation: {
    valid: boolean
    issues: JsonLdIssue[]
  }
}

export interface JsonLdIssue {
  severity: 'error' | 'warning' | 'info'
  property: string
  description: string
  recommendation: string
  schemaReference?: string
}

export interface JsonLdBlock {
  page: string
  type: string
  content: JsonLdSchema
  position: 'head' | 'body'
  minified: boolean
}

export interface SitemapInfo {
  version: string
  lastUpdated: string
  location: string // URL path to sitemap.xml
  
  // Sitemap entries
  urls: SitemapUrl[]
  
  // Statistics
  statistics: {
    totalUrls: number
    lastModified: string
    updateFrequency: Record<string, number>
    priorityDistribution: Record<string, number>
  }
  
  // Validation
  validation: {
    valid: boolean
    issues: SitemapIssue[]
  }
}

export interface SitemapUrl {
  loc: string
  lastmod?: string
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
  
  // Additional metadata
  metadata: {
    title?: string
    description?: string
    componentCount: number
    hasStructuredData: boolean
    hasActions: boolean
  }
}

export interface SitemapIssue {
  type: 'error' | 'warning'
  url: string
  description: string
  recommendation: string
}

export interface QualityScores {
  overall: number // 0-100
  
  // Individual scores
  accessibility: number // ARIA compliance
  structuredData: number // JSON-LD coverage and quality
  actions: number // Action completeness and security
  performance: number // Core Web Vitals if available
  
  // Detailed breakdown
  breakdown: {
    landmarks: number
    labeling: number
    keyboardNavigation: number
    semanticMarkup: number
    actionSecurity: number
    dataQuality: number
  }
  
  // Recommendations for improvement
  improvements: QualityImprovement[]
}

export interface QualityImprovement {
  category: string
  priority: 'high' | 'medium' | 'low'
  description: string
  impact: string
  effort: 'low' | 'medium' | 'high'
  implementation: string
}

// Site analysis context
export interface SiteAnalysisContext {
  baseUrl: string
  pages: string[]
  components: string[]
  excludePatterns?: string[]
  includePatterns?: string[]
  
  // Analysis options
  options: {
    deep: boolean // Analyze all linked pages
    validateJsonLd: boolean
    checkExternalLinks: boolean
    generateScreenshots: boolean
    includePerformanceMetrics: boolean
  }
}

// Contract generation options
export interface ContractGenerationOptions {
  outputDir: string
  formats: ('json' | 'xml' | 'html')[]
  minify: boolean
  pretty: boolean
  includeSourceMaps: boolean
  
  // File naming
  fileNames: {
    contract: string
    sitemap: string
    manifest: string
  }
  
  // Validation settings
  strict: boolean
  failOnErrors: boolean
  validateAgainstSchemas: boolean
}

// ==================== ENHANCED SITEMAP TYPES ====================

export interface SitemapReport {
  entries: SitemapEntry[]
  xmlSitemap: string
  validationIssues: SitemapValidationIssue[]
  stats: SitemapStats
  generatedAt: Date
  baseUrl: string
}

export interface SitemapEntry {
  loc: string
  lastmod: Date
  changefreq: string
  priority: number
  title: string
  metaDescription: string
  headings: Array<{ level: number; text: string; id?: string }>
  links: Array<{ href: string; text: string; isInternal: boolean; hasTitle: boolean }>
  images: Array<{ src: string; alt: string; hasAlt: boolean; isDecorative: boolean }>
  structuredData: {
    jsonLd: JsonLdSchema[]
    hasMicrodata: boolean
    hasRdfa: boolean
  }
  componentUsage: Record<string, number>
  wordCount: number
  contentScore: number
  hasForm: boolean
  hasNavigation: boolean
  isIndexable: boolean
}

export interface SitemapValidationIssue {
  type: 'error' | 'warning' | 'info'
  severity: 'high' | 'medium' | 'low'
  message: string
  pageUrl: string
  details: Record<string, string | number | boolean | null>
}

export interface SitemapStats {
  totalPages: number
  indexablePages: number
  pagesWithForms: number
  averageContentScore: number
  totalIssues: number
  errorCount: number
  warningCount: number
}

// ==================== ENHANCED ARIA TYPES ====================

export interface EnhancedAriaAuditReport {
  issues: EnhancedAriaIssue[]
  landmarks: AriaLandmark[]
  pageMetrics: Record<string, AccessibilityMetrics>
  overallMetrics: AccessibilityMetrics
  recommendations: string[]
  auditedAt: Date
  baseUrl: string
  wcagVersion: string
  complianceLevel: 'A' | 'AA' | 'AAA' | 'non-compliant'
}

export interface EnhancedAriaIssue {
  type: 'error' | 'warning' | 'info'
  severity: 'high' | 'medium' | 'low'
  rule: string
  message: string
  pageUrl: string
  element: string | null
  wcagLevel: 'A' | 'AA' | 'AAA'
  details: Record<string, string | number | boolean | null>
}

export interface AriaLandmark {
  type: string
  label: string | null
  pageUrl: string
  element: string
}

export interface AccessibilityMetrics {
  totalElements: number
  interactiveElements: number
  accessibleNameCoverage: number
  totalIssues: number
  errorCount: number
  warningCount: number
  accessibilityScore: number
  wcagComplianceLevel: 'A' | 'AA' | 'AAA' | 'non-compliant'
}