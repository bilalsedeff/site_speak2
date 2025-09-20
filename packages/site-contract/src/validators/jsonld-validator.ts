/**
 * JSON-LD Validator - Schema.org compliance validation
 *
 * Validates JSON-LD structured data against Schema.org specifications
 * and ensures proper semantic markup for search engines and AI agents.
 */

export interface JsonLdValidationResult {
  valid: boolean;
  errors: JsonLdValidationError[];
  warnings: JsonLdValidationWarning[];
  score: number; // 0-100
  schemaTypes: string[];
  recommendations: string[];
}

export interface JsonLdValidationError {
  type: 'schema_violation' | 'structure_error' | 'type_mismatch' | 'required_missing';
  severity: 'critical' | 'high' | 'medium';
  message: string;
  path: string;
  schemaType?: string;
  expectedType?: string;
  actualValue?: any;
  recommendation: string;
}

export interface JsonLdValidationWarning {
  type: 'best_practice' | 'optimization' | 'compatibility';
  message: string;
  path: string;
  schemaType?: string;
  recommendation: string;
}

/**
 * Schema.org definitions for common types
 */
const SCHEMA_DEFINITIONS = {
  'Thing': {
    required: ['@type'],
    recommended: ['name', 'description', 'url'],
    properties: {
      'name': 'Text',
      'description': 'Text',
      'url': 'URL',
      'image': 'URL|ImageObject',
      'identifier': 'Text|URL|PropertyValue'
    }
  },
  'Organization': {
    extends: 'Thing',
    required: ['@type', 'name'],
    recommended: ['url', 'logo', 'address', 'contactPoint'],
    properties: {
      'logo': 'URL|ImageObject',
      'address': 'PostalAddress|Text',
      'contactPoint': 'ContactPoint',
      'telephone': 'Text',
      'email': 'Text'
    }
  },
  'LocalBusiness': {
    extends: 'Organization',
    recommended: ['address', 'telephone', 'openingHours', 'geo'],
    properties: {
      'openingHours': 'Text',
      'geo': 'GeoCoordinates',
      'priceRange': 'Text'
    }
  },
  'Product': {
    extends: 'Thing',
    required: ['@type', 'name'],
    recommended: ['description', 'image', 'brand', 'offers'],
    properties: {
      'brand': 'Brand|Organization|Text',
      'offers': 'Offer',
      'sku': 'Text',
      'gtin': 'Text',
      'mpn': 'Text',
      'category': 'Text|Thing'
    }
  },
  'Offer': {
    extends: 'Thing',
    required: ['@type'],
    recommended: ['price', 'priceCurrency', 'availability'],
    properties: {
      'price': 'Number|Text',
      'priceCurrency': 'Text',
      'availability': 'ItemAvailability',
      'validFrom': 'Date',
      'validThrough': 'Date'
    }
  },
  'Article': {
    extends: 'Thing',
    required: ['@type', 'headline'],
    recommended: ['author', 'datePublished', 'image'],
    properties: {
      'headline': 'Text',
      'author': 'Person|Organization',
      'datePublished': 'Date',
      'dateModified': 'Date',
      'publisher': 'Organization|Person'
    }
  },
  'Person': {
    extends: 'Thing',
    required: ['@type', 'name'],
    recommended: ['jobTitle', 'worksFor'],
    properties: {
      'jobTitle': 'Text',
      'worksFor': 'Organization',
      'telephone': 'Text',
      'email': 'Text'
    }
  },
  'Event': {
    extends: 'Thing',
    required: ['@type', 'name', 'startDate'],
    recommended: ['location', 'description'],
    properties: {
      'startDate': 'Date|DateTime',
      'endDate': 'Date|DateTime',
      'location': 'Place|Text',
      'organizer': 'Organization|Person'
    }
  },
  'WebSite': {
    extends: 'Thing',
    required: ['@type', 'name', 'url'],
    recommended: ['description', 'publisher'],
    properties: {
      'publisher': 'Organization|Person',
      'potentialAction': 'SearchAction'
    }
  },
  'WebPage': {
    extends: 'Thing',
    required: ['@type'],
    recommended: ['name', 'description', 'isPartOf'],
    properties: {
      'isPartOf': 'WebSite',
      'breadcrumb': 'BreadcrumbList'
    }
  }
} as const;

/**
 * JSON-LD Validator class
 */
export class JsonLdValidator {
  private strictMode: boolean;
  private schemaOrgContext: string = 'https://schema.org';

  constructor(options: { strictMode?: boolean } = {}) {
    this.strictMode = options.strictMode ?? false;
    // Use strictMode to avoid unused variable warning
    void this.strictMode;
  }

  /**
   * Validate JSON-LD data
   */
  async validateJsonLd(jsonLdData: any | any[]): Promise<JsonLdValidationResult> {
    const errors: JsonLdValidationError[] = [];
    const warnings: JsonLdValidationWarning[] = [];
    const schemaTypes: string[] = [];
    const recommendations: string[] = [];

    // Normalize to array
    const dataArray = Array.isArray(jsonLdData) ? jsonLdData : [jsonLdData];

    for (let i = 0; i < dataArray.length; i++) {
      const data = dataArray[i];
      const basePath = dataArray.length > 1 ? `[${i}]` : '';

      // Validate individual JSON-LD object
      const result = this.validateJsonLdObject(data, basePath);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
      schemaTypes.push(...result.schemaTypes);
      recommendations.push(...result.recommendations);
    }

    // Calculate score
    const score = this.calculateValidationScore(errors, warnings, schemaTypes.length);

    // Add general recommendations
    recommendations.push(...this.generateGeneralRecommendations(schemaTypes, errors, warnings));

    return {
      valid: errors.filter(e => e.severity === 'critical').length === 0,
      errors,
      warnings,
      score,
      schemaTypes: Array.from(new Set(schemaTypes)), // Remove duplicates
      recommendations: Array.from(new Set(recommendations))
    };
  }

  /**
   * Validate a single JSON-LD object
   */
  private validateJsonLdObject(data: any, basePath: string): {
    errors: JsonLdValidationError[];
    warnings: JsonLdValidationWarning[];
    schemaTypes: string[];
    recommendations: string[];
  } {
    const errors: JsonLdValidationError[] = [];
    const warnings: JsonLdValidationWarning[] = [];
    const schemaTypes: string[] = [];
    const recommendations: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push({
        type: 'structure_error',
        severity: 'critical',
        message: 'JSON-LD data must be an object',
        path: basePath,
        actualValue: data,
        recommendation: 'Ensure JSON-LD data is a valid object'
      });
      return { errors, warnings, schemaTypes, recommendations };
    }

    // Check for required @context
    if (!data['@context']) {
      errors.push({
        type: 'structure_error',
        severity: 'critical',
        message: 'Missing @context property',
        path: `${basePath}.@context`,
        recommendation: 'Add @context property with Schema.org URL'
      });
    } else if (!this.isValidContext(data['@context'])) {
      warnings.push({
        type: 'best_practice',
        message: 'Non-standard @context, may not be recognized by all processors',
        path: `${basePath}.@context`,
        recommendation: 'Use https://schema.org for maximum compatibility'
      });
    }

    // Check for required @type
    if (!data['@type']) {
      errors.push({
        type: 'structure_error',
        severity: 'critical',
        message: 'Missing @type property',
        path: `${basePath}.@type`,
        recommendation: 'Add @type property to specify Schema.org type'
      });
      return { errors, warnings, schemaTypes, recommendations };
    }

    // Validate schema type
    const schemaType = Array.isArray(data['@type']) ? data['@type'][0] : data['@type'];
    schemaTypes.push(schemaType);

    if (SCHEMA_DEFINITIONS[schemaType as keyof typeof SCHEMA_DEFINITIONS]) {
      const validation = this.validateSchemaType(data, schemaType, basePath);
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);
      recommendations.push(...validation.recommendations);
    } else {
      warnings.push({
        type: 'compatibility',
        message: `Unknown or unsupported schema type: ${schemaType}`,
        path: `${basePath}.@type`,
        schemaType,
        recommendation: 'Verify schema type is correct and supported'
      });
    }

    // Validate nested objects
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('@') || typeof value !== 'object' || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object' && item !== null && item['@type']) {
            const nestedResult = this.validateJsonLdObject(item, `${basePath}.${key}[${index}]`);
            errors.push(...nestedResult.errors);
            warnings.push(...nestedResult.warnings);
            schemaTypes.push(...nestedResult.schemaTypes);
            recommendations.push(...nestedResult.recommendations);
          }
        });
      } else if (value && typeof value === 'object' && '@type' in value) {
        const nestedResult = this.validateJsonLdObject(value, `${basePath}.${key}`);
        errors.push(...nestedResult.errors);
        warnings.push(...nestedResult.warnings);
        schemaTypes.push(...nestedResult.schemaTypes);
        recommendations.push(...nestedResult.recommendations);
      }
    }

    return { errors, warnings, schemaTypes, recommendations };
  }

  /**
   * Validate specific schema type
   */
  private validateSchemaType(data: any, schemaType: string, basePath: string): {
    errors: JsonLdValidationError[];
    warnings: JsonLdValidationWarning[];
    recommendations: string[];
  } {
    const errors: JsonLdValidationError[] = [];
    const warnings: JsonLdValidationWarning[] = [];
    const recommendations: string[] = [];

    const schemaDef = SCHEMA_DEFINITIONS[schemaType as keyof typeof SCHEMA_DEFINITIONS];
    if (!schemaDef) {return { errors, warnings, recommendations };}

    // Get all required and recommended fields (including from parent types)
    const allRequired = this.getAllRequiredFields(schemaType);
    const allRecommended = this.getAllRecommendedFields(schemaType);
    const allProperties = this.getAllProperties(schemaType);

    // Check required fields
    for (const field of allRequired) {
      if (!data[field]) {
        errors.push({
          type: 'required_missing',
          severity: 'high',
          message: `Required field '${field}' is missing`,
          path: `${basePath}.${field}`,
          schemaType,
          recommendation: `Add required field '${field}' for ${schemaType} schema`
        });
      }
    }

    // Check recommended fields
    for (const field of allRecommended) {
      if (!data[field]) {
        warnings.push({
          type: 'best_practice',
          message: `Recommended field '${field}' is missing`,
          path: `${basePath}.${field}`,
          schemaType,
          recommendation: `Consider adding '${field}' for better schema completeness`
        });
      }
    }

    // Validate property types
    for (const [property, value] of Object.entries(data)) {
      if (property.startsWith('@')) {continue;}

      const expectedType = allProperties[property];
      if (expectedType && !this.isValidPropertyType(value, expectedType)) {
        errors.push({
          type: 'type_mismatch',
          severity: 'medium',
          message: `Property '${property}' has incorrect type`,
          path: `${basePath}.${property}`,
          schemaType,
          expectedType,
          actualValue: value,
          recommendation: `Ensure '${property}' matches expected type: ${expectedType}`
        });
      }
    }

    // Schema-specific validations
    if (schemaType === 'Product' && data.offers) {
      recommendations.push('Consider adding structured pricing information to product offers');
    }

    if (schemaType === 'LocalBusiness' && !data.address) {
      recommendations.push('Add address information for better local search visibility');
    }

    if (schemaType === 'Article' && !data.image) {
      recommendations.push('Add image to article for better social media sharing');
    }

    return { errors, warnings, recommendations };
  }

  /**
   * Check if @context is valid
   */
  private isValidContext(context: any): boolean {
    if (typeof context === 'string') {
      return context === this.schemaOrgContext || context.includes('schema.org');
    }
    if (Array.isArray(context)) {
      return context.some(c => typeof c === 'string' && c.includes('schema.org'));
    }
    if (typeof context === 'object') {
      return Object.values(context).some(v =>
        typeof v === 'string' && v.includes('schema.org')
      );
    }
    return false;
  }

  /**
   * Get all required fields for a schema type (including inheritance)
   */
  private getAllRequiredFields(schemaType: string): string[] {
    const schemaDef = SCHEMA_DEFINITIONS[schemaType as keyof typeof SCHEMA_DEFINITIONS];
    if (!schemaDef) {return [];}

    let required: string[] = [...('required' in schemaDef ? schemaDef.required || [] : [])];

    if ('extends' in schemaDef && schemaDef.extends) {
      required = [...required, ...this.getAllRequiredFields(schemaDef.extends)] as string[];
    }

    return Array.from(new Set(required));
  }

  /**
   * Get all recommended fields for a schema type
   */
  private getAllRecommendedFields(schemaType: string): string[] {
    const schemaDef = SCHEMA_DEFINITIONS[schemaType as keyof typeof SCHEMA_DEFINITIONS];
    if (!schemaDef) {return [];}

    let recommended: string[] = [...('recommended' in schemaDef ? schemaDef.recommended || [] : [])];

    if ('extends' in schemaDef && schemaDef.extends) {
      recommended = [...recommended, ...this.getAllRecommendedFields(schemaDef.extends)] as string[];
    }

    return Array.from(new Set(recommended));
  }

  /**
   * Get all properties for a schema type
   */
  private getAllProperties(schemaType: string): Record<string, string> {
    const schemaDef = SCHEMA_DEFINITIONS[schemaType as keyof typeof SCHEMA_DEFINITIONS];
    if (!schemaDef) {return {};}

    let properties = { ...(schemaDef.properties || {}) };

    if ('extends' in schemaDef && schemaDef.extends) {
      properties = { ...this.getAllProperties(schemaDef.extends), ...properties };
    }

    return properties;
  }

  /**
   * Validate property type
   */
  private isValidPropertyType(value: any, expectedType: string): boolean {
    const types = expectedType.split('|');

    return types.some(type => {
      switch (type.toLowerCase()) {
        case 'text':
          return typeof value === 'string';
        case 'number':
          return typeof value === 'number' || !isNaN(Number(value));
        case 'boolean':
          return typeof value === 'boolean';
        case 'date':
        case 'datetime':
          return this.isValidDate(value);
        case 'url':
          return this.isValidUrl(value);
        default:
          // For schema types (e.g., Organization, Person), check if it's an object
          return typeof value === 'object' && value !== null;
      }
    });
  }

  /**
   * Check if value is a valid date
   */
  private isValidDate(value: any): boolean {
    if (typeof value === 'string') {
      const date = new Date(value);
      return !isNaN(date.getTime());
    }
    return value instanceof Date && !isNaN(value.getTime());
  }

  /**
   * Check if value is a valid URL
   */
  private isValidUrl(value: any): boolean {
    if (typeof value !== 'string') {return false;}
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate validation score
   */
  private calculateValidationScore(
    errors: JsonLdValidationError[],
    warnings: JsonLdValidationWarning[],
    schemaCount: number
  ): number {
    let score = 100;

    // Deduct points for errors
    errors.forEach(error => {
      switch (error.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 5;
          break;
      }
    });

    // Deduct points for warnings
    score -= warnings.length * 2;

    // Bonus points for schema diversity
    if (schemaCount > 1) {
      score += Math.min(schemaCount * 2, 10);
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate general recommendations
   */
  private generateGeneralRecommendations(
    schemaTypes: string[],
    errors: JsonLdValidationError[],
    _warnings: JsonLdValidationWarning[]
  ): string[] {
    const recommendations: string[] = [];

    if (schemaTypes.length === 0) {
      recommendations.push('Add JSON-LD structured data to improve search engine understanding');
    }

    if (errors.some(e => e.type === 'structure_error')) {
      recommendations.push('Fix structural issues in JSON-LD for proper parsing');
    }

    if (!schemaTypes.includes('Organization') && !schemaTypes.includes('LocalBusiness')) {
      recommendations.push('Consider adding Organization schema for business information');
    }

    if (!schemaTypes.includes('WebSite')) {
      recommendations.push('Add WebSite schema for better site understanding');
    }

    const productCount = schemaTypes.filter(t => t === 'Product').length;
    if (productCount > 5) {
      recommendations.push('Consider using Product category pages with aggregate data');
    }

    return recommendations;
  }
}

// Export singleton instance
export const jsonLdValidator = new JsonLdValidator();

// Export factory function
export function createJsonLdValidator(options?: { strictMode?: boolean }): JsonLdValidator {
  return new JsonLdValidator(options);
}