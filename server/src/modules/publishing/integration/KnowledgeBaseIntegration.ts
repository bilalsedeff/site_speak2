/**
 * Knowledge Base Integration Service
 * 
 * Connects the publishing pipeline with the knowledge base system
 * for automated site content indexing and refresh operations.
 */

import { createLogger } from '../../../services/_shared/telemetry/logger';
import { EventBus } from '../../../services/_shared/events/eventBus';
import type { ArtifactStore } from '../adapters/ArtifactStore';
import type { ContractGenerationResult } from '../../sites/application/services/SiteContractService';

const logger = createLogger({ service: 'kb-integration' });

export interface KnowledgeBaseRefreshRequest {
  siteId: string;
  tenantId: string;
  releaseHash: string;
  contractPaths: Record<string, string>;
  reason: 'site_published' | 'manual_refresh' | 'scheduled_refresh';
  incremental?: boolean;
}

export interface KnowledgeBaseRefreshResult {
  success: boolean;
  refreshId: string;
  processedUrls: number;
  processedActions: number;
  indexingTime: number;
  errors?: string[];
}

/**
 * Service for integrating publishing pipeline with knowledge base operations
 */
export class KnowledgeBaseIntegration {
  constructor(
    private eventBus: EventBus,
    private artifactStore: ArtifactStore
  ) {
    this.setupEventListeners();
  }

  /**
   * Set up event listeners for publishing events
   */
  private setupEventListeners(): void {
    // Listen for site published events
    this.eventBus.on('site.published', async (event) => {
      try {
        await this.handleSitePublished(event);
      } catch (error) {
        logger.error('Failed to handle site published event', {
          error: error instanceof Error ? error.message : 'Unknown error',
          event
        });
      }
    });

    // Listen for KB refresh requests
    this.eventBus.on('kb.refreshRequested', async (event) => {
      try {
        await this.handleKnowledgeBaseRefresh(event);
      } catch (error) {
        logger.error('Failed to handle KB refresh request', {
          error: error instanceof Error ? error.message : 'Unknown error',
          event
        });
      }
    });
  }

  /**
   * Handle site published event
   */
  private async handleSitePublished(event: any): Promise<void> {
    logger.info('Handling site published event', {
      siteId: event.siteId,
      tenantId: event.tenantId,
      releaseHash: event.releaseHash
    });

    // Prepare KB refresh request
    const refreshRequest: KnowledgeBaseRefreshRequest = {
      siteId: event.siteId,
      tenantId: event.tenantId,
      releaseHash: event.releaseHash,
      contractPaths: event.contractPaths,
      reason: 'site_published',
      incremental: true
    };

    // Trigger knowledge base refresh
    await this.refreshKnowledgeBase(refreshRequest);
  }

  /**
   * Handle knowledge base refresh request
   */
  private async handleKnowledgeBaseRefresh(event: any): Promise<void> {
    logger.info('Handling KB refresh request', {
      siteId: event.siteId,
      releaseHash: event.releaseHash,
      reason: event.reason
    });

    // Load site contract data for indexing
    const contractData = await this.loadSiteContractData(event.siteId, event.releaseHash);
    
    if (contractData) {
      // Process contract data for knowledge base indexing
      await this.processContractForIndexing(event.siteId, contractData);
    }
  }

  /**
   * Refresh knowledge base with new site content
   */
  private async refreshKnowledgeBase(request: KnowledgeBaseRefreshRequest): Promise<KnowledgeBaseRefreshResult> {
    const startTime = Date.now();
    const refreshId = `kb_refresh_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    logger.info('Starting knowledge base refresh', {
      refreshId,
      siteId: request.siteId,
      releaseHash: request.releaseHash,
      reason: request.reason
    });

    try {
      // Load contract data from artifact store
      const contractData = await this.loadSiteContractData(request.siteId, request.releaseHash);
      
      if (!contractData) {
        throw new Error('Contract data not found');
      }

      // Process sitemap for URL discovery
      const processedUrls = await this.processSitemapForIndexing(contractData);
      
      // Process actions for agent capabilities
      const processedActions = await this.processActionsForIndexing(contractData);
      
      // Update structured data index
      await this.updateStructuredDataIndex(request.siteId, contractData);
      
      const indexingTime = Date.now() - startTime;
      
      const result: KnowledgeBaseRefreshResult = {
        success: true,
        refreshId,
        processedUrls,
        processedActions,
        indexingTime
      };

      logger.info('Knowledge base refresh completed', {
        refreshId,
        siteId: request.siteId,
        result
      });

      // Emit completion event
      this.eventBus.emit('kb.refreshCompleted', {
        siteId: request.siteId,
        refreshId,
        result
      });

      return result;

    } catch (error) {
      const indexingTime = Date.now() - startTime;
      
      const result: KnowledgeBaseRefreshResult = {
        success: false,
        refreshId,
        processedUrls: 0,
        processedActions: 0,
        indexingTime,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };

      logger.error('Knowledge base refresh failed', {
        refreshId,
        siteId: request.siteId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return result;
    }
  }

  /**
   * Load site contract data from artifact store
   */
  private async loadSiteContractData(siteId: string, releaseHash: string): Promise<ContractGenerationResult | null> {
    try {
      // Load various contract files
      const contractFiles = [
        'sitemap.xml',
        'actions.json',
        'structured-data.json',
        'speculation-rules.json'
      ];

      const contractData: any = {
        files: {},
        sitemap: null,
        actionsManifest: null,
        jsonLdData: null,
        speculationRules: null
      };

      // Load each contract file
      for (const filename of contractFiles) {
        try {
          const key = `${siteId}/${releaseHash}/contract/${filename}`;
          const fileStream = await this.artifactStore.getObject(key);
          
          // Convert stream to string
          const chunks: Buffer[] = [];
          for await (const chunk of fileStream) {
            chunks.push(chunk);
          }
          const content = Buffer.concat(chunks).toString();
          
          contractData.files[filename] = content;
          
          // Parse JSON files
          if (filename.endsWith('.json')) {
            const parsed = JSON.parse(content);
            switch (filename) {
              case 'actions.json':
                contractData.actionsManifest = parsed;
                break;
              case 'structured-data.json':
                contractData.jsonLdData = parsed;
                break;
              case 'speculation-rules.json':
                contractData.speculationRules = parsed;
                break;
            }
          } else if (filename === 'sitemap.xml') {
            // Parse XML sitemap (simplified)
            contractData.sitemap = this.parseSitemapXML(content);
          }
          
        } catch (error) {
          logger.warn(`Failed to load contract file: ${filename}`, {
            siteId,
            releaseHash,
            filename,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return contractData;

    } catch (error) {
      logger.error('Failed to load site contract data', {
        siteId,
        releaseHash,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Process contract data for knowledge base indexing
   */
  private async processContractForIndexing(siteId: string, contractData: any): Promise<void> {
    logger.info('Processing contract for KB indexing', { siteId });

    // TODO: Integrate with actual knowledge base service
    // This would typically involve:
    // 1. Extracting URLs from sitemap for crawling
    // 2. Updating action capabilities for AI agent
    // 3. Indexing structured data for enhanced search
    // 4. Processing speculation rules for performance optimization

    // For now, just log the processing
    logger.info('Contract processed for indexing', {
      siteId,
      sitemapUrls: contractData.sitemap?.urls?.length || 0,
      actions: contractData.actionsManifest?.actions?.length || 0,
      structuredDataTypes: contractData.jsonLdData?.length || 0
    });
  }

  /**
   * Process sitemap for URL indexing
   */
  private async processSitemapForIndexing(contractData: any): Promise<number> {
    if (!contractData.sitemap?.urls) {
      return 0;
    }

    const urls = contractData.sitemap.urls;
    
    // TODO: Submit URLs to knowledge base crawler
    // For now, just count them
    logger.debug('Processing sitemap URLs for indexing', {
      urlCount: urls.length
    });

    return urls.length;
  }

  /**
   * Process actions for agent capability indexing
   */
  private async processActionsForIndexing(contractData: any): Promise<number> {
    if (!contractData.actionsManifest?.actions) {
      return 0;
    }

    const actions = contractData.actionsManifest.actions;
    
    // TODO: Update AI agent capabilities with new actions
    // For now, just count them
    logger.debug('Processing actions for capability indexing', {
      actionCount: actions.length,
      actionTypes: [...new Set(actions.map((a: any) => a.type))]
    });

    return actions.length;
  }

  /**
   * Update structured data index
   */
  private async updateStructuredDataIndex(siteId: string, contractData: any): Promise<void> {
    if (!contractData.jsonLdData) {
      return;
    }

    const structuredData = contractData.jsonLdData;
    
    // TODO: Update knowledge base with structured data for enhanced responses
    logger.debug('Updating structured data index', {
      siteId,
      schemaTypes: structuredData.map((item: any) => item['@type']),
      count: structuredData.length
    });
  }

  /**
   * Parse sitemap XML (simplified)
   */
  private parseSitemapXML(xmlContent: string): any {
    // Simplified XML parsing - in production, use a proper XML parser
    const urls: any[] = [];
    const urlMatches = xmlContent.match(/<url>[\s\S]*?<\/url>/g);
    
    if (urlMatches) {
      for (const urlMatch of urlMatches) {
        const locMatch = urlMatch.match(/<loc>(.*?)<\/loc>/);
        const lastmodMatch = urlMatch.match(/<lastmod>(.*?)<\/lastmod>/);
        
        if (locMatch) {
          urls.push({
            loc: locMatch[1],
            lastmod: lastmodMatch ? new Date(lastmodMatch[1]) : new Date()
          });
        }
      }
    }

    return { urls };
  }

  /**
   * Manual refresh trigger for external use
   */
  async triggerManualRefresh(siteId: string, tenantId: string): Promise<KnowledgeBaseRefreshResult> {
    logger.info('Manual KB refresh triggered', { siteId, tenantId });

    // For manual refresh, we need to find the latest release
    // TODO: Implement latest release lookup
    const releaseHash = 'latest'; // Placeholder

    const request: KnowledgeBaseRefreshRequest = {
      siteId,
      tenantId,
      releaseHash,
      contractPaths: {}, // Will be loaded from artifact store
      reason: 'manual_refresh',
      incremental: false
    };

    return this.refreshKnowledgeBase(request);
  }
}

/**
 * Factory function for creating KB integration service
 */
export function createKnowledgeBaseIntegration(
  eventBus: EventBus,
  artifactStore: ArtifactStore
): KnowledgeBaseIntegration {
  return new KnowledgeBaseIntegration(eventBus, artifactStore);
}