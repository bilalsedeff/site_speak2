/**
 * OpenAI Realtime API Type Definitions
 *
 * Comprehensive type definitions for OpenAI Realtime API to eliminate 'any' types
 * in voice processing pipeline. Based on OpenAI Realtime API Beta documentation.
 */

// Core JSON Schema type for function parameters
export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  description?: string;
  enum?: unknown[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

// Tool definition for function calling
export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: JSONSchema;
}

// Session configuration
export interface SessionConfig {
  id: string;
  object: 'realtime.session';
  model: string;
  expires_at: number;
  modalities: Array<'text' | 'audio'>;
  instructions: string;
  voice: 'alloy' | 'shimmer' | 'nova' | 'echo' | 'fable' | 'onyx';
  input_audio_format: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  output_audio_format: 'pcm16' | 'g711_ulaw' | 'g711_alaw';
  input_audio_transcription?: {
    model: 'whisper-1';
  };
  turn_detection?: {
    type: 'server_vad';
    threshold: number;
    prefix_padding_ms: number;
    silence_duration_ms: number;
  };
  tools?: RealtimeTool[];
  tool_choice: 'auto' | 'none' | 'required' | { type: 'function'; name: string };
  temperature: number;
  max_response_output_tokens?: number;
}

// Content part types
export interface AudioContentPart {
  type: 'audio';
  audio: string; // base64 encoded audio
}

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface FunctionCallContentPart {
  type: 'function_call';
  function_call: {
    call_id: string;
    name: string;
    arguments: string;
  };
}

export interface FunctionCallResultContentPart {
  type: 'function_call_result';
  function_call_result: {
    call_id: string;
    result: string;
  };
}

export type ContentPart =
  | AudioContentPart
  | TextContentPart
  | FunctionCallContentPart
  | FunctionCallResultContentPart;

// Conversation item types
export interface ConversationItem {
  id: string;
  object: 'realtime.item';
  type: 'message' | 'function_call' | 'function_call_result';
  status: 'completed' | 'in_progress' | 'incomplete';
  role: 'user' | 'assistant' | 'system';
  content: ContentPart[];
}

// Response types
export interface Response {
  id: string;
  object: 'realtime.response';
  status: 'in_progress' | 'completed' | 'cancelled' | 'failed' | 'incomplete';
  status_details?: {
    type: 'cancelled' | 'incomplete' | 'failed';
    reason?: string;
    error?: {
      type: string;
      code: string;
      message: string;
      param?: string;
    };
  };
  output: ConversationItem[];
  usage?: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    input_token_details: {
      cached_tokens: number;
      text_tokens: number;
      audio_tokens: number;
    };
    output_token_details: {
      text_tokens: number;
      audio_tokens: number;
    };
  };
}

// Error types
export interface RealtimeError {
  type: 'error';
  error: {
    type: 'invalid_request_error' | 'authentication_error' | 'permission_error' | 'not_found_error' | 'unprocessable_entity_error' | 'rate_limit_error' | 'internal_error';
    code: string;
    message: string;
    param?: string;
    event_id?: string;
  };
}

// Enhanced Realtime API event types with proper typing
export type RealtimeEvent =
  // Session events
  | { type: 'session.created'; session: SessionConfig }
  | { type: 'session.updated'; session: Partial<SessionConfig> }
  | RealtimeError

  // Input audio events
  | { type: 'input_audio_buffer.append'; audio: string }
  | { type: 'input_audio_buffer.clear' }
  | { type: 'input_audio_buffer.committed'; item_id: string }

  // Conversation events
  | { type: 'conversation.item.created'; item: ConversationItem }
  | { type: 'conversation.item.truncated'; item_id: string; content_index: number; audio_end_ms: number }

  // Response events
  | { type: 'response.created'; response: Response }
  | { type: 'response.done'; response: Response }
  | { type: 'response.output_item.added'; item: ConversationItem }
  | { type: 'response.output_item.done'; item: ConversationItem }
  | { type: 'response.content_part.added'; part: ContentPart }
  | { type: 'response.content_part.done'; part: ContentPart }

  // Audio events
  | { type: 'response.audio.delta'; delta: string; item_id: string; output_index: number; content_index: number }
  | { type: 'response.audio.done'; item_id: string; output_index: number; content_index: number }
  | { type: 'response.audio_transcript.delta'; delta: string; item_id: string; output_index: number; content_index: number }
  | { type: 'response.audio_transcript.done'; transcript: string; item_id: string; output_index: number; content_index: number }

  // Text events
  | { type: 'response.text.delta'; delta: string; item_id: string; output_index: number; content_index: number }
  | { type: 'response.text.done'; text: string; item_id: string; output_index: number; content_index: number }

  // Function calling events
  | { type: 'response.function_call_arguments.delta'; call_id: string; delta: string; item_id: string; output_index: number; content_index: number }
  | { type: 'response.function_call_arguments.done'; call_id: string; name: string; arguments: string; item_id: string; output_index: number; content_index: number }

  // Input speech events
  | { type: 'input_audio_buffer.speech_started'; audio_start_ms: number; item_id: string }
  | { type: 'input_audio_buffer.speech_stopped'; audio_end_ms: number; item_id: string }
  | { type: 'conversation.item.input_audio_transcription.completed'; item_id: string; content_index: number; transcript: string }
  | { type: 'conversation.item.input_audio_transcription.failed'; item_id: string; content_index: number; error: RealtimeError['error'] }

  // Rate limit events
  | { type: 'rate_limits.updated'; rate_limits: Array<{ name: string; limit: number; remaining: number; reset_seconds: number }> };

// Client-to-server message types
export type ClientMessage =
  // Session update
  | { type: 'session.update'; session: Partial<SessionConfig> }

  // Input audio
  | { type: 'input_audio_buffer.append'; audio: string }
  | { type: 'input_audio_buffer.clear' }
  | { type: 'input_audio_buffer.commit' }

  // Conversation management
  | { type: 'conversation.item.create'; item: Partial<ConversationItem> }
  | { type: 'conversation.item.truncate'; item_id: string; content_index: number; audio_end_ms: number }
  | { type: 'conversation.item.delete'; item_id: string }

  // Response generation
  | { type: 'response.create'; response?: Partial<Response> }
  | { type: 'response.cancel' };

// Event handler types
export interface RealtimeEventHandlers {
  // Session events
  'session.created': (event: Extract<RealtimeEvent, { type: 'session.created' }>) => void;
  'session.updated': (event: Extract<RealtimeEvent, { type: 'session.updated' }>) => void;
  'error': (event: RealtimeError) => void;

  // Input audio events
  'input_audio_buffer.append': (event: Extract<RealtimeEvent, { type: 'input_audio_buffer.append' }>) => void;
  'input_audio_buffer.clear': (event: Extract<RealtimeEvent, { type: 'input_audio_buffer.clear' }>) => void;
  'input_audio_buffer.committed': (event: Extract<RealtimeEvent, { type: 'input_audio_buffer.committed' }>) => void;

  // Conversation events
  'conversation.item.created': (event: Extract<RealtimeEvent, { type: 'conversation.item.created' }>) => void;
  'conversation.item.truncated': (event: Extract<RealtimeEvent, { type: 'conversation.item.truncated' }>) => void;

  // Response events
  'response.created': (event: Extract<RealtimeEvent, { type: 'response.created' }>) => void;
  'response.done': (event: Extract<RealtimeEvent, { type: 'response.done' }>) => void;
  'response.output_item.added': (event: Extract<RealtimeEvent, { type: 'response.output_item.added' }>) => void;
  'response.output_item.done': (event: Extract<RealtimeEvent, { type: 'response.output_item.done' }>) => void;
  'response.content_part.added': (event: Extract<RealtimeEvent, { type: 'response.content_part.added' }>) => void;
  'response.content_part.done': (event: Extract<RealtimeEvent, { type: 'response.content_part.done' }>) => void;

  // Audio events
  'response.audio.delta': (event: Extract<RealtimeEvent, { type: 'response.audio.delta' }>) => void;
  'response.audio.done': (event: Extract<RealtimeEvent, { type: 'response.audio.done' }>) => void;
  'response.audio_transcript.delta': (event: Extract<RealtimeEvent, { type: 'response.audio_transcript.delta' }>) => void;
  'response.audio_transcript.done': (event: Extract<RealtimeEvent, { type: 'response.audio_transcript.done' }>) => void;

  // Text events
  'response.text.delta': (event: Extract<RealtimeEvent, { type: 'response.text.delta' }>) => void;
  'response.text.done': (event: Extract<RealtimeEvent, { type: 'response.text.done' }>) => void;

  // Function calling events
  'response.function_call_arguments.delta': (event: Extract<RealtimeEvent, { type: 'response.function_call_arguments.delta' }>) => void;
  'response.function_call_arguments.done': (event: Extract<RealtimeEvent, { type: 'response.function_call_arguments.done' }>) => void;

  // Input speech events
  'input_audio_buffer.speech_started': (event: Extract<RealtimeEvent, { type: 'input_audio_buffer.speech_started' }>) => void;
  'input_audio_buffer.speech_stopped': (event: Extract<RealtimeEvent, { type: 'input_audio_buffer.speech_stopped' }>) => void;
  'conversation.item.input_audio_transcription.completed': (event: Extract<RealtimeEvent, { type: 'conversation.item.input_audio_transcription.completed' }>) => void;
  'conversation.item.input_audio_transcription.failed': (event: Extract<RealtimeEvent, { type: 'conversation.item.input_audio_transcription.failed' }>) => void;

  // Rate limit events
  'rate_limits.updated': (event: Extract<RealtimeEvent, { type: 'rate_limits.updated' }>) => void;

  // Custom simplified events for backwards compatibility
  'speech_started': (event: { audioStartMs: number; itemId: string }) => void;
  'speech_stopped': (event: { audioEndMs: number; itemId: string }) => void;
  'transcription': (event: { transcript: string; latency: number }) => void;
  'conversation.updated': (event: { item: ConversationItem; delta?: Partial<ContentPart> }) => void;
  'conversation.interrupted': () => void;
  'session_ready': (sessionData: { id: string }) => void;
  'function_call_complete': (event: { callId: string; arguments: string }) => void;
}

// Connection status types
export interface ConnectionStatus {
  isConnected: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  lastError?: RealtimeError['error'];
  connectionLatency?: number;
  reconnectAttempts?: number;
}

// Performance metrics with proper typing
export interface RealtimeMetrics {
  connectionLatency: number;
  firstTokenLatency: number[];
  audioStreamingLatency: number[];
  transcriptionLatency: number[];
  totalMessages: number;
  audioBytesSent: number;
  audioBytesReceived: number;
  errors: number;
  reconnections: number;
  averageLatency: number;
  peakLatency: number;
  successRate: number;
}