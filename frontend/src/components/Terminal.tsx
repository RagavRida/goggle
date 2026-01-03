import { useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

interface LogLine {
  text: string;
  color?: string;
  timestamp?: number;
}

function formatEvent(event: { type: string; payload: unknown; source: string }): LogLine {
  const type = event.type;
  const payload = event.payload as Record<string, unknown>;

  switch (type) {
    case 'connection:established':
      return {
        text: `> [ContextOS] 🟢 Connected to kernel (state: ${(payload.kernelState as string) || 'idle'})`,
        color: 'text-green-400',
      };

    case 'kernel:state_changed':
      return {
        text: `> [Kernel] ⚡ State: ${payload.from} → ${payload.to}`,
        color: 'text-purple-400',
      };

    case 'task:created':
      return {
        text: `> [Kernel] 📝 Task created: "${payload.name}" (${String(payload.taskId).slice(0, 8)}...)`,
        color: 'text-blue-400',
      };

    case 'task:started':
      return {
        text: `> [Kernel] ▶️ Task started: ${String(payload.taskId).slice(0, 8)}...`,
        color: 'text-yellow-400',
      };

    case 'task:completed':
      return {
        text: `> [Kernel] ✅ Task completed: ${String(payload.taskId).slice(0, 8)}...`,
        color: 'text-green-400',
      };

    case 'task:failed':
      return {
        text: `> [Kernel] ❌ Task failed: ${payload.error}`,
        color: 'text-red-400',
      };

    case 'agent:registered':
      return {
        text: `> [Registry] 🤖 Agent registered: "${payload.name}"`,
        color: 'text-cyan-400',
      };

    case 'agent:state_changed':
      return {
        text: `> [Registry] Agent ${String(payload.agentId).slice(0, 8)}...: ${payload.from} → ${payload.to}`,
        color: 'text-orange-400',
      };

    case 'memory:created':
      return {
        text: `> [Memory] 💾 New ${payload.type} stored`,
        color: 'text-pink-400',
      };

    case 'memory:retrieved':
      return {
        text: `> [Memory] 🔍 Retrieved ${payload.count} memories (query: "${payload.query}")`,
        color: 'text-orange-400',
      };

    case 'cache:hit':
      return {
        text: `> [RCE] ⚡ Cache hit: "${payload.strategy}" (confidence: ${payload.confidence})`,
        color: 'text-yellow-400',
      };

    case 'gemini:skipped':
      return {
        text: `> [Gemini] 🚀 Skipping LLM call: ${payload.reason}`,
        color: 'text-purple-400',
      };

    case 'pong':
      return {
        text: `> [Server] 🏓 Pong`,
        color: 'text-zinc-500',
      };

    default:
      return {
        text: `> [${event.source}] ${type}: ${JSON.stringify(payload).slice(0, 60)}...`,
        color: 'text-zinc-400',
      };
  }
}

export default function Terminal() {
  const { events, connected, sendMessage } = useWebSocket();
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [events]);

  // Send a test task
  const handleExecuteDemo = () => {
    sendMessage({
      type: 'execute',
      payload: {
        name: 'demo-task',
        input: { message: 'Hello from frontend!' },
        description: 'Demo task triggered from UI',
      },
    });
  };

  const logs: LogLine[] = events.map((event) => ({
    ...formatEvent(event),
    timestamp: event.timestamp,
  }));

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 rounded-lg blur opacity-20"></div>
      <div className="relative bg-zinc-900 border border-white/10 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/50">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <span className="text-xs text-zinc-400 font-mono ml-2">contextos-kernel</span>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 text-xs font-mono ${connected ? 'text-green-400' : 'text-red-400'}`}>
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
              {connected ? 'Live' : 'Disconnected'}
            </div>
            <button
              onClick={handleExecuteDemo}
              className="px-3 py-1 text-xs font-medium bg-purple-600 hover:bg-purple-700 rounded transition-colors"
            >
              Run Demo Task
            </button>
          </div>
        </div>

        {/* Terminal Content */}
        <div
          ref={terminalRef}
          className="p-6 font-mono text-sm h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
        >
          {logs.length === 0 ? (
            <div className="text-zinc-500">
              {connected
                ? '> Waiting for kernel events...'
                : '> Connecting to ContextOS kernel...'}
            </div>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`${log.color || 'text-white'} mb-2 animate-fade-in`}
              >
                {log.text}
                {log.timestamp && (
                  <span className="text-zinc-600 text-xs ml-2">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            ))
          )}
          {/* Cursor */}
          <div className="inline-block w-2 h-4 bg-purple-400 animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}
