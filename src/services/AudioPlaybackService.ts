import { voiceAgentLog } from "../lib/Logger";

export class AudioPlaybackService {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private nextStartTime = 0;
  private queue: Uint8Array[] = [];
  // Fixed to 24kHz as produced by agent audio.output.sample_rate
  private playbackSampleRate = 24000;

  setPlaybackSampleRate(rate: number) {
    this.playbackSampleRate = rate;
  }

  private async getAudioContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      voiceAgentLog.audio("Created new AudioContext for playback");
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
      voiceAgentLog.audio("Resumed AudioContext after user interaction");
    }
    return this.audioContext;
  }

  enqueue(chunk: Uint8Array) {
    this.queue.push(chunk);
    void this.processQueue();
  }

  async processQueue() {
    if (this.queue.length === 0) return;
    try {
      const ctx = await this.getAudioContext();
      if (this.nextStartTime < ctx.currentTime) {
        this.nextStartTime = ctx.currentTime;
      }
      while (this.queue.length > 0) {
        const audioChunk = this.queue.shift()!;
        const audioData = new Int16Array(audioChunk.buffer);
        if (audioData.length === 0) continue;

        const buffer = ctx.createBuffer(1, audioData.length, this.playbackSampleRate);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < audioData.length; i++) {
          channelData[i] = audioData[i] / 0x7fff;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        const startTime = this.nextStartTime;
        source.start(startTime);
        this.nextStartTime = startTime + buffer.duration;
        source.onended = () => {
          if (ctx.currentTime >= this.nextStartTime - 0.1) {
            if (this.queue.length === 0) {
              voiceAgentLog.audio("Agent finished speaking");
            }
          }
        };
        this.currentSource = source;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      voiceAgentLog.error("AudioPlaybackService error", msg);
    }
  }

  stop() {
    try {
      this.currentSource?.stop();
    } catch {
      // already stopped
    }
    this.currentSource = null;
    this.queue = [];
    this.nextStartTime = 0;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
      voiceAgentLog.audio("Closed AudioContext");
    }
  }
}
