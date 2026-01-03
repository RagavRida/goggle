import { useEffect, useState } from 'react';
import { Activity, Database, Brain, Users, MessageSquare, Zap } from 'lucide-react';
import { contextos, type Stats } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';

interface StatCardProps {
    icon: React.ElementType;
    label: string;
    value: string | number;
    subtext?: string;
    color: string;
}

function StatCard({ icon: Icon, label, value, subtext, color }: StatCardProps) {
    return (
        <div className="p-4 bg-zinc-900 border border-white/10 rounded-lg hover:border-white/20 transition-colors">
            <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${color}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm text-zinc-400">{label}</span>
            </div>
            <div className="text-2xl font-bold">{value}</div>
            {subtext && <div className="text-xs text-zinc-500 mt-1">{subtext}</div>}
        </div>
    );
}

function KernelStateIndicator({ state }: { state: string }) {
    const stateColors: Record<string, { bg: string; text: string }> = {
        idle: { bg: 'bg-green-500/20', text: 'text-green-400' },
        planning: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
        executing: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
        verifying: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
        blocked: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
        error: { bg: 'bg-red-500/20', text: 'text-red-400' },
    };

    const colors = stateColors[state] || stateColors.idle;

    return (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${colors.bg}`}>
            <div className={`w-2 h-2 rounded-full ${colors.text.replace('text-', 'bg-')} animate-pulse`}></div>
            <span className={`text-sm font-medium uppercase ${colors.text}`}>{state}</span>
        </div>
    );
}

export default function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { connected, latestEvent } = useWebSocket();

    // Initial fetch
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await contextos.stats();
                setStats(data);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch stats');
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    // Refresh on kernel events
    useEffect(() => {
        if (latestEvent && latestEvent.type.startsWith('task:')) {
            contextos.stats().then(setStats).catch(console.error);
        }
    }, [latestEvent]);

    // Auto-refresh every 5 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            contextos.stats().then(setStats).catch(console.error);
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <section id="dashboard" className="relative py-16 px-6">
                <div className="max-w-7xl mx-auto text-center">
                    <div className="text-zinc-500">Loading dashboard...</div>
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section id="dashboard" className="relative py-16 px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-center">
                        {error}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section id="dashboard" className="relative py-16 px-6 bg-zinc-900/30">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-3xl font-black mb-2">Live Dashboard</h2>
                        <p className="text-zinc-400">Real-time kernel metrics and system status</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-2 text-sm ${connected ? 'text-green-400' : 'text-red-400'}`}>
                            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                            WebSocket {connected ? 'Connected' : 'Disconnected'}
                        </div>
                        {stats && <KernelStateIndicator state={stats.kernel.state} />}
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
                    <StatCard
                        icon={Activity}
                        label="Kernel State"
                        value={stats?.kernel.state || 'unknown'}
                        color="bg-purple-500/20 text-purple-400"
                    />
                    <StatCard
                        icon={Zap}
                        label="Queue Length"
                        value={stats?.kernel.queueLength || 0}
                        color="bg-yellow-500/20 text-yellow-400"
                    />
                    <StatCard
                        icon={Database}
                        label="Memories"
                        value={stats?.memory?.totalEntries || 0}
                        subtext={`Cache: ${stats?.memory?.cacheSize || 0}`}
                        color="bg-orange-500/20 text-orange-400"
                    />
                    <StatCard
                        icon={Users}
                        label="Agents"
                        value={stats?.registry?.total || 0}
                        subtext={`Idle: ${stats?.registry?.byState?.idle || 0}`}
                        color="bg-blue-500/20 text-blue-400"
                    />
                    <StatCard
                        icon={MessageSquare}
                        label="Messages"
                        value={stats?.bus?.totalMessages || 0}
                        subtext={`Pending: ${stats?.bus?.pendingMessages || 0}`}
                        color="bg-cyan-500/20 text-cyan-400"
                    />
                    <StatCard
                        icon={Brain}
                        label="Subscriptions"
                        value={stats?.bus?.subscriptions || 0}
                        color="bg-pink-500/20 text-pink-400"
                    />
                </div>

                {/* Task Status Breakdown */}
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="p-6 bg-zinc-900 border border-white/10 rounded-lg">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Zap className="w-5 h-5 text-yellow-400" />
                            Task Status
                        </h3>
                        <div className="space-y-3">
                            {Object.entries(stats?.kernel.tasksByStatus || {}).map(([status, count]) => {
                                const colors: Record<string, string> = {
                                    pending: 'bg-blue-500',
                                    running: 'bg-yellow-500',
                                    completed: 'bg-green-500',
                                    failed: 'bg-red-500',
                                    cancelled: 'bg-zinc-500',
                                };
                                const total = Object.values(stats?.kernel.tasksByStatus || {}).reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? (count / total) * 100 : 0;

                                return (
                                    <div key={status} className="flex items-center gap-3">
                                        <div className="w-20 text-sm text-zinc-400 capitalize">{status}</div>
                                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${colors[status] || 'bg-zinc-500'} transition-all duration-500`}
                                                style={{ width: `${percentage}%` }}
                                            ></div>
                                        </div>
                                        <div className="w-8 text-right text-sm font-mono">{count}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-6 bg-zinc-900 border border-white/10 rounded-lg">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-blue-400" />
                            Agent States
                        </h3>
                        <div className="space-y-3">
                            {Object.entries(stats?.registry?.byState || {}).map(([state, count]) => {
                                const colors: Record<string, string> = {
                                    idle: 'bg-green-500',
                                    busy: 'bg-yellow-500',
                                    blocked: 'bg-orange-500',
                                    offline: 'bg-zinc-500',
                                };
                                const total = Object.values(stats?.registry?.byState || {}).reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? (count / total) * 100 : 0;

                                return (
                                    <div key={state} className="flex items-center gap-3">
                                        <div className="w-20 text-sm text-zinc-400 capitalize">{state}</div>
                                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${colors[state] || 'bg-zinc-500'} transition-all duration-500`}
                                                style={{ width: `${percentage}%` }}
                                            ></div>
                                        </div>
                                        <div className="w-8 text-right text-sm font-mono">{count}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
