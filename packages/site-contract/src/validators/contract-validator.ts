import { 
  SiteContract,
  ComponentContract,
  ActionManifest,
  JsonLdReport,
  EnhancedAriaAuditReport
} from '../types/contract-types';

/**
 * Validation results for site contracts
 */
export interface ContractValidationResult {
  valid: boolean;
  errors: ContractValidationError[];
  warnings: ContractValidationWarning[];
  score: number; // 0-100
  details: {
    components: ComponentValidationSummary;
    actions: ActionValidationSummary;
    jsonld: JsonLdValidationSummary;
    sitemap: SitemapValidationSummary;
    accessibility: AccessibilityValidationSummary;
  };
}

export interface ContractValidationError {
  type: 'structure' | 'content' | 'compliance' | 'security';
  severity: 'critical' | 'high' | 'medium';
  message: string;
  location: string;
  details: Record<string, any>;
  recommendation: string;
}

export interface ContractValidationWarning {
  type: 'optimization' | 'best-practice' | 'compatibility';
  message: string;
  location: string;
  details: Record<string, any>;
  recommendation: string;
}

export interface ComponentValidationSummary {
  totalComponents: number;
  validComponents: number;
  missingMetadata: string[];
  invalidStructure: string[];
  score: number;
}

export interface ActionValidationSummary {
  totalActions: number;
  secureActions: number;
  missingValidation: string[];
  securityIssues: string[];
  score: number;
}

export interface JsonLdValidationSummary {
  totalBlocks: number;
  validBlocks: number;
  schemaCompliance: number;
  missingRequiredFields: string[];
  score: number;
}

export interface SitemapValidationSummary {
  totalPages: number;
  indexablePages: number;
  seoIssues: number;
  structureProblems: string[];
  score: number;
}

export interface AccessibilityValidationSummary {
  wcagCompliance: 'A' | 'AA' | 'AAA' | 'non-compliant';
  criticalIssues: number;
  accessibilityScore: number;
  missingLandmarks: string[];
  score: number;
}

/**
 * Contract validator for comprehensive site contract validation
 * 
 * Validates the entire site contract for completeness, compliance,
 * and quality according to web standards and best practices.
 */
export class ContractValidator {
  private strictMode: boolean;

  constructor(options: { strictMode?: boolean } = {}) {
    this.strictMode = options.strictMode ?? false;
  }

  /**
   * Get strict mode setting
   */
  public isStrictMode(): boolean {
    return this.strictMode;
  }

  /**
   * Validate a complete site contract
   */
  async validateContract(contract: SiteContract): Promise<ContractValidationResult> {
    const errors: ContractValidationError[] = [];
    const warnings: ContractValidationWarning[] = [];

    // Validate contract structure
    const structureValidation = this.validateStructure(contract);
    errors.push(...structureValidation.errors);
    warnings.push(...structureValidation.warnings);

    // Validate components
    const componentsValidation = this.validateComponents(contract.components);
    errors.push(...componentsValidation.errors);
    warnings.push(...componentsValidation.warnings);

    // Validate actions
    const actionsValidation = this.validateActions(contract.actions);
    errors.push(...actionsValidation.errors);
    warnings.push(...actionsValidation.warnings);

    // Validate JSON-LD
    const jsonldValidation = this.validateJsonLd(contract.jsonld);
    errors.push(...jsonldValidation.errors);
    warnings.push(...jsonldValidation.warnings);

    // Validate sitemap
    const sitemapValidation = this.validateSitemap(contract.sitemap);
    errors.push(...sitemapValidation.errors);
    warnings.push(...sitemapValidation.warnings);

    // Validate accessibility
    const accessibilityValidation = this.validateAccessibility(contract.aria as unknown as EnhancedAriaAuditReport);
    errors.push(...accessibilityValidation.errors);
    warnings.push(...accessibilityValidation.warnings);

    // Calculate overall score
    const score = this.calculateOverallScore({
      components: componentsValidation.summary,
      actions: actionsValidation.summary,
      jsonld: jsonldValidation.summary,
      sitemap: sitemapValidation.summary,
      accessibility: accessibilityValidation.summary
    });

    return {
      valid: errors.filter(e => e.severity === 'critical').length === 0,
      errors,
      warnings,
      score,
      details: {
        components: componentsValidation.summary,
        actions: actionsValidation.summary,
        jsonld: jsonldValidation.summary,
        sitemap: sitemapValidation.summary,
        accessibility: accessibilityValidation.summary
      }
    };
  }

  /**
   * Validate contract structure
   */
  private validateStructure(contract: SiteContract): {
    errors: ContractValidationError[];
    warnings: ContractValidationWarning[];
  } {
    const errors: ContractValidationError[] = [];
    const warnings: ContractValidationWarning[] = [];

    // Check required fields
    if (!contract.version) {
      errors.push({
        type: 'structure',
        severity: 'critical',
        message: 'Contract missing version field',
        location: 'contract.version',
        details: {},
        recommendation: 'Add version field to site contract'
      });
    }

    if (!contract.baseUrl) {
      errors.push({
        type: 'structure',
        severity: 'critical',
        message: 'Contract missing baseUrl field',
        location: 'contract.baseUrl',
        details: {},
        recommendation: 'Add baseUrl field to site contract'
      });
    }

    // Validate baseUrl format
    if (contract.baseUrl) {
      try {
        new URL(contract.baseUrl);
      } catch {
        errors.push({
          type: 'structure',
          severity: 'high',
          message: 'Invalid baseUrl format',
          location: 'contract.baseUrl',
          details: { baseUrl: contract.baseUrl },
          recommendation: 'Ensure baseUrl is a valid URL with protocol'
        });
      }
    }

    // Check for empty sections
    if (Object.keys(contract.components).length === 0) {
      warnings.push({
        type: 'optimization',
        message: 'No components found in contract',
        location: 'contract.components',
        details: {},
        recommendation: 'Add component definitions to improve site functionality'
      });
    }

    return { errors, warnings };
  }

  /**
   * Validate components
   */
  private validateComponents(components: Record<string, ComponentContract>): {
    errors: ContractValidationError[];
    warnings: ContractValidationWarning[];
    summary: ComponentValidationSummary;
  } {
    const errors: ContractValidationError[] = [];
    const warnings: ContractValidationWarning[] = [];
    const missingMetadata: string[] = [];
    const invalidStructure: string[] = [];
    
    let validComponents = 0;
    const totalComponents = Object.keys(components).length;

    for (const [componentName, component] of Object.entries(components)) {
      let componentValid = true;

      // Check required fields
      if (!component.name || !component.version || !component.category) {
        errors.push({
          type: 'structure',
          severity: 'high',
          message: `Component ${componentName} missing required fields`,
          location: `components.${componentName}`,
          details: {
            missingFields: [
              !component.name && 'name',
              !component.version && 'version', 
              !component.category && 'category'
            ].filter(Boolean)
          },
          recommendation: 'Add all required component fields'
        });
        componentValid = false;
      }

      // Check metadata completeness
      if (!component.metadata || Object.keys(component.metadata).length === 0) {
        missingMetadata.push(componentName);
        warnings.push({
          type: 'optimization',
          message: `Component ${componentName} has no metadata`,
          location: `components.${componentName}.metadata`,
          details: {},
          recommendation: 'Add component metadata for better functionality'
        });
      }

      // Check instances
      if (!component.instances || component.instances.length === 0) {
        warnings.push({
          type: 'optimization',
          message: `Component ${componentName} has no instances`,
          location: `components.${componentName}.instances`,
          details: {},
          recommendation: 'Component appears to be unused on the site'
        });
      }

      // Validate component instances
      if (component.instances) {
        for (let i = 0; i < component.instances.length; i++) {
          const instance = component.instances[i];
          if (!instance?.id || !instance?.selector) {
            invalidStructure.push(`${componentName}.instances[${i}]`);
            componentValid = false;
          }
        }
      }

      if (componentValid) {
        validComponents++;
      }
    }

    const score = totalComponents > 0 ? (validComponents / totalComponents) * 100 : 100;

    return {
      errors,
      warnings,
      summary: {
        totalComponents,
        validComponents,
        missingMetadata,
        invalidStructure,
        score
      }
    };
  }

  /**
   * Validate actions manifest
   */
  private validateActions(actions: ActionManifest): {
    errors: ContractValidationError[];
    warnings: ContractValidationWarning[];
    summary: ActionValidationSummary;
  } {
    const errors: ContractValidationError[] = [];
    const warnings: ContractValidationWarning[] = [];
    const missingValidation: string[] = [];
    const securityIssues: string[] = [];

    let secureActions = 0;
    const allActions = Object.values(actions.actions).flat();
    const totalActions = allActions.length;

    for (const action of allActions) {
      // Check security configuration
      if (!action.security) {
        securityIssues.push(action.name);
        errors.push({
          type: 'security',
          severity: 'high',
          message: `Action ${action.name} missing security configuration`,
          location: `actions.${action.name}.security`,
          details: {},
          recommendation: 'Add security configuration for all actions'
        });
      } else {
        // Check for high-risk actions without proper security
        if (action.category === 'payment' || action.category === 'delete') {
          if (!action.security.requiresConfirmation) {
            securityIssues.push(action.name);
            warnings.push({
              type: 'best-practice',
              message: `High-risk action ${action.name} should require confirmation`,
              location: `actions.${action.name}.security.requiresConfirmation`,
              details: { category: action.category },
              recommendation: 'Enable confirmation for high-risk actions'
            });
          }
        }
        secureActions++;
      }

      // Check parameter validation
      if (!action.parameters || action.parameters.length === 0) {
        missingValidation.push(action.name);
        warnings.push({
          type: 'best-practice',
          message: `Action ${action.name} has no parameter validation`,
          location: `actions.${action.name}.parameters`,
          details: {},
          recommendation: 'Add parameter validation for better security'
        });
      }
    }

    const score = totalActions > 0 ? 
      ((secureActions / totalActions) * 0.7 + 
       ((totalActions - missingValidation.length) / totalActions) * 0.3) * 100 : 100;

    return {
      errors,
      warnings,
      summary: {
        totalActions,
        secureActions,
        missingValidation,
        securityIssues,
        score
      }
    };
  }

  /**
   * Validate JSON-LD report
   */
  private validateJsonLd(jsonld: JsonLdReport): {
    errors: ContractValidationError[];
    warnings: ContractValidationWarning[];
    summary: JsonLdValidationSummary;
  } {
    const errors: ContractValidationError[] = [];
    const warnings: ContractValidationWarning[] = [];
    const missingRequiredFields: string[] = [];

    const totalBlocks = jsonld.blocks.length;
    let validBlocks = 0;

    // Calculate schema compliance from existing validation
    const schemaCompliance = jsonld.validation.valid ? 100 : 
      Math.max(0, 100 - (jsonld.validation.issues.length * 10 + jsonld.validation.warnings * 5));

    // Check each JSON-LD block
    for (let i = 0; i < jsonld.blocks.length; i++) {
      const block = jsonld.blocks[i];
      
      if (!block?.content || Object.keys(block.content).length === 0) {
        errors.push({
          type: 'content',
          severity: 'medium',
          message: `JSON-LD block ${i} has empty content`,
          location: `jsonld.blocks[${i}].content`,
          details: { blockType: block?.type },
          recommendation: 'Remove empty JSON-LD blocks or add content'
        });
      } else {
        validBlocks++;
        
        // Check for @type field (required in JSON-LD)
        if (!block?.content['@type']) {
          missingRequiredFields.push(`block[${i}].@type`);
          warnings.push({
            type: 'best-practice',
            message: `JSON-LD block ${i} missing @type field`,
            location: `jsonld.blocks[${i}].content['@type']`,
            details: { blockType: block?.type },
            recommendation: 'Add @type field to JSON-LD blocks for schema compliance'
          });
        }
      }
    }

    const score = totalBlocks > 0 ? 
      (validBlocks / totalBlocks) * 0.6 + (schemaCompliance / 100) * 0.4 : 100;

    return {
      errors,
      warnings,
      summary: {
        totalBlocks,
        validBlocks,
        schemaCompliance,
        missingRequiredFields,
        score: score * 100
      }
    };
  }

  /**
   * Validate sitemap report
   */
  private validateSitemap(sitemap: any): {
    errors: ContractValidationError[];
    warnings: ContractValidationWarning[];
    summary: SitemapValidationSummary;
  } {
    const errors: ContractValidationError[] = [];
    const warnings: ContractValidationWarning[] = [];
    const structureProblems: string[] = [];

    // Handle both old and new sitemap formats
    const totalPages = sitemap.entries?.length || sitemap.urls?.length || 0;
    const indexablePages = sitemap.stats?.indexablePages || totalPages;
    const seoIssues = sitemap.validationIssues?.length || sitemap.validation?.issues?.length || 0;

    // Check sitemap structure
    if (totalPages === 0) {
      errors.push({
        type: 'structure',
        severity: 'critical',
        message: 'Sitemap contains no pages',
        location: 'sitemap.entries',
        details: {},
        recommendation: 'Add pages to sitemap for search engine indexing'
      });
    }

    // Check for SEO issues
    if (seoIssues > totalPages * 0.1) { // More than 10% of pages have issues
      warnings.push({
        type: 'optimization',
        message: `High number of SEO issues detected (${seoIssues})`,
        location: 'sitemap.validationIssues',
        details: { issueCount: seoIssues, pageCount: totalPages },
        recommendation: 'Review and fix SEO issues for better search visibility'
      });
    }

    const score = totalPages > 0 ? 
      Math.max(0, 100 - (seoIssues / totalPages) * 100) : 0;

    return {
      errors,
      warnings,
      summary: {
        totalPages,
        indexablePages,
        seoIssues,
        structureProblems,
        score
      }
    };
  }

  /**
   * Validate accessibility audit
   */
  private validateAccessibility(aria: EnhancedAriaAuditReport): {
    errors: ContractValidationError[];
    warnings: ContractValidationWarning[];
    summary: AccessibilityValidationSummary;
  } {
    const errors: ContractValidationError[] = [];
    const warnings: ContractValidationWarning[] = [];
    const missingLandmarks: string[] = [];

    const criticalIssues = aria.issues.filter(issue => 
      issue.type === 'error' && issue.severity === 'high'
    ).length;

    const accessibilityScore = aria.overallMetrics.accessibilityScore * 100;

    // Check WCAG compliance
    if (aria.complianceLevel === 'non-compliant') {
      errors.push({
        type: 'compliance',
        severity: 'critical',
        message: 'Site does not meet WCAG Level A compliance',
        location: 'aria.complianceLevel',
        details: { level: aria.complianceLevel },
        recommendation: 'Fix critical accessibility issues to achieve WCAG Level A compliance'
      });
    }

    // Check for missing essential landmarks
    const essentialLandmarks = ['main', 'navigation', 'banner'];
    const presentLandmarks = aria.landmarks.map(l => l.type);
    
    for (const landmark of essentialLandmarks) {
      if (!presentLandmarks.includes(landmark)) {
        missingLandmarks.push(landmark);
      }
    }

    if (missingLandmarks.length > 0) {
      warnings.push({
        type: 'best-practice',
        message: `Missing essential landmarks: ${missingLandmarks.join(', ')}`,
        location: 'aria.landmarks',
        details: { missingLandmarks },
        recommendation: 'Add missing landmarks for better screen reader navigation'
      });
    }

    return {
      errors,
      warnings,
      summary: {
        wcagCompliance: aria.complianceLevel,
        criticalIssues,
        accessibilityScore,
        missingLandmarks,
        score: accessibilityScore
      }
    };
  }

  /**
   * Calculate overall contract score
   */
  private calculateOverallScore(summaries: {
    components: ComponentValidationSummary;
    actions: ActionValidationSummary;
    jsonld: JsonLdValidationSummary;
    sitemap: SitemapValidationSummary;
    accessibility: AccessibilityValidationSummary;
  }): number {
    const weights = {
      components: 0.2,
      actions: 0.2,
      jsonld: 0.15,
      sitemap: 0.2,
      accessibility: 0.25
    };

    const weightedScore = 
      summaries.components.score * weights.components +
      summaries.actions.score * weights.actions +
      summaries.jsonld.score * weights.jsonld +
      summaries.sitemap.score * weights.sitemap +
      summaries.accessibility.score * weights.accessibility;

    return Math.round(weightedScore);
  }
}

// Export singleton instance
export const contractValidator = new ContractValidator();