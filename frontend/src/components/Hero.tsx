import { Play, FileText, Sparkles } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 pt-24 pb-16">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-6xl mx-auto text-center">
        <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
          <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white/10 rounded-full text-xs font-medium">
            <Sparkles className="w-3 h-3 text-blue-400" />
            <span className="text-zinc-300">Powered by Google Antigravity</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white/10 rounded-full text-xs font-medium">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
            <span className="text-zinc-300">Gemini 3 Reasoning</span>
          </div>
        </div>

        <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tight">
          The First Agent That
          <br />
          <span className="text-gradient">Doesn't Forget</span>
        </h1>

        <p className="text-xl md:text-2xl text-zinc-400 max-w-4xl mx-auto mb-12 leading-relaxed">
          ContextOS acts as the <span className="text-orange-400 font-semibold">hippocampus</span> for Gemini 3.
          <br />
          It gates noise, compounds knowledge, and enables agents to reason over{' '}
          <span className="text-white font-semibold">days, not just minutes.</span>
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
          <button className="group flex items-center gap-3 px-8 py-4 bg-white text-black rounded-lg font-semibold text-lg hover:scale-105 transition-transform glow-purple">
            <Play className="w-5 h-5 group-hover:animate-pulse" />
            Watch Demo
          </button>
          <button className="flex items-center gap-3 px-8 py-4 border border-white/20 rounded-lg font-semibold text-lg hover:bg-white/5 transition-all">
            <FileText className="w-5 h-5" />
            Read the Specs
          </button>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-b from-transparent via-purple-500/10 to-transparent blur-2xl"></div>
          <div className="relative text-xs text-zinc-500 uppercase tracking-wider font-mono mb-4">
            Live Reasoning in Action
          </div>
        </div>
      </div>
    </section>
  );
}
