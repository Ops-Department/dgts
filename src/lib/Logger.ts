// Dual logging utility - logs to both browser console and server

type LogLevel = 'info' | 'warn' | 'error';
type LogData = Record<string, unknown> | string | number | boolean | null | undefined;

class DualLogger {

  // Constructor that supports setting default destinations
  constructor(private defaultDestination: 'browser' | 'server' | 'both' = 'both') {}

  private async logToServer(level: LogLevel, message: string, data?: LogData): Promise<void> {
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level,
          message,
          data
        })
      });
    } catch (error) {
      // If server logging fails, at least log to browser console
      console.error('Failed to log to server:', error);
    }
  }

  private logToBrowser(level: LogLevel, message: string, data?: LogData): void {
    const logMessage = data ? `${message} ${JSON.stringify(data, null, 2)}` : message;

    switch (level) {
      case 'info':
        console.log(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'error':
        console.error(logMessage);
        break;
    }
  }

  async log(message: string, data?: LogData, level: LogLevel = 'info', destination: 'browser' | 'server' | 'both' = this.defaultDestination): Promise<void> {
    if (destination === 'browser' || destination === 'both') this.logToBrowser(level, message, data);
    if (destination === 'server' || destination === 'both') await this.logToServer(level, message, data);
  }

  async warn(message: string, data?: LogData, destination: 'browser' | 'server' | 'both' = this.defaultDestination): Promise<void> {
    this.log(message, data, 'warn', destination);
  }

  async error(message: string, data?: LogData, destination: 'browser' | 'server' | 'both' = this.defaultDestination): Promise<void> {
    this.log(message, data, 'error', destination);
  }

  // Synchronous versions for critical paths where we can't wait
  logSync(message: string, data?: LogData, level: LogLevel = 'info', destination: 'browser' | 'server' | 'both' = this.defaultDestination): void {
    this.log(message, data, level, destination);
  }

  errorSync(message: string, data?: LogData, level: LogLevel = 'error', destination: 'browser' | 'server' | 'both' = this.defaultDestination): void {
    this.log(message, data, level, destination);
  }
}

// Export singleton instance
export const logger = new DualLogger('browser');

// Convenience functions for common voice agent events
export const voiceAgentLog = {
  auth: (message: string, data?: LogData) => logger.logSync(`🔐 AUTH: ${message}`, data),
  connection: (message: string, data?: LogData) => logger.logSync(`🔌 CONNECTION: ${message}`, data),
  agentEvent: (message: string, data?: LogData) => logger.logSync(`🤖 AGENT EVENT: ${message}`, data),
  audio: (message: string, data?: LogData) => logger.logSync(`🔊 AUDIO: ${message}`, data),
  conversation: (message: string, data?: LogData) => logger.logSync(`💬 CONVERSATION: ${message}`, data),
  error: (message: string, data?: LogData) => logger.errorSync(`❌ ERROR: ${message}`, data),
  microphone: (message: string, data?: LogData) => logger.logSync(`🎙️ MICROPHONE: ${message}`, data),
  keepalive: (message: string, data?: LogData) => logger.logSync(`💓 KEEPALIVE: ${message}`, data),
};
