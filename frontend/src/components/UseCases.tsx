import { Code2, Briefcase, GraduationCap, MessageSquare } from 'lucide-react';

export default function UseCases() {
  const cases = [
    {
      icon: Code2,
      title: 'Software Engineering',
      example: '"Deploy using the same config as last week"',
      benefit: 'No need to re-specify preferences every time.',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: Briefcase,
      title: 'Personal Assistance',
      example: '"Book a table at that Italian place I liked"',
      benefit: 'Remembers past choices and preferences.',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: GraduationCap,
      title: 'Research & Learning',
      example: '"Summarize what we discussed about quantum computing"',
      benefit: 'Builds a knowledge graph over time.',
      color: 'from-orange-500 to-red-500',
    },
    {
      icon: MessageSquare,
      title: 'Long-Running Projects',
      example: '"Continue the marketing campaign from Monday"',
      benefit: 'Picks up context across sessions.',
      color: 'from-green-500 to-emerald-500',
    },
  ];

  return (
    <section id="use-cases" className="relative py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-5xl md:text-6xl font-black mb-6">
            Use Cases
          </h2>
          <p className="text-xl text-zinc-400 max-w-3xl mx-auto">
            From coding assistants to personal AI—ContextOS unlocks continuity for any agentic workflow.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {cases.map((useCase, index) => {
            const Icon = useCase.icon;
            return (
              <div
                key={index}
                className="group relative bg-zinc-900 border border-white/10 rounded-xl p-8 hover:border-white/20 transition-all overflow-hidden"
              >
                <div className={`absolute -top-24 -right-24 w-48 h-48 bg-gradient-to-br ${useCase.color} opacity-10 blur-3xl group-hover:opacity-20 transition-opacity`}></div>
                <div className="relative">
                  <Icon className="w-10 h-10 text-white mb-4" />
                  <h3 className="text-2xl font-bold mb-3">{useCase.title}</h3>
                  <div className="mb-4 p-4 bg-black/50 border border-white/10 rounded-lg font-mono text-sm text-zinc-300">
                    {useCase.example}
                  </div>
                  <p className="text-zinc-400">{useCase.benefit}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
