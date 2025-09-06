import { JSDOM } from 'jsdom';
import { 
  SitemapReport,
  SitemapEntry,
  SitemapValidationIssue,
  ComponentContract 
} from '../types/contract-types';

/**
 * Sitemap emitter for generating sitemap analysis and validation
 * 
 * Generates XML sitemap with proper lastmod timestamps for incremental crawls
 * and provides comprehensive analysis of site structure for SEO optimization.
 */
export class SitemapEmitter {
  private baseUrl: string;
  private strict: boolean;

  constructor(baseUrl: string, options: { strict?: boolean } = {}) {
    this.baseUrl = baseUrl;
    this.strict = options.strict ?? false;
    // Note: strict mode for future use in validation
    void this.strict;
  }

  /**
   * Generate complete sitemap report with XML generation and analysis
   */
  async generateSitemapReport(
    pages: Record<string, string>, // pageUrl -> HTML content
    components: Record<string, ComponentContract>,
    metadata: Record<string, { lastModified?: Date; priority?: number; changeFreq?: string }> = {}
  ): Promise<SitemapReport> {
    const entries: SitemapEntry[] = [];
    const issues: SitemapValidationIssue[] = [];
    
    for (const [pageUrl, htmlContent] of Object.entries(pages)) {
      try {
        const dom = new JSDOM(htmlContent);
        const document = dom.window.document;
        
        // Analyze page structure
        const analysis = await this.analyzePage(pageUrl, document, components);
        const pageMetadata = metadata[pageUrl] || {};
        
        const entry: SitemapEntry = {
          loc: this.normalizeUrl(pageUrl),
          lastmod: pageMetadata.lastModified || new Date(),
          changefreq: pageMetadata.changeFreq || this.inferChangeFrequency(analysis),
          priority: pageMetadata.priority || this.calculatePriority(pageUrl, analysis),
          ...analysis
        };
        
        entries.push(entry);
        
        // Collect validation issues
        const entryIssues = this.validateSitemapEntry(entry, document);
        issues.push(...entryIssues);
        
      } catch (error) {
        issues.push({
          type: 'error',
          severity: 'high',
          message: `Failed to process page ${pageUrl}`,
          pageUrl,
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        });
      }
    }
    
    // Generate XML sitemap
    const xmlSitemap = this.generateXmlSitemap(entries);
    
    // Calculate statistics
    const stats = this.calculateSitemapStats(entries, issues);
    
    return {
      entries,
      xmlSitemap,
      validationIssues: issues,
      stats,
      generatedAt: new Date(),
      baseUrl: this.baseUrl
    };
  }

  /**
   * Analyze individual page structure and content
   */
  private async analyzePage(
    pageUrl: string,
    document: Document,
    components: Record<string, ComponentContract>
  ) {
    const title = document.querySelector('title')?.textContent || '';
    const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    const headings = this.extractHeadings(document);
    const links = this.extractLinks(document, pageUrl);
    const images = this.extractImages(document);
    const structuredData = this.extractStructuredData(document);
    
    // Analyze component usage
    const componentUsage = this.analyzeComponentUsage(document, components);
    
    // Calculate content metrics
    const wordCount = this.calculateWordCount(document);
    const contentScore = this.calculateContentScore(document);
    
    return {
      title,
      metaDescription,
      headings,
      links,
      images,
      structuredData,
      componentUsage,
      wordCount,
      contentScore,
      hasForm: document.querySelector('form') !== null,
      hasNavigation: document.querySelector('nav, [role="navigation"]') !== null,
      isIndexable: !this.hasNoIndexDirective(document)
    };
  }

  /**
   * Extract heading structure for SEO analysis
   */
  private extractHeadings(document: Document) {
    const headings: Array<{ level: number; text: string; id?: string }> = [];
    
    for (let level = 1; level <= 6; level++) {
      const elements = document.querySelectorAll(`h${level}`);
      elements.forEach((element) => {
        headings.push({
          level,
          text: element.textContent?.trim() || '',
          ...(element.id && { id: element.id })
        });
      });
    }
    
    return headings.sort((a, b) => {
      const aPos = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).indexOf(
        document.querySelector(`h${a.level}`)!
      );
      const bPos = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).indexOf(
        document.querySelector(`h${b.level}`)!
      );
      return aPos - bPos;
    });
  }

  /**
   * Extract and validate internal/external links
   */
  private extractLinks(document: Document, currentPageUrl: string) {
    const links: Array<{ href: string; text: string; isInternal: boolean; hasTitle: boolean }> = [];
    
    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href')!;
      const text = link.textContent?.trim() || '';
      const isInternal = this.isInternalLink(href, currentPageUrl);
      const hasTitle = link.hasAttribute('title');
      
      links.push({ href, text, isInternal, hasTitle });
    });
    
    return links;
  }

  /**
   * Extract and analyze images for SEO
   */
  private extractImages(document: Document) {
    const images: Array<{ src: string; alt: string; hasAlt: boolean; isDecorative: boolean }> = [];
    
    document.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';
      const hasAlt = img.hasAttribute('alt');
      const isDecorative = alt === '' && hasAlt; // Empty alt indicates decorative
      
      images.push({ src, alt, hasAlt, isDecorative });
    });
    
    return images;
  }

  /**
   * Extract structured data (JSON-LD, microdata, RDFa)
   */
  private extractStructuredData(document: Document) {
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    const jsonLdBlocks: any[] = [];
    
    jsonLdScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || '');
        jsonLdBlocks.push(data);
      } catch (error) {
        // Invalid JSON-LD, ignore
      }
    });
    
    return {
      jsonLd: jsonLdBlocks,
      hasMicrodata: document.querySelector('[itemtype]') !== null,
      hasRdfa: document.querySelector('[typeof]') !== null
    };
  }

  /**
   * Analyze component usage on the page
   */
  private analyzeComponentUsage(document: Document, components: Record<string, ComponentContract>) {
    const usage: Record<string, number> = {};
    
    Object.keys(components).forEach((componentName) => {
      const selector = `[data-component="${componentName}"]`;
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        usage[componentName] = elements.length;
      }
    });
    
    return usage;
  }

  /**
   * Calculate word count for content analysis
   */
  private calculateWordCount(document: Document): number {
    const textContent = document.body?.textContent || '';
    return textContent.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Calculate content quality score (0-1)
   */
  private calculateContentScore(document: Document): number {
    let score = 0;
    
    // Title presence and length
    const title = document.querySelector('title')?.textContent || '';
    if (title.length > 10 && title.length < 60) {score += 0.2;}
    
    // Meta description presence and length
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    if (metaDesc.length > 120 && metaDesc.length < 160) {score += 0.2;}
    
    // Heading structure
    const hasH1 = document.querySelector('h1') !== null;
    const hasH2 = document.querySelector('h2') !== null;
    if (hasH1 && hasH2) {score += 0.2;}
    
    // Content length
    const wordCount = this.calculateWordCount(document);
    if (wordCount > 300) {score += 0.2;}
    
    // Image alt attributes
    const images = document.querySelectorAll('img');
    const imagesWithAlt = document.querySelectorAll('img[alt]');
    if (images.length === imagesWithAlt.length && images.length > 0) {score += 0.2;}
    
    return Math.min(score, 1.0);
  }

  /**
   * Check if page has no-index directive
   */
  private hasNoIndexDirective(document: Document): boolean {
    const robotsMeta = document.querySelector('meta[name="robots"]');
    if (robotsMeta) {
      const content = robotsMeta.getAttribute('content') || '';
      return content.toLowerCase().includes('noindex');
    }
    return false;
  }

  /**
   * Infer change frequency based on page analysis
   */
  private inferChangeFrequency(analysis: any): string {
    if (analysis.hasForm || analysis.componentUsage['BlogPost'] || analysis.componentUsage['NewsArticle']) {
      return 'weekly';
    }
    
    if (analysis.componentUsage['ProductCard'] || analysis.componentUsage['PriceTable']) {
      return 'monthly';
    }
    
    if (analysis.componentUsage['ContactInfo'] || analysis.componentUsage['AboutSection']) {
      return 'yearly';
    }
    
    return 'monthly'; // Default
  }

  /**
   * Calculate priority based on URL structure and content
   */
  private calculatePriority(pageUrl: string, analysis: any): number {
    const url = new URL(pageUrl, this.baseUrl);
    const path = url.pathname;
    
    // Homepage gets highest priority
    if (path === '/' || path === '') {return 1.0;}
    
    // Main sections get high priority
    if (path.split('/').length <= 2) {return 0.8;}
    
    // Pages with forms or important content
    if (analysis.hasForm || analysis.contentScore > 0.8) {return 0.6;}
    
    // Regular content pages
    return 0.4;
  }

  /**
   * Validate individual sitemap entry
   */
  private validateSitemapEntry(entry: SitemapEntry, _document: Document): SitemapValidationIssue[] {
    const issues: SitemapValidationIssue[] = [];
    
    // Check for essential SEO elements
    if (!entry.title || entry.title.length === 0) {
      issues.push({
        type: 'warning',
        severity: 'medium',
        message: 'Page missing title tag',
        pageUrl: entry.loc,
        details: { element: 'title' }
      });
    }
    
    if (!entry.metaDescription || entry.metaDescription.length === 0) {
      issues.push({
        type: 'warning',
        severity: 'medium', 
        message: 'Page missing meta description',
        pageUrl: entry.loc,
        details: { element: 'meta[name="description"]' }
      });
    }
    
    // Check heading structure
    if (entry.headings.length === 0 || !entry.headings.some(h => h.level === 1)) {
      issues.push({
        type: 'warning',
        severity: 'medium',
        message: 'Page missing H1 heading',
        pageUrl: entry.loc,
        details: { element: 'h1' }
      });
    }
    
    // Check for images without alt text
    const imagesWithoutAlt = entry.images.filter(img => !img.hasAlt && !img.isDecorative);
    if (imagesWithoutAlt.length > 0) {
      issues.push({
        type: 'warning',
        severity: 'low',
        message: `${imagesWithoutAlt.length} images missing alt text`,
        pageUrl: entry.loc,
        details: { count: imagesWithoutAlt.length }
      });
    }
    
    return issues;
  }

  /**
   * Generate XML sitemap from entries
   */
  private generateXmlSitemap(entries: SitemapEntry[]): string {
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
    const urlsetOpen = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    const urlsetClose = '</urlset>';
    
    const urlElements = entries
      .filter(entry => entry.isIndexable)
      .map(entry => {
        const lastmod = entry.lastmod.toISOString().split('T')[0];
        return `  <url>
    <loc>${this.escapeXml(entry.loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`;
      })
      .join('\n');
    
    return [xmlHeader, urlsetOpen, urlElements, urlsetClose].join('\n');
  }

  /**
   * Calculate sitemap statistics
   */
  private calculateSitemapStats(entries: SitemapEntry[], issues: SitemapValidationIssue[]) {
    return {
      totalPages: entries.length,
      indexablePages: entries.filter(e => e.isIndexable).length,
      pagesWithForms: entries.filter(e => e.hasForm).length,
      averageContentScore: entries.reduce((sum, e) => sum + e.contentScore, 0) / entries.length,
      totalIssues: issues.length,
      errorCount: issues.filter(i => i.type === 'error').length,
      warningCount: issues.filter(i => i.type === 'warning').length
    };
  }

  /**
   * Utility methods
   */
  private normalizeUrl(url: string): string {
    try {
      return new URL(url, this.baseUrl).toString();
    } catch {
      return new URL(url, this.baseUrl).toString();
    }
  }

  private isInternalLink(href: string, currentPageUrl: string): boolean {
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return false;
    }
    
    try {
      const url = new URL(href, currentPageUrl);
      const baseUrl = new URL(this.baseUrl);
      return url.hostname === baseUrl.hostname;
    } catch {
      return false;
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}