import { Brain, Database, Zap, Clock } from 'lucide-react';

export default function Architecture() {
  const components = [
    {
      icon: Brain,
      title: 'Memory Kernel',
      description: 'Stores facts as weighted vectors (α). Decays irrelevant data over time using a hippocampal-inspired forgetting curve.',
      color: 'text-orange-400',
      bgColor: 'bg-orange-400/10',
      borderColor: 'border-orange-400/20',
    },
    {
      icon: Database,
      title: 'RCE (Retrieval & Compounding)',
      description: 'Fetches relevant context before every task. Compounds knowledge from past sessions to avoid redundant planning.',
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
      borderColor: 'border-blue-400/20',
    },
    {
      icon: Zap,
      title: 'Intent Classifier',
      description: 'Routes queries to the right system: Memory lookup, Antigravity execution, or pure Gemini reasoning.',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-400/10',
      borderColor: 'border-yellow-400/20',
    },
    {
      icon: Clock,
      title: 'Temporal Context',
      description: 'Tracks conversation continuity across sessions. Enables "remember what I told you yesterday" queries.',
      color: 'text-purple-400',
      bgColor: 'bg-purple-400/10',
      borderColor: 'border-purple-400/20',
    },
  ];

  return (
    <section id="architecture" className="relative py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-5xl md:text-6xl font-black mb-6">
            Architecture
          </h2>
          <p className="text-xl text-zinc-400 max-w-3xl mx-auto">
            A three-layer system that transforms Gemini 3 from a stateless model into a stateful reasoning engine.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {components.map((component, index) => {
            const Icon = component.icon;
            return (
              <div
                key={index}
                className="group relative bg-zinc-900 border border-white/10 rounded-xl p-8 hover:border-white/20 transition-all"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"></div>
                <div className="relative">
                  <div className={`inline-flex items-center justify-center w-12 h-12 ${component.bgColor} border ${component.borderColor} rounded-lg mb-4`}>
                    <Icon className={`w-6 h-6 ${component.color}`} />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{component.title}</h3>
                  <p className="text-zinc-400 leading-relaxed">{component.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-16 p-8 bg-zinc-900 border border-white/10 rounded-xl">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-2 h-2 bg-green-400 rounded-full mt-2"></div>
            <div>
              <h4 className="text-lg font-bold mb-2">Key Innovation: Decay Functions</h4>
              <p className="text-zinc-400">
                Unlike traditional RAG systems that treat all memories equally, ContextOS implements biologically-inspired decay algorithms.
                Recent, frequently-accessed memories stay strong (high α), while stale data fades naturally—preventing context pollution.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
