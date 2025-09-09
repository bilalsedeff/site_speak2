/**
 * Asset Upload Service
 * 
 * Provides presigned URLs for secure, direct-to-storage uploads to Cloudflare R2/S3.
 * Supports both single-part and multipart uploads with comprehensive validation.
 * 
 * Features:
 * - Presigned PUT URLs for direct browser uploads
 * - Multipart upload support for large files (>100MB)
 * - Content validation and security checks
 * - Tenant isolation and access control
 * - Comprehensive audit logging
 */

import { createLogger } from '../../../../services/_shared/telemetry/logger';
import { createArtifactStoreFromEnv, ArtifactStore } from '../../../publishing/adapters/ArtifactStore';

const logger = createLogger({ service: 'asset-upload-service' });

export interface PresignRequest {
  tenantId: string;
  siteId: string;
  filename: string;
  contentType: string;
  contentLength: number;
  acl?: 'private' | 'public-read';
  multipart?: boolean;
  expiresIn?: number; // seconds, default 600 (10 minutes)
  metadata?: Record<string, string>;
}

export interface PresignedUploadResponse {
  uploadId: string;
  uploadUrl: string;
  formData?: Record<string, string>; // For HTML form uploads
  expires: Date;
  maxFileSize: number;
  allowedContentTypes: string[];
  multipart?: {
    uploadId: string;
    partSize: number;
    maxParts: number;
  };
}

export interface MultipartUploadRequest {
  tenantId: string;
  siteId: string;
  filename: string;
  contentType: string;
  contentLength: number;
  partSize?: number; // default 10MB
}

export interface MultipartUploadResponse {
  uploadId: string;
  partSize: number;
  totalParts: number;
  parts: MultipartPart[];
  expires: Date;
}

export interface MultipartPart {
  partNumber: number;
  uploadUrl: string;
  expires: Date;
}

export interface CompleteMultipartRequest {
  tenantId: string;
  uploadId: string;
  parts: CompletedPart[];
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface PresignedDownloadRequest {
  tenantId: string;
  siteId: string;
  assetId: string;
  filename?: string;
  attachment?: boolean;
  expiresIn?: number; // seconds, default 3600 (1 hour)
}

export interface PresignedDownloadResponse {
  downloadUrl: string;
  expires: Date;
  filename: string;
  contentType: string;
  contentLength?: number;
}

export class AssetUploadService {
  private artifactStore: ArtifactStore;
  
  // Validation constants
  private readonly MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
  private readonly MIN_MULTIPART_SIZE = 100 * 1024 * 1024; // 100MB
  private readonly DEFAULT_PART_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_PARTS = 1000;
  private readonly DEFAULT_UPLOAD_EXPIRES = 600; // 10 minutes
  private readonly DEFAULT_DOWNLOAD_EXPIRES = 3600; // 1 hour

  private readonly ALLOWED_CONTENT_TYPES = new Set([
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    // Documents
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/json',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    // Video
    'video/mp4',
    'video/webm',
    'video/ogg',
    // Archives
    'application/zip',
    'application/x-tar',
    'application/gzip',
  ]);

  constructor() {
    this.artifactStore = createArtifactStoreFromEnv();
    this.validateConfiguration();
  }

  /**
   * Generate presigned URL for single-part upload
   */
  async presignUpload(request: PresignRequest): Promise<PresignedUploadResponse> {
    logger.info('Generating presigned upload URL', {
      tenantId: request.tenantId,
      siteId: request.siteId,
      filename: request.filename,
      contentType: request.contentType,
      contentLength: request.contentLength,
      multipart: request.multipart,
    });

    // Validate request
    await this.validateUploadRequest(request);

    // Generate upload key
    const uploadId = crypto.randomUUID();
    const key = this.generateAssetKey(request.tenantId, request.siteId, uploadId, request.filename);
    
    const expiresIn = request.expiresIn || this.DEFAULT_UPLOAD_EXPIRES;
    const expires = new Date(Date.now() + expiresIn * 1000);

    try {
      let uploadUrl: string;
      let formData: Record<string, string> | undefined;

      if (request.multipart || request.contentLength > this.MIN_MULTIPART_SIZE) {
        // Use multipart upload for large files
        const multipartResponse = await this.initiateMultipartUpload({
          tenantId: request.tenantId,
          siteId: request.siteId,
          filename: request.filename,
          contentType: request.contentType,
          contentLength: request.contentLength,
        });

        return {
          uploadId,
          uploadUrl: '', // Not used for multipart
          expires,
          maxFileSize: this.MAX_FILE_SIZE,
          allowedContentTypes: Array.from(this.ALLOWED_CONTENT_TYPES),
          multipart: {
            uploadId: multipartResponse.uploadId,
            partSize: multipartResponse.partSize,
            maxParts: multipartResponse.totalParts,
          },
        };
      } else {
        // Use single-part upload
        const presignResult = await this.artifactStore.presignPut(key, {
          contentType: request.contentType,
          expiresIn,
          contentLength: request.contentLength,
        });
        
        uploadUrl = presignResult.url;

        // Generate form data for HTML forms if needed
        if (request.acl === 'public-read') {
          formData = {
            'Content-Type': request.contentType,
            'x-amz-acl': 'public-read',
            'x-amz-meta-tenant-id': request.tenantId,
            'x-amz-meta-site-id': request.siteId,
            'x-amz-meta-upload-id': uploadId,
          };
        }
      }

      const response: PresignedUploadResponse = {
        uploadId,
        uploadUrl,
        ...(formData && { formData }),
        expires,
        maxFileSize: this.MAX_FILE_SIZE,
        allowedContentTypes: Array.from(this.ALLOWED_CONTENT_TYPES),
      };

      logger.info('Presigned upload URL generated successfully', {
        tenantId: request.tenantId,
        siteId: request.siteId,
        uploadId,
        expires: expires.toISOString(),
      });

      return response;

    } catch (error) {
      logger.error('Failed to generate presigned upload URL', {
        tenantId: request.tenantId,
        siteId: request.siteId,
        error,
      });
      throw error;
    }
  }

  /**
   * Initiate multipart upload
   */
  async initiateMultipartUpload(request: MultipartUploadRequest): Promise<MultipartUploadResponse> {
    logger.info('Initiating multipart upload', {
      tenantId: request.tenantId,
      siteId: request.siteId,
      filename: request.filename,
      contentLength: request.contentLength,
    });

    const partSize = request.partSize || this.DEFAULT_PART_SIZE;
    const totalParts = Math.ceil(request.contentLength / partSize);

    if (totalParts > this.MAX_PARTS) {
      throw new Error(`File too large: requires ${totalParts} parts, maximum ${this.MAX_PARTS} allowed`);
    }

    // TODO: Implement multipart upload in ArtifactStore interface
    throw new Error('Multipart upload not yet implemented in ArtifactStore interface');
      
    // The rest of this method is commented out until multipart upload is implemented in ArtifactStore
    /*
    try {
      // Initialize multipart upload with S3
      // const multipartUploadId = await this.artifactStore.initiateMultipartUpload(key, {
      //   contentType: request.contentType,
      //   metadata: {
      //     tenantId: request.tenantId,
      //     siteId: request.siteId,
      //     originalFilename: request.filename,
      //     uploadId,
      //   },
      // });

      // Generate presigned URLs for each part
      const parts: MultipartPart[] = [];
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const partUploadUrl = await this.artifactStore.getPresignedMultipartPartUrl(
          key,
          multipartUploadId,
          partNumber,
          this.DEFAULT_UPLOAD_EXPIRES
        );

        parts.push({
          partNumber,
          uploadUrl: partUploadUrl,
          expires,
        });
      }

      const response: MultipartUploadResponse = {
        uploadId: multipartUploadId,
        partSize,
        totalParts,
        parts,
        expires,
      };

      logger.info('Multipart upload initiated successfully', {
        tenantId: request.tenantId,
        siteId: request.siteId,
        uploadId: multipartUploadId,
        totalParts,
        partSize,
      });

      return response;

    } catch (error) {
      logger.error('Failed to initiate multipart upload', {
        tenantId: request.tenantId,
        siteId: request.siteId,
        error,
      });
      throw error;
    }
    */
  }

  /**
   * Complete multipart upload
   */
  async completeMultipartUpload(request: CompleteMultipartRequest): Promise<{
    location: string;
    etag: string;
  }> {
    logger.info('Completing multipart upload', {
      tenantId: request.tenantId,
      uploadId: request.uploadId,
      partsCount: request.parts.length,
    });

    // TODO: Implement multipart upload in ArtifactStore interface
    throw new Error('Multipart upload not yet implemented in ArtifactStore interface');
    
    /*
    try {
      // This would call the artifact store's complete multipart upload method
      // For now, we'll return a mock response
      const result = await this.artifactStore.completeMultipartUpload(
        '', // key would be stored with uploadId
        request.uploadId,
        request.parts
      );

      logger.info('Multipart upload completed successfully', {
        tenantId: request.tenantId,
        uploadId: request.uploadId,
        location: result.location,
      });

      return result;

    } catch (error) {
      logger.error('Failed to complete multipart upload', {
        tenantId: request.tenantId,
        uploadId: request.uploadId,
        error,
      });
      throw error;
    }
    */
  }

  /**
   * Abort multipart upload
   */
  async abortMultipartUpload(_tenantId: string, _uploadId: string): Promise<void> {
    // TODO: Implement multipart upload in ArtifactStore interface
    throw new Error('Multipart upload not yet implemented in ArtifactStore interface');
    
    /*
    logger.info('Aborting multipart upload', { tenantId, uploadId });

    try {
      await this.artifactStore.abortMultipartUpload('', uploadId);
      
      logger.info('Multipart upload aborted successfully', { tenantId, uploadId });

    } catch (error) {
      logger.error('Failed to abort multipart upload', { tenantId, uploadId, error });
      throw error;
    }
    */
  }

  /**
   * Generate presigned URL for download
   */
  async presignDownload(request: PresignedDownloadRequest): Promise<PresignedDownloadResponse> {
    logger.info('Generating presigned download URL', {
      tenantId: request.tenantId,
      siteId: request.siteId,
      assetId: request.assetId,
      attachment: request.attachment,
    });

    // Generate asset key
    const key = this.generateAssetKey(request.tenantId, request.siteId, request.assetId, request.filename || '');
    
    const expiresIn = request.expiresIn || this.DEFAULT_DOWNLOAD_EXPIRES;
    const expires = new Date(Date.now() + expiresIn * 1000);

    try {
      const getResult = await this.artifactStore.presignGet(key, expiresIn);
      const downloadUrl = getResult.url;

      const response: PresignedDownloadResponse = {
        downloadUrl,
        expires,
        filename: request.filename || request.assetId,
        contentType: 'application/octet-stream', // Would be retrieved from metadata
      };

      logger.info('Presigned download URL generated successfully', {
        tenantId: request.tenantId,
        assetId: request.assetId,
        expires: expires.toISOString(),
      });

      return response;

    } catch (error) {
      logger.error('Failed to generate presigned download URL', {
        tenantId: request.tenantId,
        assetId: request.assetId,
        error,
      });
      throw error;
    }
  }

  /**
   * Validate upload request
   */
  private async validateUploadRequest(request: PresignRequest): Promise<void> {
    // Validate content type
    if (!this.ALLOWED_CONTENT_TYPES.has(request.contentType)) {
      throw new Error(`Content type not allowed: ${request.contentType}`);
    }

    // Validate file size
    if (request.contentLength > this.MAX_FILE_SIZE) {
      throw new Error(`File too large: ${request.contentLength} bytes, maximum ${this.MAX_FILE_SIZE} allowed`);
    }

    if (request.contentLength <= 0) {
      throw new Error('Content length must be greater than 0');
    }

    // Validate filename
    if (!request.filename || !request.filename.trim()) {
      throw new Error('Filename is required');
    }

    // Check for dangerous file extensions
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js'];
    const extension = request.filename.toLowerCase().substring(request.filename.lastIndexOf('.'));
    if (dangerousExtensions.includes(extension)) {
      throw new Error(`File extension not allowed: ${extension}`);
    }

    // Validate tenant and site IDs
    if (!request.tenantId || !request.siteId) {
      throw new Error('Tenant ID and Site ID are required');
    }

    // Additional validation for multipart
    if (request.multipart && request.contentLength < this.MIN_MULTIPART_SIZE) {
      throw new Error(`File too small for multipart upload: minimum ${this.MIN_MULTIPART_SIZE} bytes required`);
    }
  }

  /**
   * Generate asset storage key
   */
  private generateAssetKey(tenantId: string, siteId: string, uploadId: string, filename: string): string {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${tenantId}/${siteId}/assets/${timestamp}-${uploadId}-${sanitizedFilename}`;
  }

  /**
   * Validate service configuration
   */
  private validateConfiguration(): void {
    if (!this.artifactStore) {
      throw new Error('Artifact store not configured');
    }

    logger.info('Asset upload service initialized', {
      maxFileSize: this.MAX_FILE_SIZE,
      minMultipartSize: this.MIN_MULTIPART_SIZE,
      defaultPartSize: this.DEFAULT_PART_SIZE,
      allowedContentTypes: this.ALLOWED_CONTENT_TYPES.size,
    });
  }

  /**
   * Get upload statistics
   */
  getUploadLimits(): {
    maxFileSize: number;
    minMultipartSize: number;
    defaultPartSize: number;
    maxParts: number;
    allowedContentTypes: string[];
  } {
    return {
      maxFileSize: this.MAX_FILE_SIZE,
      minMultipartSize: this.MIN_MULTIPART_SIZE,
      defaultPartSize: this.DEFAULT_PART_SIZE,
      maxParts: this.MAX_PARTS,
      allowedContentTypes: Array.from(this.ALLOWED_CONTENT_TYPES),
    };
  }
}

export const assetUploadService = new AssetUploadService();