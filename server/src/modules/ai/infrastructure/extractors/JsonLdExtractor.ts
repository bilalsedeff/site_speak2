import { JSDOM } from 'jsdom';
import { createLogger } from '../../../_shared/telemetry/logger';

const logger = createLogger({ service: 'json-ld-extractor' });

/**
 * JSON-LD Extractor
 * 
 * Extracts and normalizes JSON-LD structured data from HTML documents.
 * Prioritizes structured data extraction as the primary fact source according to source-of-truth.
 */
export class JsonLdExtractor {
  
  /**
   * Extract all JSON-LD structured data from HTML
   */
  async extractFromHtml(html: string, url: string): Promise<JsonLdExtractionResult> {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      // Find all JSON-LD script tags
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      const entities: ExtractedEntity[] = [];
      const errors: ExtractionError[] = [];

      logger.debug('Found JSON-LD scripts', { 
        count: jsonLdScripts.length, 
        url 
      });

      for (let i = 0; i < jsonLdScripts.length; i++) {
        const script = jsonLdScripts[i];
        try {
          const jsonContent = script.textContent?.trim();
          if (!jsonContent) {
            continue;
          }

          const parsed = JSON.parse(jsonContent);
          const extracted = this.processJsonLdObject(parsed, url, i);
          entities.push(...extracted);

        } catch (error) {
          const extractionError: ExtractionError = {
            type: 'parse-error',
            message: error instanceof Error ? error.message : 'Unknown parsing error',
            scriptIndex: i,
            url
          };
          errors.push(extractionError);
          
          logger.warn('JSON-LD parsing error', {
            error: extractionError,
            url
          });
        }
      }

      // Validate and enrich entities
      const validatedEntities = await this.validateAndEnrichEntities(entities, url);

      const result: JsonLdExtractionResult = {
        url,
        entities: validatedEntities,
        totalScripts: jsonLdScripts.length,
        successfulExtractions: validatedEntities.length,
        errors,
        extractedAt: new Date()
      };

      logger.info('JSON-LD extraction completed', {
        url,
        totalScripts: result.totalScripts,
        entities: result.successfulExtractions,
        errors: result.errors.length
      });

      return result;

    } catch (error) {
      logger.error('JSON-LD extraction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        url
      });

      return {
        url,
        entities: [],
        totalScripts: 0,
        successfulExtractions: 0,
        errors: [{
          type: 'extraction-error',
          message: error instanceof Error ? error.message : 'Unknown error',
          url
        }],
        extractedAt: new Date()
      };
    }
  }

  /**
   * Process JSON-LD object and extract entities
   */
  private processJsonLdObject(
    jsonLd: any, 
    url: string, 
    scriptIndex: number
  ): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    // Handle array of objects
    if (Array.isArray(jsonLd)) {
      jsonLd.forEach((item, index) => {
        entities.push(...this.processJsonLdObject(item, url, scriptIndex));
      });
      return entities;
    }

    // Handle single object
    if (typeof jsonLd === 'object' && jsonLd !== null) {
      const entity = this.createEntityFromJsonLd(jsonLd, url, scriptIndex);
      if (entity) {
        entities.push(entity);
      }

      // Handle @graph property
      if (jsonLd['@graph'] && Array.isArray(jsonLd['@graph'])) {
        jsonLd['@graph'].forEach((item: any) => {
          entities.push(...this.processJsonLdObject(item, url, scriptIndex));
        });
      }
    }

    return entities;
  }

  /**
   * Create entity from JSON-LD object
   */
  private createEntityFromJsonLd(
    jsonLd: any, 
    url: string, 
    scriptIndex: number
  ): ExtractedEntity | null {
    if (!jsonLd['@type']) {
      return null;
    }

    const entityType = Array.isArray(jsonLd['@type']) ? jsonLd['@type'][0] : jsonLd['@type'];
    
    const entity: ExtractedEntity = {
      '@type': entityType,
      '@context': jsonLd['@context'] || 'https://schema.org',
      '@id': jsonLd['@id'],
      url,
      properties: { ...jsonLd },
      confidence: this.calculateConfidence(jsonLd),
      extractionMeta: {
        scriptIndex,
        extractedAt: new Date(),
        normalizedType: this.normalizeEntityType(entityType)
      }
    };

    // Remove JSON-LD specific properties from regular properties
    delete entity.properties['@type'];
    delete entity.properties['@context'];
    delete entity.properties['@id'];

    return entity;
  }

  /**
   * Validate and enrich extracted entities
   */
  private async validateAndEnrichEntities(
    entities: ExtractedEntity[], 
    url: string
  ): Promise<ExtractedEntity[]> {
    const validated: ExtractedEntity[] = [];

    for (const entity of entities) {
      const validatedEntity = await this.validateEntity(entity);
      if (validatedEntity) {
        validated.push(this.enrichEntity(validatedEntity, url));
      }
    }

    return validated;
  }

  /**
   * Validate individual entity
   */
  private async validateEntity(entity: ExtractedEntity): Promise<ExtractedEntity | null> {
    // Basic validation
    if (!entity['@type'] || !entity.properties) {
      return null;
    }

    // Schema-specific validation
    const validator = this.getSchemaValidator(entity['@type']);
    if (validator && !validator(entity)) {
      entity.extractionMeta.validationWarnings = entity.extractionMeta.validationWarnings || [];
      entity.extractionMeta.validationWarnings.push('Schema validation failed');
      entity.confidence *= 0.8; // Reduce confidence
    }

    return entity;
  }

  /**
   * Enrich entity with additional information
   */
  private enrichEntity(entity: ExtractedEntity, url: string): ExtractedEntity {
    // Add URL if not present
    if (!entity.properties['url'] && !entity.properties['sameAs']) {
      entity.properties['url'] = url;
    }

    // Normalize common properties
    entity.properties = this.normalizeCommonProperties(entity.properties);

    // Add semantic labels
    entity.extractionMeta.semanticLabels = this.generateSemanticLabels(entity);

    return entity;
  }

  /**
   * Calculate confidence score for entity
   */
  private calculateConfidence(jsonLd: any): number {
    let confidence = 0.8; // Base confidence for valid JSON-LD

    // Boost confidence for well-structured entities
    const requiredProperties = this.getRequiredProperties(jsonLd['@type']);
    const presentProperties = Object.keys(jsonLd).filter(key => 
      !key.startsWith('@') && jsonLd[key] !== null && jsonLd[key] !== undefined
    );

    if (requiredProperties.length > 0) {
      const completeness = presentProperties.filter(prop => 
        requiredProperties.includes(prop)
      ).length / requiredProperties.length;
      
      confidence += completeness * 0.2;
    }

    // Boost for @id presence (more specific)
    if (jsonLd['@id']) {
      confidence += 0.05;
    }

    // Reduce for unknown types
    if (!this.isKnownSchemaType(jsonLd['@type'])) {
      confidence -= 0.1;
    }

    return Math.min(1.0, Math.max(0.1, confidence));
  }

  /**
   * Normalize entity type to standard form
   */
  private normalizeEntityType(type: string): string {
    const normalizedTypes: Record<string, string> = {
      'Product': 'Product',
      'Organization': 'Organization',
      'LocalBusiness': 'LocalBusiness', 
      'Article': 'Article',
      'BlogPosting': 'BlogPosting',
      'NewsArticle': 'NewsArticle',
      'Recipe': 'Recipe',
      'Event': 'Event',
      'Person': 'Person',
      'WebSite': 'WebSite',
      'WebPage': 'WebPage',
      'FAQ': 'FAQ',
      'Question': 'Question',
      'Answer': 'Answer',
      'Offer': 'Offer',
      'Service': 'Service',
      'ContactPoint': 'ContactPoint',
      'PostalAddress': 'PostalAddress',
      'Review': 'Review',
      'Rating': 'Rating'
    };

    return normalizedTypes[type] || type;
  }

  /**
   * Normalize common properties
   */
  private normalizeCommonProperties(properties: any): any {
    const normalized = { ...properties };

    // Normalize URLs
    if (normalized.url && typeof normalized.url === 'string') {
      normalized.url = this.normalizeUrl(normalized.url);
    }

    // Normalize dates
    if (normalized.datePublished && typeof normalized.datePublished === 'string') {
      normalized.datePublished = this.parseDate(normalized.datePublished);
    }

    if (normalized.dateModified && typeof normalized.dateModified === 'string') {
      normalized.dateModified = this.parseDate(normalized.dateModified);
    }

    // Normalize nested entities
    Object.keys(normalized).forEach(key => {
      if (typeof normalized[key] === 'object' && normalized[key] !== null) {
        if (normalized[key]['@type']) {
          // This is a nested entity
          normalized[key] = this.normalizeCommonProperties(normalized[key]);
        }
      }
    });

    return normalized;
  }

  /**
   * Generate semantic labels for entity
   */
  private generateSemanticLabels(entity: ExtractedEntity): string[] {
    const labels: string[] = [];
    
    labels.push(entity['@type'].toLowerCase());
    
    if (entity.extractionMeta.normalizedType) {
      labels.push(entity.extractionMeta.normalizedType.toLowerCase());
    }

    // Add domain-specific labels
    if (entity.properties['name']) {
      labels.push('named-entity');
    }

    if (entity.properties['address'] || entity.properties['location']) {
      labels.push('location');
    }

    if (entity.properties['offers'] || entity.properties['price']) {
      labels.push('commerce');
    }

    return Array.from(new Set(labels)); // Remove duplicates
  }

  /**
   * Get schema validator for entity type
   */
  private getSchemaValidator(entityType: string): ((entity: ExtractedEntity) => boolean) | null {
    const validators: Record<string, (entity: ExtractedEntity) => boolean> = {
      'Product': (entity) => !!(entity.properties['name'] && entity.properties['description']),
      'Organization': (entity) => !!(entity.properties['name']),
      'LocalBusiness': (entity) => !!(entity.properties['name'] && entity.properties['address']),
      'Article': (entity) => !!(entity.properties['headline'] || entity.properties['name']),
      'Event': (entity) => !!(entity.properties['name'] && entity.properties['startDate']),
      'Person': (entity) => !!(entity.properties['name'])
    };

    return validators[entityType] || null;
  }

  /**
   * Get required properties for entity type
   */
  private getRequiredProperties(entityType: string): string[] {
    const requiredProps: Record<string, string[]> = {
      'Product': ['name', 'description'],
      'Organization': ['name'],
      'LocalBusiness': ['name', 'address'],
      'Article': ['headline', 'author'],
      'Event': ['name', 'startDate', 'location'],
      'Person': ['name'],
      'Recipe': ['name', 'recipeInstructions'],
      'Review': ['reviewBody', 'author']
    };

    return requiredProps[entityType] || [];
  }

  /**
   * Check if schema type is known
   */
  private isKnownSchemaType(type: string): boolean {
    const knownTypes = [
      'Product', 'Organization', 'LocalBusiness', 'Article', 'BlogPosting',
      'NewsArticle', 'Recipe', 'Event', 'Person', 'WebSite', 'WebPage',
      'FAQ', 'Question', 'Answer', 'Offer', 'Service', 'ContactPoint',
      'PostalAddress', 'Review', 'Rating'
    ];

    return knownTypes.includes(type);
  }

  /**
   * Normalize URL
   */
  private normalizeUrl(url: string): string {
    try {
      return new URL(url).toString();
    } catch {
      return url;
    }
  }

  /**
   * Parse date string
   */
  private parseDate(dateString: string): Date | string {
    try {
      return new Date(dateString);
    } catch {
      return dateString; // Keep original if parsing fails
    }
  }
}

/**
 * JSON-LD extraction result
 */
export interface JsonLdExtractionResult {
  url: string;
  entities: ExtractedEntity[];
  totalScripts: number;
  successfulExtractions: number;
  errors: ExtractionError[];
  extractedAt: Date;
}

/**
 * Extracted entity from JSON-LD
 */
export interface ExtractedEntity {
  '@type': string;
  '@context': string;
  '@id'?: string;
  url: string;
  properties: Record<string, any>;
  confidence: number;
  extractionMeta: EntityExtractionMeta;
}

/**
 * Entity extraction metadata
 */
export interface EntityExtractionMeta {
  scriptIndex: number;
  extractedAt: Date;
  normalizedType: string;
  validationWarnings?: string[];
  semanticLabels?: string[];
}

/**
 * Extraction error
 */
export interface ExtractionError {
  type: 'parse-error' | 'validation-error' | 'extraction-error';
  message: string;
  scriptIndex?: number;
  url: string;
}

/**
 * Factory function
 */
export function createJsonLdExtractor(): JsonLdExtractor {
  return new JsonLdExtractor();
}