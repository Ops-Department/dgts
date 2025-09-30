import { AgentEvents, DeepgramClient, type AgentLiveClient } from "@deepgram/sdk";

export type ListenModel = string;
export type ThinkModel = string;
export type SpeechModel = string;

export type AgentConfig = {
  listenModel: ListenModel;
  thinkModel: ThinkModel;
  speechModel: SpeechModel;
  basePrompt: string;
};

export type ConversationMessage = { role: string; content: string };

export type VoiceAgentState = {
  connected: boolean;
  isAgentSpeaking: boolean;
  transcript: ConversationMessage[];
  error: string | null;
};

export type VoiceAgentEvents = {
  state: (state: VoiceAgentState) => void;
  audioChunk: (audio: Uint8Array) => void;
  welcome?: (data: unknown) => void;
};

export class VoiceAgentService {
  private client: AgentLiveClient | null = null;
  private token: string | null = null;
  private config: AgentConfig | null = null;
  private rawSettings: any | null = null;

  private state: VoiceAgentState = {
    connected: false,
    isAgentSpeaking: false,
    transcript: [],
    error: null,
  };

  private listeners: VoiceAgentEvents = {
    state: () => void 0,
    audioChunk: () => void 0,
  };

  on(events: Partial<VoiceAgentEvents>) {
    this.listeners = { ...this.listeners, ...events } as VoiceAgentEvents;
  }

  getState() {
    return this.state;
  }

  setToken(token: string) {
    this.token = token;
  }

  setConfig(config: AgentConfig) {
    this.config = config;
  }

  setSettings(settings: any) {
    this.rawSettings = settings;
  }

  private emitState(patch: Partial<VoiceAgentState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.state?.(this.state);
  }

  private pushMessage(msg: ConversationMessage) {
    const transcript = [...this.state.transcript, msg];
    this.emitState({ transcript });
  }

  async connect() {
    if (!this.token) throw new Error("No token set");
    if (!this.config && !this.rawSettings) throw new Error("No agent settings provided");

    const { listenModel, thinkModel, speechModel, basePrompt } = this.config ?? ({} as AgentConfig);

    const resolveThinkProvider = (model: string): "anthropic" | "open_ai" | "google" => {
      const m = model.toLowerCase();
      if (m.includes("claude")) return "anthropic";
      if (m.includes("gemini") || m.includes("google")) return "google";
      // default to OpenAI for gpt/o-series and unknowns
      return "open_ai";
    };

    const client = new DeepgramClient({ accessToken: this.token }).agent();
    this.client = client;

    client.once(AgentEvents.Welcome, (welcome) => {
      this.listeners.welcome?.(welcome);
      const settings = this.rawSettings ?? ({
        audio: {
          input: { encoding: "linear16", sample_rate: 24000 },
          output: { encoding: "linear16", sample_rate: 24000, container: "none" },
        },
        agent: {
          greeting: "Whats up buttercup?",
          listen: { provider: { type: "deepgram", model: listenModel } },
          speak: { provider: { type: "deepgram", model: speechModel } },
          think: {
            provider: { type: resolveThinkProvider(thinkModel), model: thinkModel },
            prompt: basePrompt,
          },
        },
      } as any);
      client.configure(settings);
    });

    client.once(AgentEvents.SettingsApplied, () => {
      this.emitState({ connected: true });
      client.keepAlive();
    });

    client.on(AgentEvents.Error, (error) => {
      this.emitState({ error: `Agent error: ${error.message}` });
    });

    client.on(AgentEvents.Audio, (audio: Uint8Array) => {
      this.listeners.audioChunk?.(audio);
    });

    client.on(AgentEvents.AgentStartedSpeaking, () => {
      this.emitState({ isAgentSpeaking: true });
    });

    client.on(AgentEvents.AgentAudioDone, () => {
      this.emitState({ isAgentSpeaking: false });
    });

    client.on(AgentEvents.ConversationText, (message) => {
      this.pushMessage({ role: message.role, content: message.content });
    });

    client.on(AgentEvents.Close, () => {
      this.emitState({ connected: false });
    });
  }

  disconnect() {
    if (this.client) {
      try { this.client.disconnect(); } catch {}
    }
    this.client = null;
    this.emitState({ connected: false, isAgentSpeaking: false });
  }

  injectUserMessage(text: string) {
    if (!this.client) throw new Error("Not connected");
    this.client.injectUserMessage(text);
    this.pushMessage({ role: "user", content: text });
  }

  updatePrompt(prompt: string) {
    if (!this.client) throw new Error("Not connected");
    this.client.updatePrompt(prompt);
    this.pushMessage({ role: "system", content: `System prompt updated: ${prompt}` });
  }

  updateSettings(settings: any) {
    if (!this.client) throw new Error("Not connected");
    this.client.configure(settings as any);
    this.rawSettings = settings;
    this.pushMessage({ role: "system", content: `Agent settings updated.` });
  }

  keepAlive() {
    try { this.client?.keepAlive(); } catch {}
  }

  updateSpeak(speakConfig: any) {
    if (!this.client) throw new Error("Not connected");
    this.client.updateSpeak(speakConfig);
    this.pushMessage({ role: "system", content: `Speak configuration updated.` });
  }

  injectAgentMessage(content: string) {
    if (!this.client) throw new Error("Not connected");
    this.client.injectAgentMessage(content);
    this.pushMessage({ role: "assistant", content });
  }

  functionCallResponse(response: any) {
    if (!this.client) throw new Error("Not connected");
    this.client.functionCallResponse(response);
  }

  clearTranscript() {
    this.state.transcript = [];
    this.emitState({ transcript: this.state.transcript });
  }

  getClient() {
    return this.client;
  }
}
