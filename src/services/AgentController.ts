import { VoiceAgentService, type AgentConfig, type VoiceAgentState, type ConversationMessage } from "./VoiceAgentService";
import { AudioRecordService, type AudioRecordCallbacks } from "./AudioRecordService";
import { AudioPlaybackService } from "./AudioPlaybackService";
import { AgentEvents } from "@deepgram/sdk";

type ControllerEvents = {
  state: (s: VoiceAgentState) => void;
  audio: (a: Uint8Array) => void;
  error: (err: string) => void;
};

export type AgentControllerInit = {
  token: string;             // required: pre-minted client JWT token
  settings?: any;
  config?: AgentConfig;
  recordCallbacks?: AudioRecordCallbacks;
};

export class AgentController {
  private service: VoiceAgentService;
  private recorder: AudioRecordService;
  private playback: AudioPlaybackService;
  private listeners: Partial<ControllerEvents> = {};
  private initialized = false;
  private agentEventHandlers: Map<AgentEvents, Array<(data: any) => void>> = new Map();

  constructor() {
    this.service = new VoiceAgentService();
    this.recorder = new AudioRecordService();
    this.playback = new AudioPlaybackService();

    // Bridge events from service to controller listeners and playback
    this.service.on({
      state: (s) => this.listeners.state?.(s),
      audioChunk: (chunk) => {
        this.playback.enqueue(chunk);
        this.listeners.audio?.(chunk);
      },
    });
  }

  on<K extends keyof ControllerEvents>(evt: K, fn: ControllerEvents[K]) {
    // Single listener per event for simplicity; extend as needed
    (this.listeners as any)[evt] = fn;
  }

  off<K extends keyof ControllerEvents>(evt: K) {
    (this.listeners as any)[evt] = undefined;
  }

  init(opts: AgentControllerInit) {
    const { token, settings, config } = opts;
    this.service.setToken(token);
    if (config) this.service.setConfig(config);
    if (settings) {
      this.service.setSettings(settings);
      try {
        const outRate = settings?.audio?.output?.sample_rate;
        if (typeof outRate === "number") this.playback.setPlaybackSampleRate(outRate);
      } catch {}
    }
    this.initialized = true;
  }
  async connect() {
    if (!this.initialized) throw new Error("AgentController not initialized. Call init() first.");
    await this.service.connect();
    // After connection, register any pending agent event handlers to the live client
    const client = this.service.getClient() as any;
    if (client && this.agentEventHandlers.size > 0) {
      for (const [evt, fns] of this.agentEventHandlers.entries()) {
        for (const fn of fns) client.on(evt, fn as any);
      }
    }
  }

  disconnect() {
    try { this.recorder.stop(); } catch {}
    try { this.playback.stop(); } catch {}
    this.service.disconnect();
  }

  async startRecording(callbacks?: AudioRecordCallbacks) {
    const client = this.service.getClient();
    await this.recorder.start(client, callbacks);
  }

  stopRecording(callbacks?: AudioRecordCallbacks) {
    this.recorder.stop(callbacks);
  }

  updatePrompt(text: string) {
    this.service.updatePrompt(text);
  }

  updateSettings(settings: any) {
    this.service.updateSettings(settings);
    try {
      const outRate = settings?.audio?.output?.sample_rate;
      if (typeof outRate === "number") this.playback.setPlaybackSampleRate(outRate);
    } catch {}
  }

  injectUserMessage(text: string) {
    this.service.injectUserMessage(text);
  }

  keepAlive() {
    this.service.keepAlive();
  }

  updateSpeak(speakConfig: any) {
    this.service.updateSpeak(speakConfig);
  }

  injectAgentMessage(content: string) {
    this.service.injectAgentMessage(content);
  }

  functionCallResponse(response: any) {
    this.service.functionCallResponse(response);
  }

  getClient() {
    return this.service.getClient();
  }

  /**
   * Register a handler for a Deepgram Agent event.
   * Handlers are buffered before connect() and will be attached once connected.
   */
  onAgent(event: AgentEvents, handler: (data: any) => void) {
    const arr = this.agentEventHandlers.get(event) ?? [];
    arr.push(handler);
    this.agentEventHandlers.set(event, arr);
    const client = this.service.getClient() as any;
    if (client?.on) client.on(event, handler as any);
  }

  /**
   * Remove handlers for a Deepgram Agent event. If handler is omitted, removes all for that event.
   */
  offAgent(event: AgentEvents, handler?: (data: any) => void) {
    const client = this.service.getClient() as any;
    if (!this.agentEventHandlers.has(event)) return;

    if (handler) {
      const arr = (this.agentEventHandlers.get(event) ?? []).filter((h) => h !== handler);
      this.agentEventHandlers.set(event, arr);
    } else {
      this.agentEventHandlers.delete(event);
      // If SDK supports off and we had stored handlers, they'd be removed above
    }
  }

  // Convenience: access state and transcript
  getState(): VoiceAgentState {
    return this.service.getState();
  }

  getTranscript(): ConversationMessage[] {
    return this.service.getState().transcript;
  }

  onTranscript(handler: (messages: ConversationMessage[]) => void) {
    let lastLen = this.service.getState().transcript.length;
    if (lastLen > 0) handler(this.service.getState().transcript);
    this.on("state", (s) => {
      if (s.transcript.length !== lastLen) {
        lastLen = s.transcript.length;
        handler(s.transcript);
      }
    });
  }

  clearTranscript() {
    this.service.clearTranscript();
  }
}