export interface DebugSession {
  id: string;
  title: string;
  status: 'open' | 'resolved' | 'abandoned';
  errorText?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  description?: string;
  fixAttempts: FixAttempt[];
  terminalCommands: TerminalCommand[];
}

export interface FixAttempt {
  id: string;
  description: string;
  timestamp: string;
  successful: boolean;
}

export interface TerminalCommand {
  command: string;
  timestamp: string;
  exitCode?: number;
}

export interface SessionSearchResult {
  sessions: DebugSession[];
  total: number;
}
