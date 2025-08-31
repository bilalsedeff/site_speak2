import { z } from 'zod';

export interface SiteConfiguration {
  theme: {
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    layout: 'modern' | 'classic' | 'minimal';
  };
  seo: {
    title: string;
    description: string;
    keywords: string[];
    ogImage?: string;
  };
  analytics: {
    enabled: boolean;
    googleAnalyticsId?: string;
    plausibleDomain?: string;
  };
  voice: {
    enabled: boolean;
    personality: 'professional' | 'friendly' | 'casual';
    language: string;
    fallbackBehavior: 'redirect' | 'message' | 'form';
  };
}

export interface SiteContent {
  pages: SitePage[];
  components: SiteComponent[];
  assets: SiteAsset[];
}

export interface SitePage {
  id: string;
  name: string;
  slug: string;
  title: string;
  content: unknown; // JSON structure
  isHomePage: boolean;
  isPublished: boolean;
  seoSettings?: {
    title?: string;
    description?: string;
    keywords?: string[];
  };
}

export interface SiteComponent {
  id: string;
  type: string;
  name: string;
  props: Record<string, unknown>;
  children?: string[];
}

export interface SiteAsset {
  id: string;
  type: 'image' | 'video' | 'document' | 'audio';
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

/**
 * Site domain entity
 */
export class Site {
  constructor(
    public readonly id: string,
    public name: string,
    public description: string,
    public readonly tenantId: string,
    public templateId: string,
    public configuration: SiteConfiguration,
    public content: SiteContent,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public publishedAt?: Date,
    public readonly isPublished: boolean = false,
    public readonly subdomain?: string,
    public readonly customDomain?: string,
    public readonly status: 'draft' | 'published' | 'archived' = 'draft',
  ) {}

  /**
   * Update site information
   */
  update(updates: {
    name?: string;
    description?: string;
    configuration?: Partial<SiteConfiguration>;
    content?: Partial<SiteContent>;
  }): Site {
    return new Site(
      this.id,
      updates.name ?? this.name,
      updates.description ?? this.description,
      this.tenantId,
      this.templateId,
      updates.configuration ? { ...this.configuration, ...updates.configuration } : this.configuration,
      updates.content ? { ...this.content, ...updates.content } : this.content,
      this.createdAt,
      new Date(), // updatedAt
      this.publishedAt,
      this.isPublished,
      this.subdomain,
      this.customDomain,
      this.status,
    );
  }

  /**
   * Publish site
   */
  publish(subdomain?: string): Site {
    return new Site(
      this.id,
      this.name,
      this.description,
      this.tenantId,
      this.templateId,
      this.configuration,
      this.content,
      this.createdAt,
      new Date(),
      new Date(), // publishedAt
      true, // isPublished
      subdomain ?? this.subdomain,
      this.customDomain,
      'published', // status
    );
  }

  /**
   * Unpublish site
   */
  unpublish(): Site {
    return new Site(
      this.id,
      this.name,
      this.description,
      this.tenantId,
      this.templateId,
      this.configuration,
      this.content,
      this.createdAt,
      new Date(),
      this.publishedAt,
      false, // isPublished
      this.subdomain,
      this.customDomain,
      'draft', // status
    );
  }

  /**
   * Archive site
   */
  archive(): Site {
    return new Site(
      this.id,
      this.name,
      this.description,
      this.tenantId,
      this.templateId,
      this.configuration,
      this.content,
      this.createdAt,
      new Date(),
      this.publishedAt,
      false, // isPublished
      this.subdomain,
      this.customDomain,
      'archived', // status
    );
  }

  /**
   * Set custom domain
   */
  setCustomDomain(domain: string): Site {
    return new Site(
      this.id,
      this.name,
      this.description,
      this.tenantId,
      this.templateId,
      this.configuration,
      this.content,
      this.createdAt,
      new Date(),
      this.publishedAt,
      this.isPublished,
      this.subdomain,
      domain, // customDomain
      this.status,
    );
  }

  /**
   * Get site URL
   */
  getUrl(): string {
    if (this.customDomain) {
      return `https://${this.customDomain}`;
    }
    if (this.subdomain) {
      return `https://${this.subdomain}.sitespeak.com`;
    }
    return `https://site-${this.id}.sitespeak.com`;
  }

  /**
   * Get site preview URL
   */
  getPreviewUrl(): string {
    return `https://preview-${this.id}.sitespeak.com`;
  }

  /**
   * Check if site has voice AI enabled
   */
  hasVoiceEnabled(): boolean {
    return this.configuration.voice.enabled;
  }

  /**
   * Get site pages count
   */
  getPagesCount(): number {
    return this.content.pages.length;
  }

  /**
   * Get published pages count
   */
  getPublishedPagesCount(): number {
    return this.content.pages.filter(page => page.isPublished).length;
  }

  /**
   * Get home page
   */
  getHomePage(): SitePage | null {
    return this.content.pages.find(page => page.isHomePage) || null;
  }

  /**
   * Get page by slug
   */
  getPageBySlug(slug: string): SitePage | null {
    return this.content.pages.find(page => page.slug === slug) || null;
  }

  /**
   * Add page
   */
  addPage(page: Omit<SitePage, 'id'>): Site {
    const newPage: SitePage = {
      ...page,
      id: crypto.randomUUID(),
    };

    const updatedContent: SiteContent = {
      ...this.content,
      pages: [...this.content.pages, newPage],
    };

    return this.update({ content: updatedContent });
  }

  /**
   * Update page
   */
  updatePage(pageId: string, updates: Partial<SitePage>): Site {
    const updatedPages = this.content.pages.map(page =>
      page.id === pageId ? { ...page, ...updates } : page
    );

    const updatedContent: SiteContent = {
      ...this.content,
      pages: updatedPages,
    };

    return this.update({ content: updatedContent });
  }

  /**
   * Remove page
   */
  removePage(pageId: string): Site {
    const updatedPages = this.content.pages.filter(page => page.id !== pageId);

    const updatedContent: SiteContent = {
      ...this.content,
      pages: updatedPages,
    };

    return this.update({ content: updatedContent });
  }

  /**
   * Get site analytics summary
   */
  getAnalyticsSummary() {
    return {
      pagesCount: this.getPagesCount(),
      publishedPagesCount: this.getPublishedPagesCount(),
      componentsCount: this.content.components.length,
      assetsCount: this.content.assets.length,
      voiceEnabled: this.hasVoiceEnabled(),
      lastUpdated: this.updatedAt,
      publishedAt: this.publishedAt,
    };
  }
}

/**
 * Site creation data
 */
export interface CreateSiteData {
  name: string;
  description: string;
  tenantId: string;
  templateId: string;
  configuration?: Partial<SiteConfiguration>;
}

/**
 * Default site configuration
 */
export const getDefaultSiteConfiguration = (): SiteConfiguration => ({
  theme: {
    primaryColor: '#3B82F6',
    secondaryColor: '#10B981',
    fontFamily: 'Inter',
    layout: 'modern',
  },
  seo: {
    title: 'My SiteSpeak Website',
    description: 'A website built with SiteSpeak',
    keywords: [],
  },
  analytics: {
    enabled: false,
  },
  voice: {
    enabled: true,
    personality: 'professional',
    language: 'en',
    fallbackBehavior: 'message',
  },
});

/**
 * Validation schemas
 */
export const CreateSiteSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  tenantId: z.string().uuid(),
  templateId: z.string().min(1),
  configuration: z.object({
    theme: z.object({
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      fontFamily: z.string().optional(),
      layout: z.enum(['modern', 'classic', 'minimal']).optional(),
    }).optional(),
    seo: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      keywords: z.array(z.string()).optional(),
    }).optional(),
    voice: z.object({
      enabled: z.boolean().optional(),
      personality: z.enum(['professional', 'friendly', 'casual']).optional(),
      language: z.string().optional(),
      fallbackBehavior: z.enum(['redirect', 'message', 'form']).optional(),
    }).optional(),
  }).optional(),
});

export const UpdateSiteSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  configuration: z.object({
    theme: z.object({
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      fontFamily: z.string().optional(),
      layout: z.enum(['modern', 'classic', 'minimal']).optional(),
    }).optional(),
    seo: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      keywords: z.array(z.string()).optional(),
    }).optional(),
    analytics: z.object({
      enabled: z.boolean().optional(),
      googleAnalyticsId: z.string().optional(),
      plausibleDomain: z.string().optional(),
    }).optional(),
    voice: z.object({
      enabled: z.boolean().optional(),
      personality: z.enum(['professional', 'friendly', 'casual']).optional(),
      language: z.string().optional(),
      fallbackBehavior: z.enum(['redirect', 'message', 'form']).optional(),
    }).optional(),
  }).optional(),
});

export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;
export type UpdateSiteInput = z.infer<typeof UpdateSiteSchema>;