import { createHash } from 'crypto';

/**
 * Content Hash Domain Service
 * 
 * Provides content hashing capabilities for idempotent upserts and change detection.
 * Implements multiple hashing strategies optimized for different content types.
 */
export class ContentHashService {
  
  /**
   * Compute content hash with configurable algorithm and normalization
   */
  computeContentHash(
    content: string,
    options: HashOptions = {}
  ): ContentHashResult {
    const {
      algorithm = 'sha256',
      normalize = true,
      includeMetadata = false,
      encoding = 'hex'
    } = options;

    try {
      // Normalize content if requested
      const processedContent = normalize 
        ? this.normalizeContent(content, options.normalizationOptions)
        : content;

      // Generate hash
      const hash = createHash(algorithm)
        .update(processedContent, 'utf8')
        .digest(encoding);

      return {
        hash,
        algorithm,
        contentLength: processedContent.length,
        originalLength: content.length,
        normalized: normalize,
        createdAt: new Date()
      };

    } catch (error) {
      throw new Error(`Failed to compute content hash: ${error}`);
    }
  }

  /**
   * Compute hash for structured content with metadata
   */
  computeStructuredContentHash(
    content: StructuredContent,
    options: HashOptions = {}
  ): StructuredContentHashResult {
    const {
      algorithm = 'sha256',
      includeMetadata = true,
      encoding = 'hex'
    } = options;

    // Create composite content for hashing
    const compositeContent = this.createCompositeContent(content, includeMetadata);
    
    // Compute individual hashes
    const textHash = this.computeContentHash(content.text || '', { 
      ...options, 
      normalize: true 
    });
    
    const metadataHash = includeMetadata && content.metadata
      ? this.computeContentHash(JSON.stringify(content.metadata, null, 0), {
          ...options,
          normalize: false
        })
      : null;

    // Compute composite hash
    const compositeHash = createHash(algorithm)
      .update(compositeContent, 'utf8')
      .digest(encoding);

    return {
      compositeHash,
      textHash: textHash.hash,
      metadataHash: metadataHash?.hash,
      algorithm,
      components: {
        text: content.text ? true : false,
        metadata: content.metadata ? true : false,
        structuredData: content.structuredData ? true : false,
        actions: content.actions ? content.actions.length > 0 : false,
        forms: content.forms ? content.forms.length > 0 : false
      },
      createdAt: new Date()
    };
  }

  /**
   * Compare two content hashes
   */
  compareHashes(hash1: string, hash2: string): HashComparisonResult {
    const isEqual = hash1 === hash2;
    
    return {
      isEqual,
      hash1,
      hash2,
      similarity: isEqual ? 1.0 : 0.0, // Could implement fuzzy matching later
      comparedAt: new Date()
    };
  }

  /**
   * Batch compute hashes for multiple content items
   */
  batchComputeHashes(
    contents: BatchContentItem[],
    options: HashOptions = {}
  ): BatchHashResult[] {
    return contents.map(item => {
      try {
        const hash = this.computeContentHash(item.content, options);
        return {
          id: item.id,
          url: item.url,
          hash: hash.hash,
          success: true,
          contentLength: hash.contentLength
        };
      } catch (error) {
        return {
          id: item.id,
          url: item.url,
          hash: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          contentLength: item.content.length
        };
      }
    });
  }

  /**
   * Create content fingerprint for change detection
   */
  createContentFingerprint(
    content: string,
    metadata: ContentMetadata
  ): ContentFingerprint {
    const contentHash = this.computeContentHash(content);
    const metadataHash = this.computeContentHash(JSON.stringify(metadata));
    
    // Create composite fingerprint
    const composite = `${contentHash.hash}:${metadataHash.hash}`;
    const fingerprintHash = createHash('md5')
      .update(composite, 'utf8')
      .digest('hex');

    return {
      fingerprint: fingerprintHash,
      contentHash: contentHash.hash,
      metadataHash: metadataHash.hash,
      contentLength: content.length,
      metadata: {
        title: metadata.title,
        lastModified: metadata.lastModified,
        contentType: metadata.contentType
      },
      createdAt: new Date()
    };
  }

  /**
   * Detect content changes using hash comparison
   */
  detectChanges(
    current: ContentHashResult,
    stored: ContentHashResult | null
  ): ChangeDetectionResult {
    if (!stored) {
      return {
        hasChanged: true,
        changeType: 'new',
        confidence: 1.0,
        details: 'No previous hash available'
      };
    }

    const hasChanged = current.hash !== stored.hash;
    
    if (!hasChanged) {
      return {
        hasChanged: false,
        changeType: 'unchanged',
        confidence: 1.0,
        details: 'Content hash unchanged'
      };
    }

    // Analyze type of change
    const lengthDiff = Math.abs(current.contentLength - stored.contentLength);
    const lengthRatio = lengthDiff / stored.contentLength;

    let changeType: ChangeType = 'modified';
    let confidence = 1.0;

    if (lengthRatio > 0.5) {
      changeType = 'major';
      confidence = 0.95;
    } else if (lengthRatio > 0.1) {
      changeType = 'moderate';
      confidence = 0.9;
    } else {
      changeType = 'minor';
      confidence = 0.85;
    }

    return {
      hasChanged: true,
      changeType,
      confidence,
      details: `Content length changed by ${lengthDiff} characters (${(lengthRatio * 100).toFixed(1)}%)`
    };
  }

  /**
   * Normalize content for consistent hashing
   */
  private normalizeContent(
    content: string,
    options: NormalizationOptions = {}
  ): string {
    const {
      removeWhitespace = true,
      removeComments = true,
      removeScripts = true,
      removeStyles = true,
      removeDynamicContent = true,
      preserveStructure = false
    } = options;

    let normalized = content;

    // Remove HTML comments
    if (removeComments) {
      normalized = normalized.replace(/<!--[\s\S]*?-->/g, '');
    }

    // Remove script and style blocks
    if (removeScripts) {
      normalized = normalized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }
    
    if (removeStyles) {
      normalized = normalized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    }

    // Remove dynamic content
    if (removeDynamicContent) {
      // Remove timestamps and dynamic IDs
      normalized = normalized
        .replace(/timestamp="\d+"/gi, 'timestamp=""')
        .replace(/data-timestamp="\d+"/gi, 'data-timestamp=""')
        .replace(/id="[^"]*-\d{13,}"/gi, 'id=""') // Remove timestamp-based IDs
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP') // ISO timestamps
        .replace(/\b\d{13,}\b/g, 'TIMESTAMP'); // Unix timestamps
    }

    // Normalize whitespace
    if (removeWhitespace) {
      if (preserveStructure) {
        // Preserve basic HTML structure
        normalized = normalized
          .replace(/\s*\n\s*/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .trim();
      } else {
        // Aggressive whitespace removal
        normalized = normalized
          .replace(/\s+/g, ' ')
          .trim();
      }
    }

    // Normalize line endings
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    return normalized;
  }

  /**
   * Create composite content for structured hashing
   */
  private createCompositeContent(
    content: StructuredContent,
    includeMetadata: boolean
  ): string {
    const parts: string[] = [];

    // Add text content
    if (content.text) {
      parts.push(`TEXT:${content.text}`);
    }

    // Add structured data
    if (content.structuredData) {
      parts.push(`STRUCTURED:${JSON.stringify(content.structuredData)}`);
    }

    // Add actions
    if (content.actions && content.actions.length > 0) {
      parts.push(`ACTIONS:${JSON.stringify(content.actions)}`);
    }

    // Add forms
    if (content.forms && content.forms.length > 0) {
      parts.push(`FORMS:${JSON.stringify(content.forms)}`);
    }

    // Add metadata if requested
    if (includeMetadata && content.metadata) {
      parts.push(`METADATA:${JSON.stringify(content.metadata)}`);
    }

    return parts.join('|||');
  }
}

/**
 * Hash options interface
 */
export interface HashOptions {
  algorithm?: 'md5' | 'sha1' | 'sha256' | 'sha512';
  normalize?: boolean;
  includeMetadata?: boolean;
  encoding?: 'hex' | 'base64' | 'base64url';
  normalizationOptions?: NormalizationOptions;
}

/**
 * Normalization options
 */
export interface NormalizationOptions {
  removeWhitespace?: boolean;
  removeComments?: boolean;
  removeScripts?: boolean;
  removeStyles?: boolean;
  removeDynamicContent?: boolean;
  preserveStructure?: boolean;
}

/**
 * Content hash result
 */
export interface ContentHashResult {
  hash: string;
  algorithm: string;
  contentLength: number;
  originalLength: number;
  normalized: boolean;
  createdAt: Date;
}

/**
 * Structured content input
 */
export interface StructuredContent {
  text?: string;
  metadata?: Record<string, any>;
  structuredData?: any[];
  actions?: any[];
  forms?: any[];
}

/**
 * Structured content hash result
 */
export interface StructuredContentHashResult {
  compositeHash: string;
  textHash: string;
  metadataHash?: string;
  algorithm: string;
  components: {
    text: boolean;
    metadata: boolean;
    structuredData: boolean;
    actions: boolean;
    forms: boolean;
  };
  createdAt: Date;
}

/**
 * Hash comparison result
 */
export interface HashComparisonResult {
  isEqual: boolean;
  hash1: string;
  hash2: string;
  similarity: number;
  comparedAt: Date;
}

/**
 * Batch content item
 */
export interface BatchContentItem {
  id: string;
  url: string;
  content: string;
}

/**
 * Batch hash result
 */
export interface BatchHashResult {
  id: string;
  url: string;
  hash: string;
  success: boolean;
  error?: string;
  contentLength: number;
}

/**
 * Content metadata
 */
export interface ContentMetadata {
  title?: string;
  lastModified?: Date;
  contentType?: string;
  etag?: string;
  size?: number;
}

/**
 * Content fingerprint
 */
export interface ContentFingerprint {
  fingerprint: string;
  contentHash: string;
  metadataHash: string;
  contentLength: number;
  metadata: {
    title?: string;
    lastModified?: Date;
    contentType?: string;
  };
  createdAt: Date;
}

/**
 * Change detection result
 */
export interface ChangeDetectionResult {
  hasChanged: boolean;
  changeType: ChangeType;
  confidence: number;
  details: string;
}

/**
 * Change types
 */
export type ChangeType = 'new' | 'unchanged' | 'minor' | 'moderate' | 'major' | 'modified';

/**
 * Factory function
 */
export function createContentHashService(): ContentHashService {
  return new ContentHashService();
}