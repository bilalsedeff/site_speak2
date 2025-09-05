import { JSDOM } from 'jsdom';
import { createLogger } from '../../../../services/_shared/telemetry/logger';

const logger = createLogger({ service: 'html-extractor' });

/**
 * HTML Content Extractor
 * 
 * Extracts visible text, headings, tables, ARIA regions, and canonical URLs from HTML content.
 * Implements source-of-truth requirements: `/extractors/html.ts` lifts visible text, headings, 
 * tables, ARIA regions, canonical URL.
 */

export interface HtmlExtractionResult {
  url: string;
  title: string;
  description?: string;
  canonicalUrl?: string;
  language?: string;
  
  // Content structure
  headings: HeadingData[];
  paragraphs: string[];
  tables: TableData[];
  
  // ARIA regions for programmatic targeting
  ariaRegions: AriaRegionData[];
  
  // Full content
  visibleText: string;
  cleanText: string;
  
  // Metadata
  wordCount: number;
  lastModified?: string;
  extractedAt: Date;
  
  // Extraction errors
  errors: ExtractionError[];
}

export interface HeadingData {
  level: number; // 1-6
  text: string;
  id?: string;
  anchor?: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  caption?: string;
  summary?: string;
}

export interface AriaRegionData {
  role: string; // navigation, main, search, contentinfo, etc.
  label?: string;
  content: string;
  selector: string; // For programmatic targeting
}

export interface ExtractionError {
  type: 'parsing' | 'content' | 'aria';
  message: string;
  element?: string;
}

export interface HtmlExtractionOptions {
  maxTextLength?: number;
  includeTables?: boolean;
  includeAriaRegions?: boolean;
  preserveWhitespace?: boolean;
}

/**
 * HTML Content Extractor
 */
export class HtmlExtractor {
  
  /**
   * Extract structured content from HTML
   */
  async extractFromHtml(
    html: string, 
    url: string, 
    options: HtmlExtractionOptions = {}
  ): Promise<HtmlExtractionResult> {
    const {
      maxTextLength = 50000,
      includeTables = true,
      includeAriaRegions = true,
      preserveWhitespace = false
    } = options;

    const errors: ExtractionError[] = [];
    
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      // Extract basic metadata
      const title = this.extractTitle(document);
      const description = this.extractDescription(document);
      const canonicalUrl = this.extractCanonicalUrl(document);
      const language = this.extractLanguage(document);
      const lastModified = this.extractLastModified(document);

      // Extract content structure
      const headings = this.extractHeadings(document);
      const paragraphs = this.extractParagraphs(document);
      const tables = includeTables ? this.extractTables(document) : [];
      const ariaRegions = includeAriaRegions ? this.extractAriaRegions(document) : [];

      // Extract clean text content
      const { visibleText, cleanText, wordCount } = this.extractTextContent(
        document, 
        maxTextLength, 
        preserveWhitespace
      );

      const result: HtmlExtractionResult = {
        url,
        title,
        description,
        canonicalUrl,
        language,
        headings,
        paragraphs,
        tables,
        ariaRegions,
        visibleText,
        cleanText,
        wordCount,
        lastModified,
        extractedAt: new Date(),
        errors
      };

      logger.debug('HTML extraction completed', {
        url,
        title,
        headingsCount: headings.length,
        paragraphsCount: paragraphs.length,
        tablesCount: tables.length,
        ariaRegionsCount: ariaRegions.length,
        wordCount,
        hasCanonical: !!canonicalUrl
      });

      return result;

    } catch (error) {
      logger.error('HTML extraction failed', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      errors.push({
        type: 'parsing',
        message: error instanceof Error ? error.message : 'Failed to parse HTML'
      });

      // Return minimal result on error
      return {
        url,
        title: 'Error extracting content',
        headings: [],
        paragraphs: [],
        tables: [],
        ariaRegions: [],
        visibleText: '',
        cleanText: '',
        wordCount: 0,
        extractedAt: new Date(),
        errors
      };
    }
  }

  /**
   * Extract page title with fallbacks
   */
  private extractTitle(document: Document): string {
    return document.querySelector('title')?.textContent?.trim() ||
           document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
           document.querySelector('h1')?.textContent?.trim() ||
           'Untitled Page';
  }

  /**
   * Extract page description
   */
  private extractDescription(document: Document): string | undefined {
    return document.querySelector('meta[name="description"]')?.getAttribute('content') ||
           document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
           undefined;
  }

  /**
   * Extract canonical URL
   */
  private extractCanonicalUrl(document: Document): string | undefined {
    return document.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
           document.querySelector('meta[property="og:url"]')?.getAttribute('content') ||
           undefined;
  }

  /**
   * Extract page language
   */
  private extractLanguage(document: Document): string | undefined {
    return document.documentElement.getAttribute('lang') ||
           document.querySelector('meta[http-equiv="content-language"]')?.getAttribute('content') ||
           undefined;
  }

  /**
   * Extract last modified date
   */
  private extractLastModified(document: Document): string | undefined {
    return document.querySelector('meta[name="last-modified"]')?.getAttribute('content') ||
           document.querySelector('meta[property="article:modified_time"]')?.getAttribute('content') ||
           undefined;
  }

  /**
   * Extract headings with hierarchy
   */
  private extractHeadings(document: Document): HeadingData[] {
    const headings: HeadingData[] = [];
    const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headingElements.forEach(element => {
      const text = element.textContent?.trim();
      if (text) {
        const level = parseInt(element.tagName.charAt(1));
        const id = element.getAttribute('id');
        
        headings.push({
          level,
          text,
          id: id || undefined,
          anchor: id ? `#${id}` : undefined
        });
      }
    });

    return headings;
  }

  /**
   * Extract paragraph content
   */
  private extractParagraphs(document: Document): string[] {
    const paragraphs: string[] = [];
    const paragraphElements = document.querySelectorAll('p');

    paragraphElements.forEach(element => {
      const text = element.textContent?.trim();
      if (text && text.length > 20) { // Filter very short paragraphs
        paragraphs.push(text);
      }
    });

    return paragraphs;
  }

  /**
   * Extract table data
   */
  private extractTables(document: Document): TableData[] {
    const tables: TableData[] = [];
    const tableElements = document.querySelectorAll('table');

    tableElements.forEach(tableElement => {
      try {
        const headers: string[] = [];
        const rows: string[][] = [];

        // Extract headers
        const headerElements = tableElement.querySelectorAll('thead th, tr:first-child th');
        headerElements.forEach(header => {
          const text = header.textContent?.trim();
          if (text) {headers.push(text);}
        });

        // If no explicit headers, try first row
        if (headers.length === 0) {
          const firstRowCells = tableElement.querySelectorAll('tr:first-child td, tr:first-child th');
          firstRowCells.forEach(cell => {
            const text = cell.textContent?.trim();
            if (text) {headers.push(text);}
          });
        }

        // Extract data rows
        const dataRows = tableElement.querySelectorAll('tbody tr, tr');
        dataRows.forEach((row, index) => {
          // Skip header row
          if (index === 0 && headers.length > 0 && row.querySelectorAll('th').length > 0) {
            return;
          }

          const cells: string[] = [];
          const cellElements = row.querySelectorAll('td, th');
          cellElements.forEach(cell => {
            const text = cell.textContent?.trim() || '';
            cells.push(text);
          });

          if (cells.length > 0) {
            rows.push(cells);
          }
        });

        if (headers.length > 0 || rows.length > 0) {
          const caption = tableElement.querySelector('caption')?.textContent?.trim();
          const summary = tableElement.getAttribute('summary');

          tables.push({
            headers,
            rows,
            caption: caption || undefined,
            summary: summary || undefined
          });
        }
      } catch (error) {
        logger.warn('Error extracting table', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    return tables;
  }

  /**
   * Extract ARIA regions for programmatic targeting
   */
  private extractAriaRegions(document: Document): AriaRegionData[] {
    const regions: AriaRegionData[] = [];
    
    // Standard ARIA landmark roles
    const landmarkSelectors = [
      '[role="banner"]', '[role="navigation"]', '[role="main"]',
      '[role="complementary"]', '[role="contentinfo"]', '[role="search"]',
      '[role="form"]', '[role="region"]',
      // Semantic HTML5 elements
      'header', 'nav', 'main', 'aside', 'footer', 'section'
    ];

    const elements = document.querySelectorAll(landmarkSelectors.join(', '));
    
    elements.forEach((element, index) => {
      try {
        const role = element.getAttribute('role') || element.tagName.toLowerCase();
        const label = element.getAttribute('aria-label') || 
                     (element.getAttribute('aria-labelledby') && 
                      document.getElementById(element.getAttribute('aria-labelledby')!)?.textContent?.trim());
        
        const content = element.textContent?.trim();
        
        if (content && content.length > 30) { // Filter very short regions
          // Generate selector for programmatic targeting
          let selector = element.tagName.toLowerCase();
          if (element.id) {
            selector = `#${element.id}`;
          } else if (element.getAttribute('role')) {
            selector = `[role="${element.getAttribute('role')}"]`;
          } else {
            // Use nth-of-type as fallback
            selector += `:nth-of-type(${index + 1})`;
          }

          regions.push({
            role,
            label: label || undefined,
            content: content.substring(0, 500), // Limit content length
            selector
          });
        }
      } catch (error) {
        logger.warn('Error extracting ARIA region', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    return regions;
  }

  /**
   * Extract clean text content
   */
  private extractTextContent(
    document: Document, 
    maxLength: number, 
    preserveWhitespace: boolean
  ): { visibleText: string; cleanText: string; wordCount: number } {
    // Remove non-visible elements
    const elementsToRemove = document.querySelectorAll(
      'script, style, noscript, iframe, object, embed, [hidden], [style*="display:none"], [style*="visibility:hidden"]'
    );
    
    elementsToRemove.forEach(element => element.remove());

    // Get text content
    const bodyElement = document.querySelector('body') || document;
    const visibleText = bodyElement.textContent || '';

    // Clean text
    const cleanText = preserveWhitespace 
      ? visibleText.trim().substring(0, maxLength)
      : visibleText.replace(/\s+/g, ' ').trim().substring(0, maxLength);

    // Calculate word count
    const words = cleanText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    return {
      visibleText,
      cleanText,
      wordCount
    };
  }
}

/**
 * Factory function for creating HTML extractor instances
 */
export function createHtmlExtractor(): HtmlExtractor {
  return new HtmlExtractor();
}

/**
 * Default HTML extractor instance
 */
export const htmlExtractor = createHtmlExtractor();