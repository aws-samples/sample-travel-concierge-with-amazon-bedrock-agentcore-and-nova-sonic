/**
 * Chat Interface
 *
 * Voice + text chat with the Travel Concierge AI.
 *
 * Card rendering rules:
 *   READ tools  → card appears immediately when tool result arrives (before agent speaks)
 *   WRITE tools → card appears after the agent finishes speaking the confirmation turn
 *   GREETING    → no cards shown during the first agent turn (parallel background fetches)
 */

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { ToolResultCard, WelcomeCard, type ToolResultPayload } from './ToolCards';
import { WebSocketClient } from '../services/WebSocketClient';
import type { AWSCredentials, AppSettings } from '../services/SettingsManager';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: Date;
  isAudio?: boolean;
  isComplete?: boolean;
  toolResult?: ToolResultPayload;
  citations?: PolicyCitation[];
}

export interface PolicyCitation {
  docName: string;
  score: number;
  page?: number;
}

interface ChatInterfaceProps {
  settings: AppSettings;
  credentials: AWSCredentials;
  accessToken: string;
  onSignOut: () => void;
}

// ─── Tools that never produce a visible card ──────────────────────────────────
const SILENT_TOOLS = new Set([
  'SaveConversation',
  'GetPurchaseHistory',
  'GetUpgradeOptions',
  'UpdatePreferences',
  'RebookFlight',
  'UpdatePassenger',
  // Operational read tools — agent speaks the info, no card needed
  'GetUpcomingItinerary',
  'GetFlightStatus',
  'GetPassengerDetails',
  'GetLoyaltyStatus',
  'GetBookingDetails',
  'GetPreferences',
  'GetRebookOptions',
  'UpdateSeat',
  // Note: GetSeatMap is intentionally NOT in this list — the seat map card shows when customer asks to switch/browse seats
]);

// ─── Write tools — card shown AFTER agent confirms, not immediately ───────────
// EscalateToAgent is excluded — it must render immediately to trigger the phone dial
const WRITE_TOOLS = new Set<string>();

// ─── Text formatting ──────────────────────────────────────────────────────────
function formatAssistantMessage(text: string): string {
  return text
    .trim()
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // strip **bold**
    .replace(/\*([^*]+)\*/g, '$1')        // strip *italic*
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/ (Would you like|Is there anything|How can I|What would you)/g, '\n$1')
    .replace(/  +/g, ' ')
    .trim();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatInterface({ settings, credentials, accessToken, onSignOut }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [welcomeData, setWelcomeData] = useState<{
    name: string; tier: string; points: number; loungeAccess: boolean;
  } | null>(null);

  const wsClientRef = useRef<WebSocketClient | null>(null);
  const recordingCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Greeting gate — false until user first speaks or first turn completes
  const greetingDoneRef = useRef(false);

  // Pending write-tool cards — held until turn completes
  const pendingWriteCardsRef = useRef<ToolResultPayload[]>([]);

  // Pending KB citations — attached to the next assistant bubble
  const pendingCitationsRef = useRef<PolicyCitation[]>([]);

  // Flag: disconnect gracefully after current turn completes (set by EscalateToAgent)
  const pendingEscalationDisconnectRef = useRef(false);

  // ─── Sign out ───────────────────────────────────────────────────────────────

  const handleSignOut = () => {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    recordingCtxRef.current?.close().catch(() => {});
    recordingCtxRef.current = null;
    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;
    wsClientRef.current?.disconnect();
    wsClientRef.current = null;
    nextPlayTimeRef.current = 0;
    setIsRecording(false);
    setIsConnected(false);
    onSignOut();
  };

  // ─── WebSocket init ─────────────────────────────────────────────────────────

  const initWebSocket = async () => {
    if (wsClientRef.current?.isConnected()) return;

    try {
      const client = new WebSocketClient({
        websocketUrl: settings.agentCore.websocketUrl,
        runtimeArn: settings.agentCore.runtimeArn,
        credentials,
        region: settings.cognito.region,
        accessToken,
      });

      client.onConnected(() => {
        setIsConnected(true);
        setError(null);
      });

      client.onDisconnected(() => {
        setIsConnected(false);
        greetingDoneRef.current = false;
        pendingWriteCardsRef.current = [];
        pendingEscalationDisconnectRef.current = false;
      });

      client.onTranscription((text, role) => {
        appendMessage(role, text, false, true);
        if (role === 'user') {
          // User spoke — greeting is definitely over
          greetingDoneRef.current = true;
          // Reset pending write cards — they belong to the PREVIOUS turn
          pendingWriteCardsRef.current = [];
          pendingCitationsRef.current = [];
        }
      });

      client.onResponse((text) => {
        appendMessage('assistant', text, false, false);
      });

      client.onAudio((audioData) => {
        playAudio(audioData);
      });

      client.onError((err) => {
        setError(err.message);
      });

      client.onInterruption(() => {
        playbackCtxRef.current?.close();
        playbackCtxRef.current = null;
        nextPlayTimeRef.current = 0;
        markLastAssistantComplete();
        appendMessage('assistant', '— interrupted —', false, true);
        // Flush any pending write cards on interruption too
        flushPendingWriteCards();
      });

      client.onTurnComplete(() => {
        markLastAssistantComplete();
        greetingDoneRef.current = true;
        // Flush write-tool cards now that agent has finished speaking
        flushPendingWriteCards();
      });

      client.onToolStart((toolName) => setCurrentTool(toolName));
      client.onToolEnd(() => setCurrentTool(null));

      client.onToolResult((toolName, data, flightNumber) => {
        handleToolResult(toolName, data, flightNumber);
      });

      wsClientRef.current = client;
      await client.connect();
    } catch {
      setError('Failed to connect to AgentCore Runtime');
    }
  };

  // ─── Tool result handling ───────────────────────────────────────────────────

  const handleToolResult = (
    toolName: string,
    data: Record<string, unknown>,
    flightNumber?: string,
  ) => {
    const short = toolName.replace(/^[a-z0-9-]+___/, '');

    // Always capture loyalty data for WelcomeCard
    if (short === 'GetLoyaltyStatus' && !welcomeData) {
      setWelcomeData({
        name: (data.customerName as string) || 'Traveler',
        tier: (data.loyaltyTier as string) || 'MEMBER',
        points: (data.loyaltyPoints as number) || 0,
        loungeAccess: (data.loungeAccess as boolean) || false,
      });
    }

    // Skip silent tools
    if (SILENT_TOOLS.has(short)) return;

    // Handle KB Retrieve — extract citations, attach to next assistant bubble
    if (short === 'Retrieve' || short === 'AgenticRetrieveStream') {
      const rawResults = (data.retrievalResults as Array<Record<string, unknown>> | undefined) || [];
      if (rawResults.length > 0) {
        // Build citations, then deduplicate by doc name keeping highest score
        const allCitations: PolicyCitation[] = rawResults.map(r => {
          const uri = (r.location as Record<string, unknown> | undefined)?.s3Location as Record<string, unknown> | undefined;
          const s3Uri = (uri?.uri as string) || '';
          const rawName = s3Uri.split('/').pop()?.replace(/\.pdf$/i, '').replace(/-/g, ' ') || 'Policy Document';
          const docName = rawName.replace(/\b\w/g, c => c.toUpperCase());
          const score = Math.round(((r.score as number) || 0) * 100);
          const meta = r.metadata as Record<string, unknown> | undefined;
          const page = meta?.['_excerpt_page_number'] ? Number(meta['_excerpt_page_number']) : undefined;
          return { docName, score, page };
        });
        // Deduplicate: one entry per doc name, keep highest score
        const seen = new Map<string, PolicyCitation>();
        for (const c of allCitations) {
          const existing = seen.get(c.docName);
          if (!existing || c.score > existing.score) seen.set(c.docName, c);
        }
        // Only show citations with score >= 60% to filter out low-relevance matches
        const citations = Array.from(seen.values()).filter(c => c.score >= 60).slice(0, 3);
        if (citations.length > 0) {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            // The agent may start speaking before the KB result arrives (async tool
            // calling). If this turn's answer bubble is already open, attach now.
            if (last && last.role === 'assistant' && !last.isComplete && last.content !== '— interrupted —') {
              const updated = [...prev];
              updated[updated.length - 1] = { ...last, citations };
              return updated;
            }
            // Otherwise attach to the next new assistant bubble.
            pendingCitationsRef.current = citations;
            return prev;
          });
        }
      }
      return;
    }

    // Skip UpdateSeat find-group-seats (no newSeat = search result, not a change)
    if (short === 'UpdateSeat' && !data.newSeat) return;

    // Don't show any cards during greeting turn
    if (!greetingDoneRef.current) return;

    const payload: ToolResultPayload = { toolName, data, flightNumber };

    if (WRITE_TOOLS.has(short)) {
      // Hold write-tool cards until agent finishes speaking
      pendingWriteCardsRef.current.push(payload);
    } else if (short === 'EscalateToAgent') {
      // Escalation: render card immediately, then disconnect after 15s to give agent time to speak the full reference number and message
      appendToolCard(payload);
      setTimeout(() => {
        setIsConnected(false);
        setIsRecording(false);
        recordingCtxRef.current?.close();
        recordingCtxRef.current = null;
        playbackCtxRef.current?.close();
        playbackCtxRef.current = null;
        nextPlayTimeRef.current = 0;
        wsClientRef.current?.disconnect();
        wsClientRef.current = null;
      }, 30000);
    } else {
      // Read tools — show immediately (card appears before agent speaks)
      appendToolCard(payload);
    }
  };

  const flushPendingWriteCards = () => {
    const cards = pendingWriteCardsRef.current;
    if (cards.length === 0) return;
    pendingWriteCardsRef.current = [];
    cards.forEach(appendToolCard);
  };

  const appendToolCard = (payload: ToolResultPayload) => {
    setMessages(prev => [...prev, {
      role: 'tool' as const,
      content: '',
      timestamp: new Date(),
      isComplete: true,
      toolResult: payload,
    }]);
  };

  // ─── Message helpers ────────────────────────────────────────────────────────

  const appendMessage = (
    role: 'user' | 'assistant',
    content: string,
    isAudio: boolean,
    isComplete = true,
  ) => {
    setMessages(prev => {
      if (role === 'assistant' && prev.length > 0) {
        const last = prev[prev.length - 1];
        if (last.role === 'assistant' && !last.isComplete) {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, content: last.content + content, isComplete };
          return updated;
        }
      }
      // Attach any pending KB citations to a new assistant bubble
      const citations = role === 'assistant' && content !== '— interrupted —' && pendingCitationsRef.current.length > 0
        ? pendingCitationsRef.current.splice(0)
        : undefined;
      return [...prev, { role, content, timestamp: new Date(), isAudio, isComplete, citations }];
    });
  };

  const markLastAssistantComplete = () => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role === 'assistant' && !last.isComplete) {
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, isComplete: true };
        return updated;
      }
      return prev;
    });
  };

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (wsClientRef.current && messages.length > 0) {
      wsClientRef.current.setConversationContext(
        messages.filter(m => m.isComplete).map(m => ({ role: m.role, content: m.content })),
      );
    }
  }, [messages]);

  // ─── Text input ─────────────────────────────────────────────────────────────

  const handleSendText = () => {
    if (!inputText.trim() || !wsClientRef.current?.isConnected()) return;
    appendMessage('user', inputText, false);
    wsClientRef.current.sendText(inputText);
    setInputText('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  // ─── Audio recording ────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      if ('wakeLock' in navigator) {
        try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch { /* ok */ }
      }

      if (!wsClientRef.current?.isConnected()) await initWebSocket();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });

      const ctx = new AudioContext();
      recordingCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const processor = ctx.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!wsClientRef.current?.isConnected()) return;
        const input = e.inputBuffer.getChannelData(0);
        const ratio = ctx.sampleRate / 16000;
        const len = Math.floor(input.length / ratio);
        const out = new Int16Array(len);
        for (let i = 0; i < len; i++) {
          out[i] = Math.max(-32768, Math.min(32767, input[Math.floor(i * ratio)] * 32768));
        }
        wsClientRef.current.sendAudio(out.buffer);
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      setIsRecording(true);
    } catch {
      setError('Failed to access microphone');
    }
  };

  const stopRecording = () => {
    wakeLockRef.current?.release().then(() => { wakeLockRef.current = null; }).catch(() => {});
    if (recordingCtxRef.current && isRecording) {
      recordingCtxRef.current.close();
      recordingCtxRef.current = null;
      setIsRecording(false);
    }
    playbackCtxRef.current?.close();
    playbackCtxRef.current = null;
    wsClientRef.current?.disconnect();
    wsClientRef.current = null;
    setIsConnected(false);
    nextPlayTimeRef.current = 0;
  };

  // ─── Audio playback ─────────────────────────────────────────────────────────

  const playAudio = async (audioData: ArrayBuffer) => {
    try {
      if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
        playbackCtxRef.current = new AudioContext({ sampleRate: 16000 });
        nextPlayTimeRef.current = playbackCtxRef.current.currentTime;
      }
      if (playbackCtxRef.current.state === 'suspended') {
        await playbackCtxRef.current.resume();
      }
      const int16 = new Int16Array(audioData);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

      const buf = playbackCtxRef.current.createBuffer(1, float32.length, 16000);
      buf.getChannelData(0).set(float32);

      const now = playbackCtxRef.current.currentTime;
      if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;

      const src = playbackCtxRef.current.createBufferSource();
      src.buffer = buf;
      src.connect(playbackCtxRef.current.destination);
      src.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += buf.duration;
    } catch { /* ignore */ }
  };

  // ─── Tool banner label ──────────────────────────────────────────────────────

  const toolLabel = (toolName: string): string => {
    const map: Record<string, string> = {
      'th-backend-api___GetUpcomingItinerary': '✈️ Loading your itinerary...',
      'th-backend-api___GetLoyaltyStatus':     '⭐ Checking loyalty status...',
      'th-backend-api___GetPurchaseHistory':   '📋 Loading purchase history...',
      'th-backend-api___GetPreferences':       '⚙️ Loading your preferences...',
      'th-backend-api___GetFlightStatus':      '🛫 Checking flight status...',
      'th-backend-api___GetPassengerDetails':  '👥 Loading passenger details...',
      'th-backend-api___GetBookingDetails':    '📄 Loading booking details...',
      'th-backend-api___GetSeatMap':           '💺 Loading seat map...',
      'th-backend-api___GetRebookOptions':     '🔄 Finding rebook options...',
      'th-backend-api___GetUpgradeOptions':    '⬆️ Checking upgrade options...',
      'th-backend-api___UpdateSeat':           '💺 Updating your seat...',
      'th-backend-api___UpdatePassenger':      '👥 Updating passenger info...',
      'th-backend-api___UpdatePreferences':    '⚙️ Saving your preferences...',
      'th-backend-api___RebookFlight':         '🔄 Rebooking your flight...',
      'th-backend-api___QueryPolicy':          '📖 Checking policy...',
      'th-backend-api___EscalateToAgent':      '🎧 Connecting to live agent...',
      'th-backend-api___SaveConversation':     '💾 Saving conversation...',
      // Managed KB connector tools (exposed by th-policy-kb target)
      'th-policy-kb___AgenticRetrieveStream':  '📖 Searching policy documents...',
      'th-policy-kb___Retrieve':               '📖 Looking up policy...',
    };
    return map[toolName] || '🔧 Working...';
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      minHeight: '-webkit-fill-available', backgroundColor: '#F0F4F8',
      position: 'relative', overflow: 'hidden',
    }}>

      {/* Header */}
      <div style={{
        backgroundColor: '#0F2B46', padding: '20px 20px 15px',
        color: 'white', flexShrink: 0, position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '26px', lineHeight: 1 }}>✈️</div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Travel Concierge AI</h2>
              <p style={{ margin: 0, fontSize: '12px', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                  backgroundColor: isConnected ? '#00E676' : '#FF5252',
                }} />
                {isConnected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </div>
          <button onClick={handleSignOut} style={{
            padding: '6px 12px', backgroundColor: 'rgba(255,255,255,0.1)',
            color: 'white', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6, cursor: 'pointer', fontSize: 12,
          }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Tool banner */}
      {currentTool && (
        <div style={{
          backgroundColor: '#00A896', color: '#fff',
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10,
          fontWeight: 500, fontSize: 14,
        }}>
          <span>🔧</span>
          <span>{toolLabel(currentTool)}</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{ backgroundColor: '#DC3545', color: 'white', padding: '12px 20px', fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '20px', paddingBottom: 100,
        display: 'flex', flexDirection: 'column', gap: 16,
        backgroundColor: 'white', WebkitOverflowScrolling: 'touch',
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', marginTop: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✈️</div>
            <p style={{ fontSize: 18, marginBottom: 8, color: '#0F2B46', fontWeight: 500 }}>
              Welcome to Travel Concierge
            </p>
            <p style={{ fontSize: 14, color: '#666' }}>Tap the microphone to start a conversation</p>
          </div>
        )}

        {welcomeData && <WelcomeCard data={welcomeData} />}

        {messages.map((msg, idx) => {
          if (msg.role === 'tool' && msg.toolResult) {
            return (
              <div key={idx} style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
                <ToolResultCard payload={msg.toolResult} />
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 3, paddingLeft: 4 }}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            );
          }

          if (msg.content === '— interrupted —') {
            return (
              <div key={idx} style={{ textAlign: 'center', padding: '2px 0' }}>
                <span style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>— interrupted —</span>
              </div>
            );
          }

          return (
            <div key={idx} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '75%',
            }}>
              <div style={{
                backgroundColor: msg.role === 'user' ? '#0066CC' : '#FFFFFF',
                color: msg.role === 'user' ? 'white' : '#1A1A1A',
                padding: msg.role === 'assistant' ? '16px 20px' : '14px 18px',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                boxShadow: msg.role === 'assistant'
                  ? '0 2px 16px rgba(0,0,0,0.10)'
                  : '0 2px 8px rgba(0,102,204,0.25)',
                border: msg.role === 'assistant' ? '1px solid #E0E7EF' : 'none',
                borderLeft: msg.role === 'assistant' ? '3px solid #0066CC' : 'none',
              }}>
                <div style={{ fontSize: 15, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown components={{
                      p: ({ children }) => <p style={{ margin: '0 0 10px 0', lineHeight: '1.6' }}>{children}</p>,
                      strong: ({ children }) => <strong style={{ fontWeight: 600, color: '#0F2B46' }}>{children}</strong>,
                      ul: ({ children }) => <ul style={{ margin: '6px 0 10px 0', paddingLeft: 20 }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ margin: '6px 0 10px 0', paddingLeft: 20 }}>{children}</ol>,
                      li: ({ children }) => <li style={{ marginBottom: 5, lineHeight: '1.5' }}>{children}</li>,
                      code: ({ children }) => <code style={{
                        backgroundColor: '#EEF2F7', padding: '2px 6px',
                        borderRadius: 4, fontSize: 13, fontFamily: 'monospace', color: '#0F2B46',
                      }}>{children}</code>,
                    }}>
                      {formatAssistantMessage(msg.content)}
                    </ReactMarkdown>
                  ) : msg.content}
                </div>
                <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {msg.isAudio && <span>🎤</span>}
                </div>
                {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                  <div style={{
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: '1px solid #E0E7EF',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}>
                    {msg.citations.map((c, ci) => (
                      <div key={ci} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 11,
                        color: '#6B7A8D',
                      }}>
                        <span title="Source document">📄</span>
                        <span style={{ fontWeight: 500, color: '#0F2B46' }}>{c.docName}</span>
                        {c.page && <span style={{ color: '#999' }}>p.{c.page}</span>}
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span title="Confidence score">🎯</span>
                          <span style={{
                            fontWeight: 600,
                            color: c.score >= 70 ? '#1A7A4A' : c.score >= 50 ? '#B36A00' : '#888',
                          }}>{c.score}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: 'white', borderTop: '1px solid #E0E7EF',
        padding: '10px 12px 16px', display: 'flex', alignItems: 'center', gap: 8,
        zIndex: 1000, boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
      }}>
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={isConnected ? 'Type a message...' : 'Tap 🎤 to connect and talk...'}
          style={{
            flex: 1, padding: '10px 14px', border: '1px solid #D0D9E4',
            borderRadius: 22, fontSize: 15, outline: 'none',
            backgroundColor: '#F8FAFC', color: '#1A1A1A', minWidth: 0,
          }}
        />

        {inputText.trim() && (
          <button onClick={handleSendText} disabled={!isConnected} style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none',
            backgroundColor: isConnected ? '#0066CC' : '#ccc',
            color: 'white', fontSize: 18, cursor: isConnected ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            ➤
          </button>
        )}

        <button
          onClick={isRecording ? stopRecording : startRecording}
          style={{
            width: 44, height: 44, borderRadius: '50%', border: 'none',
            backgroundColor: isRecording ? '#DC3545' : '#0066CC',
            color: 'white', fontSize: 20, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: isRecording ? '0 0 0 3px rgba(220,53,69,0.25)' : '0 2px 8px rgba(0,102,204,0.3)',
            transition: 'all 0.2s ease',
          }}
        >
          {isRecording ? '⏹' : '🎤'}
        </button>

        {isRecording && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: '#DC3545', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', backgroundColor: '#DC3545',
              animation: 'pulse 1s ease-in-out infinite',
            }} />
            Live
          </div>
        )}
      </div>
    </div>
  );
}
