import Terminal from './Terminal';

export default function Demo() {
  return (
    <section id="demo" className="relative py-32 px-6 bg-zinc-900/50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-5xl md:text-6xl font-black mb-6">
            See It In Action
          </h2>
          <p className="text-xl text-zinc-400 max-w-3xl mx-auto">
            Watch how ContextOS retrieves past preferences, skips redundant planning, and executes with superhuman efficiency.
          </p>
        </div>

        <Terminal />

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="p-6 bg-black/50 border border-white/10 rounded-lg">
            <div className="text-3xl font-black text-gradient mb-2">3.2s</div>
            <div className="text-sm text-zinc-400">vs. 12s without memory</div>
            <div className="text-xs text-zinc-500 mt-2">4x faster execution</div>
          </div>
          <div className="p-6 bg-black/50 border border-white/10 rounded-lg">
            <div className="text-3xl font-black text-gradient mb-2">89%</div>
            <div className="text-sm text-zinc-400">context accuracy</div>
            <div className="text-xs text-zinc-500 mt-2">Weighted retrieval</div>
          </div>
          <div className="p-6 bg-black/50 border border-white/10 rounded-lg">
            <div className="text-3xl font-black text-gradient mb-2">0</div>
            <div className="text-sm text-zinc-400">redundant API calls</div>
            <div className="text-xs text-zinc-500 mt-2">Intelligent caching</div>
          </div>
        </div>
      </div>
    </section>
  );
}
