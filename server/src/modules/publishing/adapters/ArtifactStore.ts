/**
 * Artifact Store Abstraction
 * 
 * Provides a uniform S3-compatible interface for immutable artifact storage.
 * Supports AWS S3, Cloudflare R2, MinIO and other S3-compatible providers.
 * 
 * Features:
 * - Immutable storage (prevents overwrite of existing releases)
 * - Presigned URL support for secure uploads/downloads
 * - Content-addressed storage with integrity verification
 * - Blue/green deployment support via alias management
 * - Comprehensive error handling and retry logic
 */

import { createLogger } from '../../../_shared/telemetry/logger';
import { S3Client, S3ClientConfig, GetObjectCommand, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

const logger = createLogger({ service: 'artifact-store' });

export interface ArtifactStoreConfig {
  provider: 'aws-s3' | 'cloudflare-r2' | 'minio';
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string; // For MinIO and R2
  forcePathStyle?: boolean; // For MinIO
  publicBaseUrl?: string; // For public access URLs
}

export interface PutObjectOptions {
  contentType?: string;
  cacheControl?: string;
  sha256?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
}

export interface PutObjectResult {
  etag: string;
  versionId?: string;
  url: string;
}

export interface HeadObjectResult {
  size: number;
  etag: string;
  lastModified: Date;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface PresignedUrlOptions {
  expiresIn: number; // seconds
  contentType?: string;
  contentLength?: number;
}

export interface PresignedPutResult {
  url: string;
  headers?: Record<string, string>;
  fields?: Record<string, string>; // For POST uploads
}

export interface PresignedGetResult {
  url: string;
}

export interface ListObjectsOptions {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface ListObjectsResult {
  objects: ObjectInfo[];
  isTruncated: boolean;
  continuationToken?: string;
}

export interface ObjectInfo {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

/**
 * Uniform artifact store interface
 */
export interface ArtifactStore {
  /**
   * Store an object with immutability guarantees
   */
  putObject(key: string, body: Buffer | Readable, options?: PutObjectOptions): Promise<PutObjectResult>;

  /**
   * Retrieve an object
   */
  getObject(key: string): Promise<Readable>;

  /**
   * Get object metadata without downloading content
   */
  headObject(key: string): Promise<HeadObjectResult>;

  /**
   * Generate presigned URL for uploading
   */
  presignPut(key: string, options: PresignedUrlOptions): Promise<PresignedPutResult>;

  /**
   * Generate presigned URL for downloading
   */
  presignGet(key: string, expiresIn: number): Promise<PresignedGetResult>;

  /**
   * List objects with optional prefix filtering
   */
  listObjects(options?: ListObjectsOptions): Promise<ListObjectsResult>;

  /**
   * Delete objects by prefix (use with caution)
   */
  deletePrefix(prefix: string): Promise<void>;

  /**
   * Get public URL for an object (if bucket allows public access)
   */
  getPublicUrl(key: string): Promise<string>;

  /**
   * Set alias pointer for blue/green deployment
   */
  setAlias(aliasKey: string, targetKey: string): Promise<void>;

  /**
   * Get current alias target
   */
  getAlias(aliasKey: string): Promise<string>;

  /**
   * Check if object exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get storage provider info
   */
  getProviderInfo(): { provider: string; region: string; bucket: string };
}

/**
 * S3-compatible artifact store implementation
 */
export class S3ArtifactStore implements ArtifactStore {
  private s3Client: S3Client;
  private config: ArtifactStoreConfig;

  constructor(config: ArtifactStoreConfig) {
    this.config = config;

    const clientConfig: S3ClientConfig = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    };

    // Configure for different providers
    if (config.provider === 'cloudflare-r2') {
      clientConfig.endpoint = config.endpoint || `https://${config.region}.r2.cloudflarestorage.com`;
      clientConfig.region = 'auto'; // R2 uses 'auto'
    } else if (config.provider === 'minio') {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = config.forcePathStyle ?? true;
    }

    this.s3Client = new S3Client(clientConfig);

    logger.info('Artifact store initialized', {
      provider: config.provider,
      region: config.region,
      bucket: config.bucket,
      endpoint: config.endpoint
    });
  }

  async putObject(key: string, body: Buffer | Readable, options: PutObjectOptions = {}): Promise<PutObjectResult> {
    try {
      // Check for immutability - prevent overwriting existing releases
      if (key.includes('/releases/') && await this.exists(key)) {
        throw new Error(`Immutable object already exists: ${key}. Use --force-replace for admin override.`);
      }

      const putCommand = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
        ChecksumSHA256: options.sha256,
        Metadata: options.metadata,
        Tagging: options.tags ? Object.entries(options.tags).map(([k, v]) => `${k}=${v}`).join('&') : undefined
      });

      const result = await this.s3Client.send(putCommand);

      if (!result.ETag) {
        throw new Error('Object upload failed: no ETag returned');
      }

      const url = await this.getPublicUrl(key);

      logger.debug('Object stored', {
        key,
        etag: result.ETag,
        versionId: result.VersionId,
        size: body instanceof Buffer ? body.length : 'stream'
      });

      return {
        etag: result.ETag.replace(/"/g, ''), // Remove quotes
        versionId: result.VersionId,
        url
      };

    } catch (error) {
      logger.error('Failed to store object', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getObject(key: string): Promise<Readable> {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });

      const result = await this.s3Client.send(getCommand);
      
      if (!result.Body) {
        throw new Error(`Object not found or empty: ${key}`);
      }

      return result.Body as Readable;

    } catch (error) {
      logger.error('Failed to get object', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });

      const result = await this.s3Client.send(headCommand);

      return {
        size: result.ContentLength || 0,
        etag: result.ETag?.replace(/"/g, '') || '',
        lastModified: result.LastModified || new Date(),
        contentType: result.ContentType,
        cacheControl: result.CacheControl,
        metadata: result.Metadata
      };

    } catch (error) {
      logger.error('Failed to head object', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async presignPut(key: string, options: PresignedUrlOptions): Promise<PresignedPutResult> {
    try {
      const putCommand = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: options.contentType,
        ContentLength: options.contentLength
      });

      const url = await getSignedUrl(this.s3Client, putCommand, {
        expiresIn: options.expiresIn
      });

      const headers: Record<string, string> = {};
      if (options.contentType) {
        headers['Content-Type'] = options.contentType;
      }
      if (options.contentLength) {
        headers['Content-Length'] = options.contentLength.toString();
      }

      return { url, headers };

    } catch (error) {
      logger.error('Failed to generate presigned PUT URL', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async presignGet(key: string, expiresIn: number): Promise<PresignedGetResult> {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });

      const url = await getSignedUrl(this.s3Client, getCommand, { expiresIn });

      return { url };

    } catch (error) {
      logger.error('Failed to generate presigned GET URL', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async listObjects(options: ListObjectsOptions = {}): Promise<ListObjectsResult> {
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: options.prefix,
        MaxKeys: options.maxKeys,
        ContinuationToken: options.continuationToken
      });

      const result = await this.s3Client.send(listCommand);

      const objects: ObjectInfo[] = (result.Contents || []).map(obj => ({
        key: obj.Key!,
        size: obj.Size || 0,
        lastModified: obj.LastModified || new Date(),
        etag: obj.ETag?.replace(/"/g, '') || ''
      }));

      return {
        objects,
        isTruncated: result.IsTruncated || false,
        continuationToken: result.NextContinuationToken
      };

    } catch (error) {
      logger.error('Failed to list objects', {
        prefix: options.prefix,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    try {
      logger.warn('Deleting objects by prefix', { prefix });

      let continuationToken: string | undefined;
      let deletedCount = 0;

      do {
        const listResult = await this.listObjects({
          prefix,
          maxKeys: 1000,
          continuationToken
        });

        if (listResult.objects.length === 0) {
          break;
        }

        // Delete objects in batches
        const deletePromises = listResult.objects.map(obj =>
          this.s3Client.send(new DeleteObjectCommand({
            Bucket: this.config.bucket,
            Key: obj.key
          }))
        );

        await Promise.all(deletePromises);
        deletedCount += listResult.objects.length;

        continuationToken = listResult.continuationToken;
      } while (continuationToken);

      logger.info('Deleted objects by prefix', { prefix, count: deletedCount });

    } catch (error) {
      logger.error('Failed to delete objects by prefix', {
        prefix,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getPublicUrl(key: string): Promise<string> {
    if (this.config.publicBaseUrl) {
      return `${this.config.publicBaseUrl}/${key}`;
    }

    // Default S3/R2 public URL format
    if (this.config.provider === 'cloudflare-r2') {
      return `https://pub-${this.config.bucket}.r2.dev/${key}`;
    }

    if (this.config.endpoint) {
      // Custom endpoint (MinIO)
      return `${this.config.endpoint}/${this.config.bucket}/${key}`;
    }

    // AWS S3 default
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  async setAlias(aliasKey: string, targetKey: string): Promise<void> {
    try {
      // Store alias as a small object pointing to the target
      const aliasContent = JSON.stringify({
        target: targetKey,
        createdAt: new Date().toISOString(),
        type: 'alias'
      });

      await this.putObject(aliasKey, Buffer.from(aliasContent), {
        contentType: 'application/json',
        cacheControl: 'no-cache',
        metadata: {
          'sitespeak-type': 'alias',
          'sitespeak-target': targetKey
        }
      });

      logger.info('Alias set', { aliasKey, targetKey });

    } catch (error) {
      logger.error('Failed to set alias', {
        aliasKey,
        targetKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getAlias(aliasKey: string): Promise<string> {
    try {
      const aliasStream = await this.getObject(aliasKey);
      
      // Convert stream to string
      const chunks: Buffer[] = [];
      for await (const chunk of aliasStream) {
        chunks.push(chunk);
      }
      
      const aliasContent = Buffer.concat(chunks).toString();
      const aliasData = JSON.parse(aliasContent);

      if (aliasData.type !== 'alias' || !aliasData.target) {
        throw new Error(`Invalid alias format: ${aliasKey}`);
      }

      return aliasData.target;

    } catch (error) {
      logger.error('Failed to get alias', {
        aliasKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.headObject(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  getProviderInfo(): { provider: string; region: string; bucket: string } {
    return {
      provider: this.config.provider,
      region: this.config.region,
      bucket: this.config.bucket
    };
  }
}

/**
 * Factory function for creating artifact store instances
 */
export function createArtifactStore(config: ArtifactStoreConfig): ArtifactStore {
  switch (config.provider) {
    case 'aws-s3':
    case 'cloudflare-r2':
    case 'minio':
      return new S3ArtifactStore(config);
    default:
      throw new Error(`Unsupported artifact store provider: ${config.provider}`);
  }
}

/**
 * Create artifact store from environment variables
 */
export function createArtifactStoreFromEnv(): ArtifactStore {
  const provider = process.env['ARTIFACT_STORE_PROVIDER'] || 'aws-s3';
  
  if (!['aws-s3', 'cloudflare-r2', 'minio'].includes(provider)) {
    throw new Error(`Invalid artifact store provider: ${provider}`);
  }

  // Determine configuration based on provider
  let config: ArtifactStoreConfig;

  if (provider === 'cloudflare-r2') {
    config = {
      provider: 'cloudflare-r2',
      region: 'auto',
      bucket: process.env['R2_BUCKET'] || process.env['ARTIFACT_BUCKET'] || 'sitespeak-artifacts',
      accessKeyId: process.env['R2_ACCESS_KEY_ID'] || process.env['ARTIFACT_ACCESS_KEY_ID'] || '',
      secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] || process.env['ARTIFACT_SECRET_KEY'] || '',
      endpoint: process.env['R2_ENDPOINT'],
      publicBaseUrl: process.env['R2_PUBLIC_URL'] || process.env['ARTIFACT_PUBLIC_URL']
    };
  } else if (provider === 'minio') {
    config = {
      provider: 'minio',
      region: process.env['MINIO_REGION'] || 'us-east-1',
      bucket: process.env['MINIO_BUCKET'] || process.env['ARTIFACT_BUCKET'] || 'sitespeak-artifacts',
      accessKeyId: process.env['MINIO_ACCESS_KEY'] || process.env['ARTIFACT_ACCESS_KEY_ID'] || '',
      secretAccessKey: process.env['MINIO_SECRET_KEY'] || process.env['ARTIFACT_SECRET_KEY'] || '',
      endpoint: process.env['MINIO_ENDPOINT'] || 'http://localhost:9000',
      forcePathStyle: true,
      publicBaseUrl: process.env['MINIO_PUBLIC_URL'] || process.env['ARTIFACT_PUBLIC_URL']
    };
  } else {
    // AWS S3
    config = {
      provider: 'aws-s3',
      region: process.env['AWS_REGION'] || process.env['ARTIFACT_REGION'] || 'us-east-1',
      bucket: process.env['AWS_BUCKET_NAME'] || process.env['ARTIFACT_BUCKET'] || 'sitespeak-artifacts',
      accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || process.env['ARTIFACT_ACCESS_KEY_ID'] || '',
      secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || process.env['ARTIFACT_SECRET_KEY'] || '',
      publicBaseUrl: process.env['AWS_PUBLIC_URL'] || process.env['ARTIFACT_PUBLIC_URL']
    };
  }

  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error(`Missing required credentials for artifact store provider: ${provider}`);
  }

  return createArtifactStore(config);
}