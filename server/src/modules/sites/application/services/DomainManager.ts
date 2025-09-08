/**
 * Domain Manager Service
 * 
 * Handles custom domain connection with DNS verification and ACME certificate provisioning.
 * Supports both HTTP-01 and DNS-01 challenge types for flexible domain verification.
 * 
 * Features:
 * - DNS verification (CNAME/A/AAAA record checking)
 * - ACME HTTP-01 and DNS-01 challenge support
 * - Certificate provisioning with Let's Encrypt
 * - Domain status tracking and management
 * - Multi-tenant domain isolation
 */

import { createLogger } from '../../../../services/_shared/telemetry/logger';
import { EventBus } from '../../../../services/_shared/events/eventBus';
import type { SiteRepository } from '../../../../domain/repositories/SiteRepository';

const logger = createLogger({ service: 'domain-manager' });

export type DomainVerificationMethod = 'HTTP-01' | 'DNS-01';

export type DomainStatus = 
  | 'pending_verification'
  | 'dns_verification_required'
  | 'acme_challenge_pending'
  | 'certificate_pending'
  | 'active'
  | 'failed'
  | 'disabled';

export interface DomainConnectionRequest {
  siteId: string;
  tenantId: string;
  domain: string;
  verificationMethod: DomainVerificationMethod;
  correlationId?: string;
}

export interface DomainVerificationResult {
  domain: string;
  verified: boolean;
  records: DnsRecord[];
  requiredRecords: DnsRecord[];
  errors: string[];
}

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT';
  name: string;
  value: string;
  ttl?: number;
}

export interface AcmeChallenge {
  type: DomainVerificationMethod;
  token: string;
  keyAuthorization: string;
  url: string;
  status: 'pending' | 'processing' | 'valid' | 'invalid';
  expires: Date;
}

export interface DomainCertificate {
  domain: string;
  certificate: string;
  privateKey: string;
  certificateChain: string;
  issuer: string;
  issuedAt: Date;
  expiresAt: Date;
  renewalEligible: boolean;
}

export interface DomainConfiguration {
  siteId: string;
  tenantId: string;
  domain: string;
  status: DomainStatus;
  verificationMethod: DomainVerificationMethod;
  dnsRecords: DnsRecord[];
  acmeChallenge?: AcmeChallenge;
  certificate?: DomainCertificate;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt?: Date;
  lastError?: string;
}

export class DomainManager {
  // Mock DNS/ACME services - in production these would be real integrations
  private dnsResolver: DnsResolver;
  private acmeClient: AcmeClient;

  constructor(
    private siteRepository: SiteRepository,
    private eventBus: EventBus
  ) {
    this.dnsResolver = new MockDnsResolver();
    this.acmeClient = new MockAcmeClient();
    this.setupEventListeners();
  }

  /**
   * Initiate domain connection process
   */
  async connectDomain(request: DomainConnectionRequest): Promise<DomainConfiguration> {
    logger.info('Initiating domain connection', {
      siteId: request.siteId,
      tenantId: request.tenantId,
      domain: request.domain,
      verificationMethod: request.verificationMethod,
      correlationId: request.correlationId,
    });

    // Validate domain format
    this.validateDomain(request.domain);

    // Check if domain is already in use
    await this.checkDomainAvailability(request.domain, request.siteId);

    // Verify site exists and user has access
    const site = await this.siteRepository.findById(request.siteId);
    if (!site) {
      throw new Error(`Site not found: ${request.siteId}`);
    }
    if (site.tenantId !== request.tenantId) {
      throw new Error('Site not found in tenant');
    }

    const domainConfig: DomainConfiguration = {
      siteId: request.siteId,
      tenantId: request.tenantId,
      domain: request.domain,
      status: 'pending_verification',
      verificationMethod: request.verificationMethod,
      dnsRecords: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      // Start DNS verification
      const verificationResult = await this.verifyDnsRecords(domainConfig);
      
      if (verificationResult.verified) {
        domainConfig.status = 'acme_challenge_pending';
        domainConfig.verifiedAt = new Date();
        
        // Start ACME challenge
        await this.startAcmeChallenge(domainConfig);
      } else {
        domainConfig.status = 'dns_verification_required';
        domainConfig.dnsRecords = verificationResult.requiredRecords;
        domainConfig.lastError = verificationResult.errors.join('; ');
      }

      domainConfig.updatedAt = new Date();

      // Emit event for tracking
      this.eventBus.emit('domain.connection_initiated', {
        siteId: request.siteId,
        tenantId: request.tenantId,
        domain: request.domain,
        status: domainConfig.status,
        correlationId: request.correlationId,
      });

      return domainConfig;

    } catch (error) {
      logger.error('Domain connection failed', {
        siteId: request.siteId,
        domain: request.domain,
        error,
        correlationId: request.correlationId,
      });

      domainConfig.status = 'failed';
      domainConfig.lastError = (error as Error).message;
      domainConfig.updatedAt = new Date();

      throw error;
    }
  }

  /**
   * Verify DNS records for domain
   */
  async verifyDnsRecords(domainConfig: DomainConfiguration): Promise<DomainVerificationResult> {
    logger.info('Verifying DNS records', {
      domain: domainConfig.domain,
      siteId: domainConfig.siteId,
    });

    const requiredRecords = this.getRequiredDnsRecords(domainConfig);
    const actualRecords = await this.dnsResolver.resolveRecords(domainConfig.domain);
    
    const errors: string[] = [];
    let verified = true;

    for (const required of requiredRecords) {
      const matching = actualRecords.find(actual => 
        actual.type === required.type &&
        actual.name === required.name &&
        this.matchesRecordValue(actual.value, required.value)
      );

      if (!matching) {
        verified = false;
        errors.push(`Missing ${required.type} record: ${required.name} -> ${required.value}`);
      }
    }

    return {
      domain: domainConfig.domain,
      verified,
      records: actualRecords,
      requiredRecords,
      errors,
    };
  }

  /**
   * Start ACME challenge for domain
   */
  async startAcmeChallenge(domainConfig: DomainConfiguration): Promise<void> {
    logger.info('Starting ACME challenge', {
      domain: domainConfig.domain,
      method: domainConfig.verificationMethod,
      siteId: domainConfig.siteId,
    });

    try {
      const challenge = await this.acmeClient.createChallenge(
        domainConfig.domain,
        domainConfig.verificationMethod
      );

      domainConfig.acmeChallenge = challenge;
      domainConfig.status = 'acme_challenge_pending';
      domainConfig.updatedAt = new Date();

      // For HTTP-01, we need to make the challenge response available
      if (challenge.type === 'HTTP-01') {
        await this.setupHttpChallenge(domainConfig, challenge);
      }

      // For DNS-01, we need to create a TXT record
      if (challenge.type === 'DNS-01') {
        await this.setupDnsChallenge(domainConfig, challenge);
      }

      this.eventBus.emit('domain.acme_challenge_started', {
        siteId: domainConfig.siteId,
        tenantId: domainConfig.tenantId,
        domain: domainConfig.domain,
        challengeType: challenge.type,
        challengeToken: challenge.token,
      });

    } catch (error) {
      logger.error('ACME challenge setup failed', {
        domain: domainConfig.domain,
        error,
      });
      throw error;
    }
  }

  /**
   * Complete ACME challenge and provision certificate
   */
  async completeAcmeChallenge(domainConfig: DomainConfiguration): Promise<DomainCertificate> {
    if (!domainConfig.acmeChallenge) {
      throw new Error('No ACME challenge in progress');
    }

    logger.info('Completing ACME challenge', {
      domain: domainConfig.domain,
      challengeType: domainConfig.acmeChallenge.type,
      siteId: domainConfig.siteId,
    });

    try {
      // Verify challenge
      const challengeResult = await this.acmeClient.verifyChallenge(
        domainConfig.acmeChallenge.url,
        domainConfig.acmeChallenge.keyAuthorization
      );

      if (!challengeResult.verified) {
        throw new Error(`ACME challenge verification failed: ${challengeResult.error}`);
      }

      // Request certificate
      const certificate = await this.acmeClient.requestCertificate(domainConfig.domain);
      
      domainConfig.certificate = certificate;
      domainConfig.status = 'active';
      domainConfig.updatedAt = new Date();

      this.eventBus.emit('domain.certificate_issued', {
        siteId: domainConfig.siteId,
        tenantId: domainConfig.tenantId,
        domain: domainConfig.domain,
        certificate: {
          issuer: certificate.issuer,
          issuedAt: certificate.issuedAt,
          expiresAt: certificate.expiresAt,
        },
      });

      logger.info('Certificate issued successfully', {
        domain: domainConfig.domain,
        issuer: certificate.issuer,
        expiresAt: certificate.expiresAt,
      });

      return certificate;

    } catch (error) {
      logger.error('ACME challenge completion failed', {
        domain: domainConfig.domain,
        error,
      });

      domainConfig.status = 'failed';
      domainConfig.lastError = (error as Error).message;
      domainConfig.updatedAt = new Date();

      throw error;
    }
  }

  /**
   * Renew certificate for domain
   */
  async renewCertificate(domain: string, tenantId: string): Promise<DomainCertificate> {
    logger.info('Renewing certificate', { domain, tenantId });

    // This would load the domain configuration from storage
    // For now, we'll create a mock implementation
    try {
      const newCertificate = await this.acmeClient.renewCertificate(domain);
      
      this.eventBus.emit('domain.certificate_renewed', {
        tenantId,
        domain,
        certificate: {
          issuer: newCertificate.issuer,
          issuedAt: newCertificate.issuedAt,
          expiresAt: newCertificate.expiresAt,
        },
      });

      return newCertificate;

    } catch (error) {
      logger.error('Certificate renewal failed', { domain, tenantId, error });
      throw error;
    }
  }

  /**
   * Remove domain configuration
   */
  async removeDomain(siteId: string, domain: string, tenantId: string): Promise<void> {
    logger.info('Removing domain', { siteId, domain, tenantId });

    // Remove domain from site
    const site = await this.siteRepository.findById(siteId);
    if (!site) {
      throw new Error(`Site not found: ${siteId}`);
    }

    if (site.customDomain === domain) {
      await this.siteRepository.removeCustomDomain(siteId);
    }

    this.eventBus.emit('domain.removed', {
      siteId,
      tenantId,
      domain,
    });
  }

  /**
   * Get domain status and configuration
   */
  async getDomainStatus(_domain: string, _tenantId: string): Promise<DomainConfiguration | null> {
    // This would load from storage - mock implementation
    return null;
  }

  /**
   * List domains for tenant
   */
  async listDomains(_tenantId: string): Promise<DomainConfiguration[]> {
    // This would load from storage - mock implementation
    return [];
  }

  /**
   * Private helper methods
   */

  private validateDomain(domain: string): void {
    const domainRegex = /^[a-z0-9]+([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]+([-a-z0-9]*[a-z0-9])?)*$/i;
    if (!domainRegex.test(domain)) {
      throw new Error(`Invalid domain format: ${domain}`);
    }

    if (domain.length > 255) {
      throw new Error('Domain name too long');
    }

    // Check for reserved domains
    const reservedDomains = ['sitespeak.com', 'localhost', 'example.com'];
    if (reservedDomains.some(reserved => domain.endsWith(reserved))) {
      throw new Error(`Domain not allowed: ${domain}`);
    }
  }

  private async checkDomainAvailability(domain: string, excludeSiteId?: string): Promise<void> {
    const existing = await this.siteRepository.findByCustomDomain(domain);
    if (existing && existing.id !== excludeSiteId) {
      throw new Error(`Domain already in use: ${domain}`);
    }
  }

  private getRequiredDnsRecords(domainConfig: DomainConfiguration): DnsRecord[] {
    // Generate required DNS records based on SiteSpeak infrastructure
    const sitespeakIp = '192.168.1.100'; // This would be the actual SiteSpeak load balancer IP
    const cname = 'sites.sitespeak.com'; // This would be the actual CNAME target

    // For apex domains, require A record. For subdomains, allow CNAME
    const isApexDomain = !domainConfig.domain.includes('.');
    
    if (isApexDomain) {
      return [
        {
          type: 'A',
          name: domainConfig.domain,
          value: sitespeakIp,
        },
      ];
    } else {
      return [
        {
          type: 'CNAME',
          name: domainConfig.domain,
          value: cname,
        },
      ];
    }
  }

  private matchesRecordValue(actualValue: string, requiredValue: string): boolean {
    // Normalize values for comparison
    return actualValue.toLowerCase().trim() === requiredValue.toLowerCase().trim();
  }

  private async setupHttpChallenge(domainConfig: DomainConfiguration, challenge: AcmeChallenge): Promise<void> {
    // Set up HTTP challenge endpoint
    // This would integrate with the web server to serve the challenge response
    logger.info('Setting up HTTP-01 challenge', {
      domain: domainConfig.domain,
      token: challenge.token,
    });

    // In a real implementation, this would:
    // 1. Store the challenge response in a way the web server can serve it
    // 2. Configure the web server to respond to /.well-known/acme-challenge/{token}
  }

  private async setupDnsChallenge(domainConfig: DomainConfiguration, challenge: AcmeChallenge): Promise<void> {
    // Set up DNS TXT record for challenge
    logger.info('Setting up DNS-01 challenge', {
      domain: domainConfig.domain,
      token: challenge.token,
    });

    // In a real implementation, this would:
    // 1. Create a TXT record at _acme-challenge.{domain}
    // 2. Set the record value to the key authorization
    
    const txtRecord: DnsRecord = {
      type: 'TXT',
      name: `_acme-challenge.${domainConfig.domain}`,
      value: challenge.keyAuthorization,
    };

    domainConfig.dnsRecords.push(txtRecord);
  }

  private setupEventListeners(): void {
    // Listen for certificate expiration warnings
    this.eventBus.on('certificate.expiring_soon', async (event) => {
      logger.warn('Certificate expiring soon', event);
      
      try {
        await this.renewCertificate(event.domain, event.tenantId);
      } catch (error) {
        logger.error('Auto-renewal failed', { event, error });
      }
    });
  }
}

/**
 * Mock DNS Resolver - Replace with real DNS resolution
 */
class MockDnsResolver implements DnsResolver {
  async resolveRecords(domain: string): Promise<DnsRecord[]> {
    // Mock DNS resolution
    return [
      {
        type: 'A',
        name: domain,
        value: '192.168.1.100',
        ttl: 300,
      },
    ];
  }
}

/**
 * Mock ACME Client - Replace with real ACME implementation
 */
class MockAcmeClient implements AcmeClient {
  async createChallenge(_domain: string, method: DomainVerificationMethod): Promise<AcmeChallenge> {
    return {
      type: method,
      token: crypto.randomUUID(),
      keyAuthorization: crypto.randomUUID(),
      url: `https://acme-v02.api.letsencrypt.org/challenge/${crypto.randomUUID()}`,
      status: 'pending',
      expires: new Date(Date.now() + 3600000), // 1 hour
    };
  }

  async verifyChallenge(_url: string, _keyAuth: string): Promise<{ verified: boolean; error?: string }> {
    // Mock verification - always succeeds
    return { verified: true };
  }

  async requestCertificate(domain: string): Promise<DomainCertificate> {
    const now = new Date();
    const expires = new Date(now.getTime() + 90 * 24 * 3600000); // 90 days

    return {
      domain,
      certificate: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
      privateKey: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
      certificateChain: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
      issuer: "Let's Encrypt",
      issuedAt: now,
      expiresAt: expires,
      renewalEligible: false,
    };
  }

  async renewCertificate(domain: string): Promise<DomainCertificate> {
    return this.requestCertificate(domain);
  }
}

/**
 * Interfaces for external services
 */
interface DnsResolver {
  resolveRecords(domain: string): Promise<DnsRecord[]>;
}

interface AcmeClient {
  createChallenge(domain: string, method: DomainVerificationMethod): Promise<AcmeChallenge>;
  verifyChallenge(url: string, keyAuth: string): Promise<{ verified: boolean; error?: string }>;
  requestCertificate(domain: string): Promise<DomainCertificate>;
  renewCertificate(domain: string): Promise<DomainCertificate>;
}

export const domainManager = new DomainManager(
  {} as SiteRepository, // Would be injected
  new EventBus()
);