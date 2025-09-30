import { type AgentLiveClient } from "@deepgram/sdk";
import { voiceAgentLog } from "../lib/Logger";

export type AudioRecordCallbacks = {
  onError?: (error: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  onSampleRateDetermined?: (sampleRate: number) => void;
};

/**
 * AudioRecordService
 * Starts/stops microphone capture and streams linear16 PCM to a Deepgram Agent client.
 * Mirrors logic from `src/app/components/mic/Mic.tsx` but usable programmatically.
 */
export class AudioRecordService {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isRecording = false;
  private isFirefox = false;

  async start(client: AgentLiveClient | null | undefined, cb: AudioRecordCallbacks = {}) {
    if (!client) {
      cb.onError?.("No agent client available to stream audio");
      return;
    }
    if (this.isRecording) return;

    try {
      voiceAgentLog.microphone("Starting real-time microphone streaming (service)...");

      // Detect Firefox
      this.isFirefox = typeof window !== "undefined" && navigator.userAgent.includes("Firefox");
      cb.onRecordingChange?.(false);

      // Build constraints
      let audioConstraints: MediaTrackConstraints;
      if (this.isFirefox) {
        audioConstraints = {
          echoCancellation: true,
          noiseSuppression: false,
        } as any;
      } else {
        audioConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
          channelCount: 1,
        } as any;
      }

      // Acquire mic stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      this.stream = stream;

      // Create AudioContext
      let audioContext: AudioContext;
      if (this.isFirefox) {
        audioContext = new AudioContext();
        if (audioContext.state === "suspended") {
          await audioContext.resume();
          await new Promise((r) => setTimeout(r, 100));
        }
      } else {
        audioContext = new AudioContext({ sampleRate: 24000 });
      }
      this.audioContext = audioContext;
      cb.onSampleRateDetermined?.(audioContext.sampleRate);

      // Wire nodes
      const source = audioContext.createMediaStreamSource(stream);
      this.source = source;
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      this.processor = processor;

      processor.onaudioprocess = (evt) => {
        const inputData = evt.inputBuffer.getChannelData(0);

        // Downsample for Firefox (48k -> 24k)
        let processedData: Float32Array;
        if (this.isFirefox) {
          const downLen = Math.floor(inputData.length / 2);
          processedData = new Float32Array(downLen);
          for (let i = 0; i < downLen; i++) processedData[i] = inputData[i * 2];
        } else {
          processedData = inputData;
        }

        // Float32 -> Int16 (linear16)
        const pcm = new Int16Array(processedData.length);
        for (let i = 0; i < processedData.length; i++) {
          const sample = Math.max(-1, Math.min(1, processedData[i]));
          pcm[i] = Math.round(sample * 0x7fff);
        }
        try {
          client.send(pcm.buffer);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          voiceAgentLog.error(`Error sending audio to agent: ${msg}`);
          cb.onError?.(`Error sending audio: ${msg}`);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      this.isRecording = true;
      cb.onRecordingChange?.(true);
      voiceAgentLog.microphone(`Real-time microphone streaming started (service) (${audioContext.sampleRate}Hz)`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      voiceAgentLog.error(`Error starting microphone (service): ${msg}`);
      cb.onError?.(`Microphone access error: ${msg}`);
    }
  }

  stop(cb: AudioRecordCallbacks = {}) {
    voiceAgentLog.microphone("Stopping microphone streaming (service)...");
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    const wasRecording = this.isRecording;
    this.isRecording = false;
    if (wasRecording) cb.onRecordingChange?.(false);
    voiceAgentLog.microphone("Microphone streaming stopped (service)");
  }
}