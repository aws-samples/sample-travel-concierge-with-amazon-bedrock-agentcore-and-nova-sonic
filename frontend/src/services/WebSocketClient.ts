/**
 * WebSocket Client for AgentCore Runtime
 *
 * Handles bidirectional audio and text streaming with SigV4 authentication.
 */

import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import type { AWSCredentials } from './SettingsManager';

export interface WebSocketClientOptions {
  websocketUrl: string;
  runtimeArn: string;
  credentials: AWSCredentials;
  region: string;
  accessToken?: string;
  userLocation?: { latitude: number; longitude: number };
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private options: WebSocketClientOptions;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000;
  private isSessionTimeout = false;
  private conversationContext = '';

  // Pending tool invocations — keyed by toolUseId
  private pendingTools = new Map<string, { name: string; input: Record<string, unknown> }>();

  // Processed tool IDs — prevents duplicate callbacks when both typed + Shape B arrive
  private processedToolIds = new Set<string>();

  // Assistant text already delivered for the current turn — prevents bidi_text_output
  // from re-delivering a duplicate of what bidi_transcript_stream already streamed
  // (most visible when the user stays silent after the response finishes).
  private assistantTextBuffer = '';

  // Callbacks
  private onTranscriptionCb?: (text: string, role: 'user' | 'assistant') => void;
  private onResponseCb?: (text: string) => void;
  private onAudioCb?: (data: ArrayBuffer) => void;
  private onErrorCb?: (err: Error) => void;
  private onConnectedCb?: () => void;
  private onDisconnectedCb?: () => void;
  private onInterruptionCb?: () => void;
  private onTurnCompleteCb?: () => void;
  private onToolStartCb?: (toolName: string) => void;
  private onToolEndCb?: () => void;
  private onToolResultCb?: (toolName: string, data: Record<string, unknown>, flightNumber?: string) => void;

  constructor(options: WebSocketClientOptions) {
    this.options = options;
  }

  // ─── Connection ────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    const presignedUrl = await this.createPresignedUrl();

    this.ws = new WebSocket(presignedUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.options.accessToken) this.sendAuth(this.options.accessToken);
      this.onConnectedCb?.();
    };

    this.ws.onmessage = (event) => this.handleMessage(event);

    this.ws.onerror = () => {
      this.onErrorCb?.(new Error('WebSocket connection error'));
    };

    this.ws.onclose = (event) => {
      this.ws = null;
      if (event.code !== 1000 && this.reconnectAttempts === 0) {
        this.isSessionTimeout = true;
      }
      this.onDisconnectedCb?.();
      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
      }
    };
  }

  disconnect(): void {
    this.isSessionTimeout = false;
    this.pendingTools.clear();
    this.processedToolIds.clear();
    this.assistantTextBuffer = '';
    this.ws?.close(1000, 'Client disconnect');
    this.ws = null;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ─── Sending ───────────────────────────────────────────────────────────────

  sendAudio(audioData: ArrayBuffer): void {
    this.send({
      type: 'bidi_audio_input',
      audio: this.toBase64(audioData),
      format: 'pcm',
      sample_rate: 16000,
      channels: 1,
    });
  }

  sendText(text: string): void {
    this.send({ type: 'bidi_text_input', text });
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendAuth(accessToken: string): void {
    this.send({ type: 'auth', access_token: accessToken });

    setTimeout(() => {
      if (!this.isConnected()) return;
      if (this.isSessionTimeout && this.conversationContext) {
        this.send({
          type: 'bidi_text_input',
          text: `[SYSTEM: Voice session renewed. Customer still on line. Context for reference only — do NOT re-greet or repeat anything. Say "I'm still here" and wait.]\n\n${this.conversationContext}`,
        });
        this.isSessionTimeout = false;
      } else {
        this.send({ type: 'bidi_text_input', text: 'Hi' });
      }
    }, 100);
  }

  // ─── Message handling ──────────────────────────────────────────────────────

  private handleMessage(event: MessageEvent): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    // ── Typeless messages (no `type` field) ──────────────────────────────────
    if (!data.type) {
      const content = (data.message as Record<string, unknown> | undefined)
        ?.content as Array<Record<string, unknown>> | undefined;
      const first = content?.[0];

      if (first?.toolResult) {
        // Tool result: { message: { role: 'user', content: [{ toolResult: { toolUseId, content: [{text}] } }] } }
        this.handleToolResult(first.toolResult as Record<string, unknown>);
        return;
      }

      if (first?.toolUse) {
        // Tool invocation: { message: { role: 'assistant', content: [{ toolUse: { toolUseId, name, input } }] } }
        const toolUse = first.toolUse as Record<string, unknown>;
        const id = toolUse.toolUseId as string;
        const name = (toolUse.name as string) || 'unknown';
        const input = (toolUse.input as Record<string, unknown>) || {};
        if (id) this.pendingTools.set(id, { name, input });
        this.onToolStartCb?.(name);
        return;
      }

      return; // unknown typeless message
    }

    // ── Typed messages ────────────────────────────────────────────────────────
    switch (data.type as string) {

      case 'bidi_transcript_stream': {
        const role = data.role as string;
        const text = (data.transcript || data.text) as string;
        if (role === 'user') {
          // New turn starting — clear last turn's assistant text so the next
          // response's dedup check isn't comparing against stale content.
          this.assistantTextBuffer = '';
          this.onTranscriptionCb?.(text, 'user');
        } else if (!data.is_final) {
          // Skip is_final:true — it's a duplicate of the streaming transcript
          this.assistantTextBuffer += text;
          this.onResponseCb?.(text);
        }
        break;
      }

      case 'bidi_audio_stream':
        if (data.audio) {
          this.onAudioCb?.(this.fromBase64(data.audio as string));
        }
        break;

      case 'bidi_text_output': {
        // Sometimes re-delivers the fully-formed response as a standalone event
        // after it has already been streamed via bidi_transcript_stream deltas
        // (notably when the user stays silent after the turn ends). Skip it if
        // it's a duplicate of what's already been streamed for this turn.
        const text = data.text as string;
        if (text && this.assistantTextBuffer.includes(text)) {
          break;
        }
        this.assistantTextBuffer += text;
        this.onResponseCb?.(text);
        break;
      }

      case 'bidi_interruption':
        this.assistantTextBuffer = '';
        this.onInterruptionCb?.();
        this.onTurnCompleteCb?.();
        break;

      case 'tool_use_stream': {
        // Typed tool invocation — store in pendingTools
        const delta = data.delta as Record<string, unknown> | undefined;
        const current = data.current_tool_use as Record<string, unknown> | undefined;
        const tu = (delta?.toolUse || current) as Record<string, unknown> | undefined;
        const id = tu?.toolUseId as string | undefined;
        const name = (tu?.name as string) || 'unknown';
        const input = (tu?.input as Record<string, unknown>) || {};
        if (id) this.pendingTools.set(id, { name, input });
        this.onToolStartCb?.(name);
        break;
      }

      case 'tool_result': {
        // Typed tool result — same handler as Shape B
        const tr = data.tool_result as Record<string, unknown> | undefined;
        if (tr) this.handleToolResult(tr);
        break;
      }

      case 'location_request':
        this.handleLocationRequest(data.request_id as string);
        break;

      case 'bidi_connection_start':
      case 'bidi_usage':
      case 'bidi_response_start':
        break; // informational — ignore

      case 'error':
        this.onErrorCb?.(new Error(data.message as string));
        break;
    }
  }

  private handleToolResult(toolResult: Record<string, unknown>): void {
    this.onToolEndCb?.();
    if (!this.onToolResultCb) return;

    const id = toolResult.toolUseId as string | undefined;
    const contentText = (toolResult.content as Array<Record<string, unknown>> | undefined)?.[0]?.text as string | undefined;
    if (!contentText) return;

    // Deduplicate — both typed tool_result and Shape B arrive for the same toolUseId
    if (id) {
      if (this.processedToolIds.has(id)) return;
      this.processedToolIds.add(id);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(contentText);
    } catch {
      return;
    }

    const pending = id ? this.pendingTools.get(id) : undefined;
    if (id) this.pendingTools.delete(id);

    const toolName = pending?.name || this.inferToolName(parsed);
    const flightNumber = pending?.input?.flightNumber as string | undefined;

    this.onToolResultCb(toolName, parsed, flightNumber);
  }

  private inferToolName(data: Record<string, unknown>): string {
    if (data.seats)                                                         return 'GetSeatMap';
    if (data.bookings)                                                      return 'GetUpcomingItinerary';
    if (data.passengers)                                                    return 'GetPassengerDetails';
    if (data.loyaltyTier !== undefined)                                     return 'GetLoyaltyStatus';
    if (data.referenceNumber !== undefined && data.supportPhone !== undefined) return 'EscalateToAgent';
    if (data.flightNumber && data.status)                                   return 'GetFlightStatus';
    if (data.bookingId && data.departureAirport)                            return 'GetBookingDetails';
    if (data.preferences && typeof data.preferences === 'object')           return 'GetPreferences';
    if (data.dietaryPreference !== undefined || data.seatPosition !== undefined) return 'GetPreferences';
    if (data.newSeat)                                                       return 'UpdateSeat';
    if (data.action === 'meal')                                             return 'UpdatePassenger';
    if (data.rebookOptions)                                                 return 'GetRebookOptions';
    if (data.question || data.answer || data.citations)                     return 'QueryPolicy';
    if (data.generatedResponse || (data.results && Array.isArray(data.results))) return 'AgenticRetrieveStream';
    if (data.retrievalResults && Array.isArray(data.retrievalResults)) return 'Retrieve';
    return 'unknown';
  }

  private handleLocationRequest(requestId: string): void {
    const loc = this.options.userLocation || { latitude: 32.7767, longitude: -96.7970, accuracy: 10.0 };
    this.send({ type: 'location_response', request_id: requestId, location: loc });
  }

  // ─── Session continuity ────────────────────────────────────────────────────

  setConversationContext(messages: Array<{ role: string; content: string }>): void {
    const recent = messages.slice(-20);
    const trimmed = recent.length > 0 && recent[recent.length - 1].role === 'assistant'
      ? recent.slice(0, -1)
      : recent;
    this.conversationContext = trimmed
      .map(m => `${m.role === 'user' ? 'Customer' : 'Agent'}: ${m.content}`)
      .join('\n');
  }

  // ─── Callback registration ─────────────────────────────────────────────────

  onTranscription(cb: (text: string, role: 'user' | 'assistant') => void) { this.onTranscriptionCb = cb; }
  onResponse(cb: (text: string) => void) { this.onResponseCb = cb; }
  onAudio(cb: (data: ArrayBuffer) => void) { this.onAudioCb = cb; }
  onError(cb: (err: Error) => void) { this.onErrorCb = cb; }
  onConnected(cb: () => void) { this.onConnectedCb = cb; }
  onDisconnected(cb: () => void) { this.onDisconnectedCb = cb; }
  onInterruption(cb: () => void) { this.onInterruptionCb = cb; }
  onTurnComplete(cb: () => void) { this.onTurnCompleteCb = cb; }
  onToolStart(cb: (toolName: string) => void) { this.onToolStartCb = cb; }
  onToolEnd(cb: () => void) { this.onToolEndCb = cb; }
  onToolResult(cb: (toolName: string, data: Record<string, unknown>, flightNumber?: string) => void) {
    this.onToolResultCb = cb;
  }

  // ─── SigV4 presigning ──────────────────────────────────────────────────────

  private async createPresignedUrl(): Promise<string> {
    const { runtimeArn, credentials, region } = this.options;
    const baseUrl = `wss://bedrock-agentcore.${region}.amazonaws.com/runtimes/${runtimeArn}/ws?qualifier=DEFAULT&voice_id=tiffany`;
    const httpsUrl = baseUrl.replace('wss://', 'https://');
    const url = new URL(httpsUrl);

    const signer = new SignatureV4({
      service: 'bedrock-agentcore',
      region,
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretKey,
        sessionToken: credentials.SessionToken,
      },
      sha256: Sha256,
    });

    const signed = await signer.presign({
      method: 'GET',
      protocol: 'https:',
      hostname: url.hostname,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: { host: url.hostname },
    }, { expiresIn: 3600 });

    let finalUrl = `https://${signed.hostname}${signed.path}`;
    if (signed.query) {
      finalUrl += `?${new URLSearchParams(signed.query as Record<string, string>).toString()}`;
    }
    return finalUrl.replace('https://', 'wss://');
  }

  // ─── Audio utilities ───────────────────────────────────────────────────────

  private toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  private fromBase64(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
}
