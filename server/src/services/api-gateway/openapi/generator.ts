/**
 * OpenAPI 3.1 Specification Generator
 * 
 * Generates OpenAPI 3.1 spec aligned with JSON Schema 2020-12
 * Includes all API Gateway endpoints with proper schemas
 */

import { OpenAPIV3_1 } from 'openapi-types';
import { createLogger } from '../../_shared/telemetry/logger';

const logger = createLogger({ service: 'openapi-generator' });

/**
 * Generate OpenAPI 3.1 specification
 */
export function generateOpenAPISpec(options: {
  baseUrl?: string;
  version?: string;
  title?: string;
  description?: string;
} = {}): OpenAPIV3_1.Document {
  const {
    baseUrl = 'https://api.sitespeak.ai',
    version = '1.0.0',
    title = 'SiteSpeak API Gateway',
    description = 'Comprehensive API for SiteSpeak voice-first website builder with AI assistant capabilities'
  } = options;

  logger.info('Generating OpenAPI 3.1 specification', { baseUrl, version, title });

  const spec: OpenAPIV3_1.Document = {
    openapi: '3.1.0',
    info: {
      title,
      description,
      version,
      termsOfService: `${baseUrl}/terms`,
      contact: {
        name: 'SiteSpeak API Support',
        url: `${baseUrl}/support`,
        email: 'api-support@sitespeak.ai'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      },
      summary: 'Voice-first AI-powered website builder API'
    },
    servers: [
      {
        url: `${baseUrl}/api/v1`,
        description: 'Production API v1'
      },
      {
        url: 'http://localhost:5000/api/v1',
        description: 'Development API v1'
      }
    ],
    paths: {
      // Health endpoints
      '/health': healthEndpoints['/health'],
      '/health/live': healthEndpoints['/health/live'],
      '/health/ready': healthEndpoints['/health/ready'],
      
      // Knowledge Base endpoints
      '/kb/search': kbEndpoints['/kb/search'],
      '/kb/reindex': kbEndpoints['/kb/reindex'],
      '/kb/status': kbEndpoints['/kb/status'],
      '/kb/health': kbEndpoints['/kb/health'],
      
      // Voice endpoints
      '/voice/session': voiceEndpoints['/voice/session'],
      '/voice/stream': voiceEndpoints['/voice/stream'],
      '/voice/session/{sessionId}': voiceEndpoints['/voice/session/{sessionId}'],
      '/voice/health': voiceEndpoints['/voice/health'],
      
      // Auth endpoints (existing)
      '/auth/login': authEndpoints['/auth/login'],
      '/auth/register': authEndpoints['/auth/register'],
      '/auth/refresh': authEndpoints['/auth/refresh'],
      '/auth/logout': authEndpoints['/auth/logout'],
      
      // AI endpoints (existing)
      '/ai/conversation': aiEndpoints['/ai/conversation'],
      '/ai/conversation/stream': aiEndpoints['/ai/conversation/stream'],
      '/ai/actions/execute': aiEndpoints['/ai/actions/execute'],
      
      // Sites endpoints (existing)
      '/sites/contracts': sitesEndpoints['/sites/contracts'],
      '/sites/manifests/{siteId}': sitesEndpoints['/sites/manifests/{siteId}']
    },
    components: {
      schemas: {
        ...commonSchemas,
        ...problemDetailSchemas,
        ...kbSchemas,
        ...voiceSchemas,
        ...authSchemas,
        ...aiSchemas,
        ...sitesSchemas
      },
      responses: commonResponses,
      parameters: commonParameters,
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from authentication endpoints'
        },
        TenantHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Tenant-ID',
          description: 'Tenant ID for multi-tenant isolation (optional, derived from JWT)'
        }
      }
    },
    security: [
      { BearerAuth: [] }
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check and monitoring endpoints'
      },
      {
        name: 'Knowledge Base',
        description: 'Vector search and knowledge base management'
      },
      {
        name: 'Voice',
        description: 'Real-time voice AI interactions'
      },
      {
        name: 'Authentication',
        description: 'User authentication and session management'
      },
      {
        name: 'AI',
        description: 'AI conversation and action execution'
      },
      {
        name: 'Sites',
        description: 'Site contracts and manifest generation'
      }
    ],
    externalDocs: {
      description: 'Complete API Documentation',
      url: `${baseUrl}/docs`
    }
  };

  return spec;
}

// Health endpoints
const healthEndpoints: Record<string, OpenAPIV3_1.PathItemObject> = {
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Basic health check',
      description: 'Returns overall system health status',
      operationId: 'getHealth',
      security: [],
      responses: {
        '200': {
          description: 'System is healthy',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/HealthResponse' }
            }
          }
        },
        '503': {
          description: 'System is unhealthy',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/HealthResponse' }
            }
          }
        }
      }
    }
  },
  '/health/live': {
    get: {
      tags: ['Health'],
      summary: 'Liveness probe',
      description: 'Kubernetes liveness probe endpoint',
      operationId: 'getLiveness',
      security: [],
      responses: {
        '200': {
          description: 'Service is alive',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LivenessResponse' }
            }
          }
        }
      }
    }
  },
  '/health/ready': {
    get: {
      tags: ['Health'],
      summary: 'Readiness probe',
      description: 'Kubernetes readiness probe endpoint',
      operationId: 'getReadiness',
      security: [],
      responses: {
        '200': {
          description: 'Service is ready',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ReadinessResponse' }
            }
          }
        },
        '503': {
          description: 'Service is not ready',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ReadinessResponse' }
            }
          }
        }
      }
    }
  }
};

// Knowledge Base endpoints
const kbEndpoints: Record<string, OpenAPIV3_1.PathItemObject> = {
  '/kb/search': {
    post: {
      tags: ['Knowledge Base'],
      summary: 'Search knowledge base',
      description: 'Perform vector search with language hints and filtering',
      operationId: 'searchKnowledgeBase',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/KBSearchRequest' }
          }
        }
      },
      responses: {
        '200': {
          description: 'Search results',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/KBSearchResponse' }
            }
          },
          headers: {
            'RateLimit-Limit': { $ref: '#/components/parameters/RateLimitLimit' },
            'RateLimit-Remaining': { $ref: '#/components/parameters/RateLimitRemaining' }
          }
        },
        '400': { $ref: '#/components/responses/BadRequest' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '429': { $ref: '#/components/responses/TooManyRequests' },
        '500': { $ref: '#/components/responses/InternalServerError' }
      }
    }
  },
  '/kb/reindex': {
    post: {
      tags: ['Knowledge Base'],
      summary: 'Trigger reindexing',
      description: 'Schedule knowledge base crawl and reindexing job',
      operationId: 'reindexKnowledgeBase',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/KBReindexRequest' }
          }
        }
      },
      responses: {
        '200': {
          description: 'Reindex job scheduled',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/KBReindexResponse' }
            }
          }
        },
        '400': { $ref: '#/components/responses/BadRequest' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '429': { $ref: '#/components/responses/TooManyRequests' }
      }
    }
  },
  '/kb/status': {
    get: {
      tags: ['Knowledge Base'],
      summary: 'Get KB status',
      description: 'Get knowledge base status and metrics',
      operationId: 'getKnowledgeBaseStatus',
      responses: {
        '200': {
          description: 'Knowledge base status',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/KBStatusResponse' }
            }
          }
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '500': { $ref: '#/components/responses/InternalServerError' }
      }
    }
  },
  '/kb/health': {
    get: {
      tags: ['Knowledge Base', 'Health'],
      summary: 'KB health check',
      description: 'Lightweight health check for knowledge base service',
      operationId: 'getKBHealth',
      security: [],
      responses: {
        '200': {
          description: 'KB service is healthy',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ServiceHealth' }
            }
          }
        }
      }
    }
  }
};

// Voice endpoints
const voiceEndpoints: Record<string, OpenAPIV3_1.PathItemObject> = {
  '/voice/session': {
    post: {
      tags: ['Voice'],
      summary: 'Create voice session',
      description: 'Create a short-lived voice session with JWT/opaque ID',
      operationId: 'createVoiceSession',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/VoiceSessionRequest' }
          }
        }
      },
      responses: {
        '200': {
          description: 'Voice session created',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VoiceSessionResponse' }
            }
          }
        },
        '400': { $ref: '#/components/responses/BadRequest' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '429': { $ref: '#/components/responses/TooManyRequests' }
      }
    }
  },
  '/voice/stream': {
    get: {
      tags: ['Voice'],
      summary: 'SSE voice stream',
      description: 'Server-Sent Events streaming for voice interactions',
      operationId: 'getVoiceStream',
      parameters: [
        {
          name: 'sessionId',
          in: 'query',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Voice session ID'
        },
        {
          name: 'format',
          in: 'query',
          required: true,
          schema: { type: 'string', enum: ['sse'] },
          description: 'Stream format'
        }
      ],
      responses: {
        '200': {
          description: 'SSE stream established',
          content: {
            'text/event-stream': {
              schema: {
                type: 'string',
                description: 'Server-Sent Events stream'
              }
            }
          }
        },
        '400': { $ref: '#/components/responses/BadRequest' },
        '404': { $ref: '#/components/responses/NotFound' }
      }
    },
    post: {
      tags: ['Voice'],
      summary: 'Process voice input',
      description: 'Process text or audio input for existing session',
      operationId: 'processVoiceInput',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/VoiceInputRequest' }
          }
        }
      },
      responses: {
        '200': {
          description: 'Input processed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VoiceInputResponse' }
            }
          }
        },
        '400': { $ref: '#/components/responses/BadRequest' },
        '404': { $ref: '#/components/responses/NotFound' }
      }
    }
  },
  '/voice/session/{sessionId}': {
    get: {
      tags: ['Voice'],
      summary: 'Get voice session',
      description: 'Get information about a specific voice session',
      operationId: 'getVoiceSession',
      parameters: [
        {
          name: 'sessionId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Voice session ID'
        }
      ],
      responses: {
        '200': {
          description: 'Voice session information',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VoiceSessionInfo' }
            }
          }
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': { $ref: '#/components/responses/NotFound' }
      }
    },
    delete: {
      tags: ['Voice'],
      summary: 'End voice session',
      description: 'Terminate a voice session',
      operationId: 'endVoiceSession',
      parameters: [
        {
          name: 'sessionId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Voice session ID'
        }
      ],
      responses: {
        '200': {
          description: 'Session ended',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VoiceSessionEndResponse' }
            }
          }
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': { $ref: '#/components/responses/NotFound' }
      }
    }
  },
  '/voice/health': {
    get: {
      tags: ['Voice', 'Health'],
      summary: 'Voice health check',
      description: 'Enhanced health check with voice services status',
      operationId: 'getVoiceHealth',
      security: [],
      responses: {
        '200': {
          description: 'Voice service is healthy',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VoiceHealthResponse' }
            }
          }
        },
        '503': {
          description: 'Voice service is unhealthy',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VoiceHealthResponse' }
            }
          }
        }
      }
    }
  }
};

// Placeholder for other endpoints (these would be imported from existing modules)
const authEndpoints: Record<string, OpenAPIV3_1.PathItemObject> = {};
const aiEndpoints: Record<string, OpenAPIV3_1.PathItemObject> = {};
const sitesEndpoints: Record<string, OpenAPIV3_1.PathItemObject> = {};

// Common schemas
const commonSchemas: Record<string, OpenAPIV3_1.SchemaObject> = {
  ErrorResponse: {
    type: 'object',
    required: ['success', 'error'],
    properties: {
      success: { type: 'boolean', const: false },
      error: { 
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' }
        }
      },
      correlationId: { type: 'string', format: 'uuid' }
    }
  },
  Metadata: {
    type: 'object',
    properties: {
      timestamp: { type: 'string', format: 'date-time' },
      correlationId: { type: 'string', format: 'uuid' },
      processingTime: { type: 'number', minimum: 0 },
      tenantId: { type: 'string', format: 'uuid' }
    }
  }
};

// Problem Details schemas (RFC 9457)
const problemDetailSchemas: Record<string, OpenAPIV3_1.SchemaObject> = {
  ProblemDetail: {
    type: 'object',
    required: ['type', 'title', 'status'],
    properties: {
      type: {
        type: 'string',
        format: 'uri',
        description: 'URI identifying the problem type',
        example: 'https://sitespeak.ai/problems/validation-error'
      },
      title: {
        type: 'string',
        description: 'Human-readable summary of the problem',
        example: 'Validation Error'
      },
      status: {
        type: 'integer',
        minimum: 100,
        maximum: 599,
        description: 'HTTP status code',
        example: 422
      },
      detail: {
        type: 'string',
        description: 'Human-readable explanation specific to this occurrence',
        example: 'The query parameter is required and must be between 1-1000 characters'
      },
      instance: {
        type: 'string',
        format: 'uri',
        description: 'URI identifying the specific occurrence',
        example: '/api/v1/kb/search'
      },
      extensions: {
        type: 'object',
        description: 'Additional context and debugging information',
        properties: {
          correlationId: { type: 'string', format: 'uuid' },
          tenantId: { type: 'string', format: 'uuid' },
          validationErrors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                message: { type: 'string' },
                code: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
};

// Knowledge Base schemas
const kbSchemas: Record<string, OpenAPIV3_1.SchemaObject> = {
  KBSearchRequest: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { 
        type: 'string', 
        minLength: 1, 
        maxLength: 1000,
        description: 'Search query text'
      },
      topK: { 
        type: 'integer', 
        minimum: 1, 
        maximum: 50, 
        default: 10,
        description: 'Maximum number of results to return'
      },
      filters: { 
        type: 'object',
        description: 'Additional search filters'
      },
      langHint: { 
        type: 'string', 
        pattern: '^[a-z]{2}(-[A-Z]{2})?$',
        description: 'Language hint for search (e.g., en-US)'
      },
      threshold: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1, 
        default: 0.7,
        description: 'Similarity threshold for results'
      }
    }
  },
  KBSearchResponse: {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', const: true },
      data: {
        type: 'object',
        required: ['matches', 'usedLanguage'],
        properties: {
          matches: {
            type: 'array',
            items: { $ref: '#/components/schemas/KBSearchMatch' }
          },
          usedLanguage: { type: 'string' },
          totalMatches: { type: 'integer' },
          processingTime: { type: 'number' }
        }
      },
      metadata: { $ref: '#/components/schemas/Metadata' }
    }
  },
  KBSearchMatch: {
    type: 'object',
    required: ['id', 'url', 'snippet', 'score'],
    properties: {
      id: { type: 'string' },
      url: { type: 'string', format: 'uri' },
      snippet: { type: 'string' },
      score: { type: 'number', minimum: 0, maximum: 1 },
      meta: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          lastModified: { type: 'string', format: 'date-time' },
          language: { type: 'string' }
        }
      }
    }
  },
  KBReindexRequest: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['delta', 'full'], default: 'delta' },
      siteId: { type: 'string', format: 'uuid' },
      priority: { type: 'string', enum: ['low', 'normal', 'high'], default: 'normal' }
    }
  },
  KBReindexResponse: {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', const: true },
      data: {
        type: 'object',
        required: ['jobId', 'status'],
        properties: {
          jobId: { type: 'string' },
          status: { type: 'string' },
          estimatedStartTime: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  KBStatusResponse: {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', const: true },
      data: {
        type: 'object',
        properties: {
          chunkCount: { type: 'integer' },
          documentCount: { type: 'integer' },
          indexType: { type: 'string' },
          lastCrawlTime: { type: 'string', format: 'date-time' },
          isProcessing: { type: 'boolean' }
        }
      }
    }
  }
};

// Voice schemas  
const voiceSchemas: Record<string, OpenAPIV3_1.SchemaObject> = {
  VoiceSessionRequest: {
    type: 'object',
    properties: {
      siteId: { type: 'string', format: 'uuid' },
      voice: { type: 'string', enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'], default: 'alloy' },
      maxDuration: { type: 'integer', minimum: 60, maximum: 1800, default: 300 },
      preferredTTSLocale: { type: 'string', pattern: '^[a-z]{2}(-[A-Z]{2})?$' },
      preferredSTTLocale: { type: 'string', pattern: '^[a-z]{2}(-[A-Z]{2})?$' }
    }
  },
  VoiceSessionResponse: {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', const: true },
      data: {
        type: 'object',
        required: ['sessionId', 'ttsLocale', 'sttLocale', 'expiresIn'],
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
          ttsLocale: { type: 'string' },
          sttLocale: { type: 'string' },
          expiresIn: { type: 'integer' },
          expiresAt: { type: 'string', format: 'date-time' },
          endpoints: {
            type: 'object',
            properties: {
              websocket: { type: 'string', format: 'uri' },
              sse: { type: 'string', format: 'uri' }
            }
          }
        }
      }
    }
  },
  VoiceInputRequest: {
    type: 'object',
    required: ['sessionId'],
    properties: {
      sessionId: { type: 'string', format: 'uuid' },
      input: { type: 'string' },
      audioData: { type: 'string', description: 'Base64 encoded audio' },
      inputType: { type: 'string', enum: ['text', 'audio'] }
    }
  },
  VoiceInputResponse: {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', const: true },
      data: {
        type: 'object',
        required: ['sessionId', 'processingId', 'status'],
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
          processingId: { type: 'string' },
          status: { type: 'string' }
        }
      }
    }
  },
  VoiceSessionInfo: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      status: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
      expiresAt: { type: 'string', format: 'date-time' }
    }
  },
  VoiceSessionEndResponse: {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', const: true },
      data: {
        type: 'object',
        required: ['sessionId', 'status'],
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
          status: { type: 'string', const: 'ended' },
          endedAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  VoiceHealthResponse: {
    type: 'object',
    required: ['status', 'timestamp', 'version'],
    properties: {
      status: {
        type: 'object',
        properties: {
          isRunning: { type: 'boolean' },
          activeSessions: { type: 'integer' },
          performance: {
            type: 'object',
            properties: {
              avgFirstTokenLatency: { type: 'number' },
              avgPartialLatency: { type: 'number' },
              avgBargeInLatency: { type: 'number' },
              errorRate: { type: 'number' }
            }
          }
        }
      },
      timestamp: { type: 'string', format: 'date-time' },
      version: { type: 'string' },
      components: {
        type: 'object',
        properties: {
          orchestrator: { type: 'string' },
          transport: { type: 'string' },
          realtime: { type: 'string' },
          audioProcessing: { type: 'string' }
        }
      }
    }
  }
};

// Health schemas
const healthSchemas: Record<string, OpenAPIV3_1.SchemaObject> = {
  HealthResponse: {
    type: 'object',
    required: ['status', 'timestamp', 'service'],
    properties: {
      status: { type: 'string', enum: ['healthy', 'unhealthy', 'error'] },
      timestamp: { type: 'string', format: 'date-time' },
      version: { type: 'string' },
      service: { type: 'string' },
      checks: { type: 'object' },
      issues: { type: 'array', items: { type: 'string' } }
    }
  },
  LivenessResponse: {
    type: 'object',
    required: ['status', 'timestamp', 'uptime'],
    properties: {
      status: { type: 'string', const: 'alive' },
      timestamp: { type: 'string', format: 'date-time' },
      uptime: { type: 'number' },
      memory: { type: 'object' },
      service: { type: 'string' }
    }
  },
  ReadinessResponse: {
    type: 'object',
    required: ['status', 'timestamp', 'service'],
    properties: {
      status: { type: 'string', enum: ['ready', 'not-ready', 'error'] },
      timestamp: { type: 'string', format: 'date-time' },
      service: { type: 'string' },
      checks: { type: 'object' }
    }
  },
  ServiceHealth: {
    type: 'object',
    required: ['status', 'service', 'timestamp'],
    properties: {
      status: { type: 'string', enum: ['healthy', 'unhealthy'] },
      service: { type: 'string' },
      timestamp: { type: 'string', format: 'date-time' },
      version: { type: 'string' }
    }
  }
};

// Placeholder schemas for other services
const authSchemas: Record<string, OpenAPIV3_1.SchemaObject> = {};
const aiSchemas: Record<string, OpenAPIV3_1.SchemaObject> = {};
const sitesSchemas: Record<string, OpenAPIV3_1.SchemaObject> = {};

// Combine all schemas
Object.assign(commonSchemas, healthSchemas);

// Common responses
const commonResponses: Record<string, OpenAPIV3_1.ResponseObject> = {
  BadRequest: {
    description: 'Bad Request - Invalid request parameters',
    content: {
      'application/problem+json': {
        schema: { $ref: '#/components/schemas/ProblemDetail' }
      }
    }
  },
  Unauthorized: {
    description: 'Unauthorized - Authentication required',
    content: {
      'application/problem+json': {
        schema: { $ref: '#/components/schemas/ProblemDetail' }
      }
    },
    headers: {
      'WWW-Authenticate': {
        schema: { type: 'string' },
        description: 'Authentication method required'
      }
    }
  },
  Forbidden: {
    description: 'Forbidden - Insufficient permissions',
    content: {
      'application/problem+json': {
        schema: { $ref: '#/components/schemas/ProblemDetail' }
      }
    }
  },
  NotFound: {
    description: 'Not Found - Resource does not exist',
    content: {
      'application/problem+json': {
        schema: { $ref: '#/components/schemas/ProblemDetail' }
      }
    }
  },
  TooManyRequests: {
    description: 'Too Many Requests - Rate limit exceeded',
    content: {
      'application/problem+json': {
        schema: { $ref: '#/components/schemas/ProblemDetail' }
      }
    },
    headers: {
      'Retry-After': {
        schema: { type: 'integer' },
        description: 'Seconds to wait before retrying'
      },
      'RateLimit-Limit': {
        schema: { type: 'integer' },
        description: 'Request limit per time window'
      },
      'RateLimit-Remaining': {
        schema: { type: 'integer' },
        description: 'Remaining requests in current window'
      },
      'RateLimit-Reset': {
        schema: { type: 'integer' },
        description: 'Seconds until rate limit resets'
      }
    }
  },
  InternalServerError: {
    description: 'Internal Server Error - Unexpected server error',
    content: {
      'application/problem+json': {
        schema: { $ref: '#/components/schemas/ProblemDetail' }
      }
    }
  }
};

// Common parameters
const commonParameters: Record<string, OpenAPIV3_1.ParameterObject> = {
  RateLimitLimit: {
    name: 'RateLimit-Limit',
    in: 'header',
    schema: { type: 'integer' },
    description: 'Request limit per time window'
  },
  RateLimitRemaining: {
    name: 'RateLimit-Remaining', 
    in: 'header',
    schema: { type: 'integer' },
    description: 'Remaining requests in current window'
  },
  RateLimitReset: {
    name: 'RateLimit-Reset',
    in: 'header',
    schema: { type: 'integer' },
    description: 'Seconds until rate limit resets'
  },
  CorrelationId: {
    name: 'X-Correlation-ID',
    in: 'header',
    schema: { type: 'string', format: 'uuid' },
    description: 'Request correlation ID for tracing'
  }
};

/**
 * Create OpenAPI specification route handler
 */
export function createOpenAPIHandler(options: Parameters<typeof generateOpenAPISpec>[0] = {}) {
  return (req: any, res: any) => {
    try {
      const spec = generateOpenAPISpec(options);
      res.json(spec);
    } catch (error) {
      logger.error('Failed to generate OpenAPI spec', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({
        type: 'https://sitespeak.ai/problems/internal-server-error',
        title: 'OpenAPI Generation Failed',
        status: 500,
        detail: 'An error occurred while generating the OpenAPI specification'
      });
    }
  };
}