import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private level: LogLevel;
  private logFile?: string;

  constructor(level: LogLevel = LogLevel.INFO, logFile?: string) {
    this.level = level;
    this.logFile = logFile;
    if (logFile) {
      const dir = path.dirname(logFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
  }

  private write(level: LogLevel, message: string) {
    if (level < this.level) return;
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const line = `[${timestamp}] [${levelName}] ${message}`;
    console.log(line);
    if (this.logFile) {
      fs.appendFileSync(this.logFile, line + '\n', 'utf-8');
    }
  }

  debug(msg: string) {
    this.write(LogLevel.DEBUG, msg);
  }
  info(msg: string) {
    this.write(LogLevel.INFO, msg);
  }
  warn(msg: string) {
    this.write(LogLevel.WARN, msg);
  }
  error(msg: string) {
    this.write(LogLevel.ERROR, msg);
  }
}
