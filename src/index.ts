// Browser polyfills for SDK compatibility
import { Buffer } from "buffer";
// @ts-ignore
if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer;

// Barrel exports for browser usage via IIFE global DGTS
export { AgentController } from "./services/AgentController";
export { VoiceAgentService } from "./services/VoiceAgentService";
export { AudioRecordService } from "./services/AudioRecordService";
export { AudioPlaybackService } from "./services/AudioPlaybackService";

export * from "./lib/Deepgram";
export * from "./lib/Logger";
export * from "./lib/Models";
export { AgentEvents } from "@deepgram/sdk";

export { default as baseConfig } from "./base_config.json";
