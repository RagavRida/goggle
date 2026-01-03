import { Award, Github, Linkedin } from 'lucide-react';

export default function Team() {
  return (
    <section id="team" className="relative py-32 px-6 bg-zinc-900/50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-5xl md:text-6xl font-black mb-6">
            Built for Gemini 3 Hackathon
          </h2>
          <p className="text-xl text-zinc-400 max-w-3xl mx-auto">
            A submission that bridges the gap between stateless LLMs and stateful, intelligent agents.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="bg-zinc-900 border border-white/10 rounded-xl p-8 mb-8">
            <div className="flex items-start gap-6">
              <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center text-2xl font-black">
                CO
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-2">The ContextOS Team</h3>
                <p className="text-zinc-400 mb-4">
                  A passionate team of AI researchers and engineers dedicated to solving the memory problem in agentic systems.
                </p>
                <div className="flex gap-3">
                  <a
                    href="https://github.com/RagavRida"
                    className="flex items-center gap-2 px-4 py-2 bg-black border border-white/10 rounded-lg text-sm hover:bg-white/5 transition-all"
                  >
                    <Github className="w-4 h-4" />
                    GitHub
                  </a>
                  <a
                    href="https://www.linkedin.com/in/raghavendra-manchikatla-79b12624b/"
                    className="flex items-center gap-2 px-4 py-2 bg-black border border-white/10 rounded-lg text-sm hover:bg-white/5 transition-all"
                  >
                    <Linkedin className="w-4 h-4" />
                    LinkedIn
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 bg-black/50 border border-white/10 rounded-lg text-center">
              <Award className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
              <div className="text-sm font-semibold text-zinc-300">Innovation Award</div>
              <div className="text-xs text-zinc-500 mt-1">Target Category</div>
            </div>
            <div className="p-6 bg-black/50 border border-white/10 rounded-lg text-center">
              <div className="text-2xl font-black text-gradient mb-2">2025</div>
              <div className="text-sm text-zinc-400">Gemini 3 Hackathon</div>
            </div>
            <div className="p-6 bg-black/50 border border-white/10 rounded-lg text-center">
              <div className="text-2xl font-black text-gradient mb-2">MIT</div>
              <div className="text-sm text-zinc-400">Open Source</div>
            </div>
          </div>
        </div>

        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg font-semibold">
            <Award className="w-5 h-5" />
            Gemini 3 Hackathon Submission
          </div>
        </div>
      </div>
    </section>
  );
}
