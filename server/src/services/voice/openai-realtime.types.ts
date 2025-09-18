/**
 * OpenAI Realtime API Type Definitions
 *
 * Comprehensive types for OpenAI Realtime API responses and events
 * to eliminate 'any' types in voice processing pipeline.
 *
 * Based on OpenAI Realtime API documentation and observed response patterns.
 */

/**
 * Base OpenAI Realtime API session configuration
 */
export interface RealtimeSession {
  id: string;
  model: string;
  modalities: string[];
  instructions: string;
  voice: string;
  input_audio_format: string;
  output_audio_format: string;
  input_audio_transcription?: {
    enabled: boolean;
    model: string;
  };
  turn_detection?: {
    type: string;
    threshold: number;
    prefix_padding_ms: number;
    silence_duration_ms: number;
  };
  tools?: Array<{
    type: string;
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  }>;
  tool_choice?: string;
  temperature?: number;
  max_response_output_tokens?: number;
}

/**
 * Conversation item types
 */
export interface ConversationItem {
  id: string;
  type: 'message' | 'function_call' | 'function_call_output';
  status?: 'completed' | 'in_progress' | 'incomplete';
  role?: 'user' | 'assistant' | 'system';
  content?: Array<{
    type: 'input_text' | 'input_audio' | 'text' | 'audio';
    text?: string;
    audio?: string; // base64 encoded
    transcript?: string;
  }>;
  call_id?: string;
  name?: string;
  arguments?: string;
  output?: string;
}

/**
 * Response types
 */
export interface RealtimeResponse {
  id: string;
  object: 'realtime.response';
  status: 'in_progress' | 'completed' | 'cancelled' | 'failed' | 'incomplete';
  status_details?: {
    type?: string;
    reason?: string;
  };
  output?: Array<{
    id: string;
    type: 'message' | 'function_call';
    role?: 'assistant';
    content?: Array<{
      type: 'text' | 'audio';
      text?: string;
      audio?: string;
      transcript?: string;
    }>;
    call_id?: string;
    name?: string;
    arguments?: string;
  }>;
  usage?: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Content part types
 */
export interface ContentPart {
  type: 'text' | 'audio' | 'input_text' | 'input_audio';
  text?: string;
  audio?: string; // base64 encoded
  transcript?: string;
}

/**
 * Error types
 */
export interface RealtimeError {
  type: string;
  code: string;
  message: string;
  param?: string;
  event_id?: string;
}

/**
 * Server-side event types for OpenAI Realtime API
 */
export type ServerEvent =
  // Session events
  | { type: 'session.created'; session: RealtimeSession }
  | { type: 'session.updated'; session: RealtimeSession }
  | { type: 'error'; error: RealtimeError }

  // Input audio buffer events
  | { type: 'input_audio_buffer.committed'; previous_item_id?: string; item_id: string }
  | { type: 'input_audio_buffer.cleared' }
  | { type: 'input_audio_buffer.speech_started'; audio_start_ms: number; item_id: string }
  | { type: 'input_audio_buffer.speech_stopped'; audio_end_ms: number; item_id: string }

  // Conversation events
  | { type: 'conversation.item.created'; item: ConversationItem }
  | { type: 'conversation.item.truncated'; item_id: string; content_index: number; audio_end_ms: number }
  | { type: 'conversation.item.deleted'; item_id: string }

  // Response events
  | { type: 'response.created'; response: RealtimeResponse }
  | { type: 'response.done'; response: RealtimeResponse }
  | { type: 'response.output_item.added'; item: ConversationItem; output_index: number }
  | { type: 'response.output_item.done'; item: ConversationItem; output_index: number }
  | { type: 'response.content_part.added'; part: ContentPart; item_id: string; output_index: number; content_index: number }
  | { type: 'response.content_part.done'; part: ContentPart; item_id: string; output_index: number; content_index: number }

  // Audio events
  | { type: 'response.audio.delta'; response_id: string; item_id: string; output_index: number; content_index: number; delta: string }
  | { type: 'response.audio.done'; response_id: string; item_id: string; output_index: number; content_index: number }

  // Text events
  | { type: 'response.text.delta'; response_id: string; item_id: string; output_index: number; content_index: number; delta: string }
  | { type: 'response.text.done'; response_id: string; item_id: string; output_index: number; content_index: number; text: string }

  // Function calling events
  | { type: 'response.function_call_arguments.delta'; response_id: string; item_id: string; output_index: number; call_id: string; delta: string }
  | { type: 'response.function_call_arguments.done'; response_id: string; item_id: string; output_index: number; call_id: string; arguments: string }

  // Rate limit events
  | { type: 'rate_limits.updated'; rate_limits: Array<{ name: string; limit: number; remaining: number; reset_seconds: number }> }

  // Transcription events
  | { type: 'conversation.item.input_audio_transcription.completed'; item_id: string; content_index: number; transcript: string }
  | { type: 'conversation.item.input_audio_transcription.delta'; item_id: string; content_index: number; delta: string }
  | { type: 'conversation.item.input_audio_transcription.failed'; item_id: string; content_index: number; error: RealtimeError };

/**
 * Client-side event types for OpenAI Realtime API
 */
export type ClientEvent =
  // Session events
  | { type: 'session.update'; session: Partial<RealtimeSession> }

  // Input audio events
  | { type: 'input_audio_buffer.append'; audio: string }
  | { type: 'input_audio_buffer.commit' }
  | { type: 'input_audio_buffer.clear' }

  // Conversation events
  | { type: 'conversation.item.create'; item: Partial<ConversationItem> }
  | { type: 'conversation.item.truncate'; item_id: string; content_index: number; audio_end_ms: number }
  | { type: 'conversation.item.delete'; item_id: string }

  // Response events
  | { type: 'response.create'; response?: Partial<RealtimeResponse> }
  | { type: 'response.cancel' };

/**
 * Type guards for runtime validation
 */
export function isServerEvent(event: unknown): event is ServerEvent {
  return typeof event === 'object' && event !== null && 'type' in event;
}

export function isErrorEvent(event: ServerEvent): event is Extract<ServerEvent, { type: 'error' }> {
  return event.type === 'error';
}

export function isSessionEvent(event: ServerEvent): event is Extract<ServerEvent, { type: `session.${string}` }> {
  return event.type.startsWith('session.');
}

export function isAudioEvent(event: ServerEvent): event is Extract<ServerEvent, { type: `response.audio.${string}` }> {
  return event.type.startsWith('response.audio.');
}

export function isTextEvent(event: ServerEvent): event is Extract<ServerEvent, { type: `response.text.${string}` }> {
  return event.type.startsWith('response.text.');
}

export function isTranscriptionEvent(event: ServerEvent): event is Extract<ServerEvent, { type: `conversation.item.input_audio_transcription.${string}` }> {
  return event.type.startsWith('conversation.item.input_audio_transcription.');
}

export function isSpeechEvent(event: ServerEvent): event is Extract<ServerEvent, { type: `input_audio_buffer.speech_${string}` }> {
  return event.type.startsWith('input_audio_buffer.speech_');
}

/**
 * Utility type for message handling
 */
export type RealtimeMessage = ServerEvent | ClientEvent;

/**
 * Tool definition interface
 */
export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}