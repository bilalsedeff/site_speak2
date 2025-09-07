import { api } from './index'

export interface Site {
  id: string
  name: string
  description?: string
  domain?: string
  status: 'draft' | 'published' | 'archived'
  tenantId: string
  publishedUrl?: string
  publishedAt?: string
  createdAt: string
  updatedAt: string
  settings: {
    theme: string
    primaryColor: string
    fontFamily: string
    [key: string]: any
  }
  seo: {
    title?: string
    description?: string
    keywords?: string[]
    ogImage?: string
  }
  analytics?: {
    googleAnalyticsId?: string
    facebookPixelId?: string
  }
}

export interface CreateSiteRequest {
  name: string
  description?: string
  templateId?: string
  settings?: Partial<Site['settings']>
}

export interface UpdateSiteRequest {
  name?: string
  description?: string
  domain?: string
  settings?: Partial<Site['settings']>
  seo?: Partial<Site['seo']>
  analytics?: Partial<Site['analytics']>
}

export interface PublishResponse {
  publishedUrl: string
  deploymentId: string
  status: 'success' | 'failed'
  message?: string
}

export interface SiteAnalytics {
  siteId: string
  period: string
  pageViews: number
  uniqueVisitors: number
  voiceInteractions: number
  averageSessionDuration: number
  bounceRate: number
  topPages: Array<{
    path: string
    views: number
    title?: string
  }>
  trafficSources: Array<{
    source: string
    visitors: number
    percentage: number
  }>
  voiceMetrics: {
    totalInteractions: number
    averageIntentAccuracy: number
    successfulActions: number
    topIntents: Array<{
      intent: string
      count: number
    }>
  }
}

export const sitesApi = {
  /**
   * Get all sites for current user
   */
  getAllSites: async (): Promise<Site[]> => {
    const response = await api.get<{ sites: Site[], total: number, page: number, limit: number }>('/sites')
    return response.sites || []
  },

  /**
   * Get a single site by ID
   */
  getSite: async (siteId: string): Promise<Site> => {
    return api.get<Site>(`/sites/${siteId}`)
  },

  /**
   * Create a new site
   */
  createSite: async (data: CreateSiteRequest): Promise<Site> => {
    return api.post<Site>('/sites', data)
  },

  /**
   * Update an existing site
   */
  updateSite: async (siteId: string, data: UpdateSiteRequest): Promise<Site> => {
    return api.patch<Site>(`/sites/${siteId}`, data)
  },

  /**
   * Delete a site
   */
  deleteSite: async (siteId: string): Promise<void> => {
    return api.delete<void>(`/sites/${siteId}`)
  },

  /**
   * Publish a site
   */
  publishSite: async (siteId: string): Promise<PublishResponse> => {
    return api.post<PublishResponse>(`/sites/${siteId}/publish`)
  },

  /**
   * Unpublish a site
   */
  unpublishSite: async (siteId: string): Promise<void> => {
    return api.post<void>(`/sites/${siteId}/unpublish`)
  },

  /**
   * Clone a site
   */
  cloneSite: async (siteId: string, name: string): Promise<Site> => {
    return api.post<Site>(`/sites/${siteId}/clone`, { name })
  },

  /**
   * Get site content/pages
   */
  getSiteContent: async (siteId: string): Promise<any> => {
    return api.get<any>(`/sites/${siteId}/content`)
  },

  /**
   * Update site content/pages
   */
  updateSiteContent: async (siteId: string, content: any): Promise<any> => {
    return api.put<any>(`/sites/${siteId}/content`, { content })
  },

  /**
   * Get site analytics
   */
  getSiteAnalytics: async (
    siteId: string,
    period: '7d' | '30d' | '90d' | '1y' = '30d'
  ): Promise<SiteAnalytics> => {
    return api.get<SiteAnalytics>(`/sites/${siteId}/analytics`, { period })
  },

  /**
   * Get available templates
   */
  getTemplates: async (): Promise<Array<{
    id: string
    name: string
    description: string
    category: string
    previewImage: string
    features: string[]
  }>> => {
    return api.get<any[]>('/sites/templates')
  },

  /**
   * Preview site
   */
  previewSite: async (siteId: string): Promise<{ previewUrl: string }> => {
    return api.post<{ previewUrl: string }>(`/sites/${siteId}/preview`)
  },

  /**
   * Get site SEO analysis
   */
  getSeoAnalysis: async (siteId: string): Promise<{
    score: number
    issues: Array<{
      type: 'error' | 'warning' | 'info'
      message: string
      page?: string
    }>
    recommendations: string[]
  }> => {
    return api.get<any>(`/sites/${siteId}/seo-analysis`)
  },

  /**
   * Test site voice assistant
   */
  testVoiceAssistant: async (siteId: string, query: string): Promise<{
    response: string
    actions: any[]
    confidence: number
  }> => {
    return api.post<any>(`/sites/${siteId}/test-voice`, { query })
  },
}