import { useState, useEffect, useRef } from 'react';
import { Play, StopCircle, Terminal, Cpu, Sparkles } from 'lucide-react';

export default function AgentDemo() {
    const [logs, setLogs] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const eventSourceRef = useRef<EventSource | null>(null);
    const terminalRef = useRef<HTMLDivElement>(null);

    const startDemo = () => {
        setLogs([]);
        setIsRunning(true);
        setIsComplete(false);

        const eventSource = new EventSource('/api/demo/golden-run');
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.message) {
                    setLogs((prev) => [...prev, data.message]);
                }
            } catch (e) {
                console.error('Failed to parse SSE message:', e);
            }
        };

        eventSource.addEventListener('complete', () => {
            setIsRunning(false);
            setIsComplete(true);
            eventSource.close();
        });

        eventSource.addEventListener('error', (event) => {
            console.error('SSE Error:', event);
            setIsRunning(false);
            eventSource.close();
        });

        eventSource.onerror = () => {
            setIsRunning(false);
            eventSource.close();
        };
    };

    const stopDemo = () => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            setIsRunning(false);
        }
    };

    useEffect(() => {
        // Auto-scroll to bottom
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs]);

    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    return (
        <section id="agent-demo" className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-black via-gray-900 to-black">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border border-purple-500/30 rounded-full px-4 py-2 mb-6">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                            Powered by Antigravity
                        </span>
                    </div>
                    <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
                        <span className="bg-gradient-to-r from-purple-400 via-pink-500 to-cyan-400 bg-clip-text text-transparent">
                            Live Agent Demo
                        </span>
                    </h2>
                    <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                        Watch the Antigravity agent perform "The Amnesiac Refactor" in real-time.
                        Memory gating, constraint enforcement, and self-correction—all streaming live.
                    </p>
                </div>

                {/* Control Panel */}
                <div className="flex justify-center gap-4 mb-8">
                    <button
                        onClick={startDemo}
                        disabled={isRunning}
                        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${isRunning
                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40'
                            }`}
                    >
                        <Play className="w-5 h-5" />
                        {isRunning ? 'Running...' : 'Start Agent'}
                    </button>

                    <button
                        onClick={stopDemo}
                        disabled={!isRunning}
                        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-300 ${!isRunning
                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-500 text-white'
                            }`}
                    >
                        <StopCircle className="w-5 h-5" />
                        Stop
                    </button>
                </div>

                {/* Status Indicator */}
                <div className="flex justify-center items-center gap-3 mb-6">
                    <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : isComplete ? 'bg-cyan-500' : 'bg-gray-600'}`} />
                    <span className="text-gray-400 text-sm">
                        {isRunning ? 'Agent Executing...' : isComplete ? 'Execution Complete' : 'Ready to Start'}
                    </span>
                    {isRunning && (
                        <Cpu className="w-4 h-4 text-purple-400 animate-spin" />
                    )}
                </div>

                {/* Terminal Output */}
                <div className="relative rounded-xl overflow-hidden border border-gray-700/50 shadow-2xl shadow-purple-500/10">
                    {/* Terminal Header */}
                    <div className="bg-gray-800/90 px-4 py-3 flex items-center gap-3 border-b border-gray-700/50">
                        <div className="flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500" />
                            <div className="w-3 h-3 rounded-full bg-yellow-500" />
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                        </div>
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <Terminal className="w-4 h-4" />
                            <span>antigravity-agent — ~/contextos</span>
                        </div>
                    </div>

                    {/* Terminal Body */}
                    <div
                        ref={terminalRef}
                        className="bg-gray-900/95 p-4 h-96 overflow-y-auto font-mono text-sm"
                    >
                        {logs.length === 0 ? (
                            <div className="text-gray-500 italic">
                                Click "Start Agent" to run the Amnesiac Refactor demo...
                            </div>
                        ) : (
                            logs.map((log, index) => (
                                <div
                                    key={index}
                                    className={`whitespace-pre-wrap mb-1 ${log.includes('✅') ? 'text-green-400' :
                                            log.includes('❌') ? 'text-red-400' :
                                                log.includes('⚠️') ? 'text-yellow-400' :
                                                    log.includes('🧠') ? 'text-purple-400' :
                                                        log.includes('📌') ? 'text-cyan-400' :
                                                            log.includes('STEP') ? 'text-blue-400' :
                                                                log.includes('TURN') ? 'text-pink-400' :
                                                                    'text-gray-300'
                                        }`}
                                >
                                    {log}
                                </div>
                            ))
                        )}
                        {isRunning && (
                            <div className="flex items-center gap-2 text-purple-400 mt-2">
                                <span className="animate-pulse">▋</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Info Cards */}
                <div className="grid md:grid-cols-3 gap-6 mt-12">
                    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-xl p-6 border border-gray-700/30">
                        <h3 className="text-lg font-semibold text-white mb-2">Memory Gating</h3>
                        <p className="text-gray-400 text-sm">
                            Constraints are stored with entropy checks, ensuring only novel information enters memory.
                        </p>
                    </div>
                    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-xl p-6 border border-gray-700/30">
                        <h3 className="text-lg font-semibold text-white mb-2">Constraint Enforcement</h3>
                        <p className="text-gray-400 text-sm">
                            The agent recalls "no arrow functions" constraint and adheres to it during code generation.
                        </p>
                    </div>
                    <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-xl p-6 border border-gray-700/30">
                        <h3 className="text-lg font-semibold text-white mb-2">Self-Correction</h3>
                        <p className="text-gray-400 text-sm">
                            When tests fail, the agent automatically analyzes errors and regenerates compliant code.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
