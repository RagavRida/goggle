import { Github } from 'lucide-react';

export default function Navigation() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 backdrop-blur-xl bg-black/50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="font-mono font-bold text-xl tracking-tight">
            Context<span className="text-gradient">OS</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <button
              onClick={() => scrollToSection('architecture')}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Architecture
            </button>
            <button
              onClick={() => scrollToSection('demo')}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Demo
            </button>
            <button
              onClick={() => scrollToSection('use-cases')}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Use Cases
            </button>
            <button
              onClick={() => scrollToSection('team')}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Team
            </button>
          </div>

          <a
            href="https://github.com/RagavRida"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 border border-white/20 rounded-lg text-sm font-medium hover:bg-white/5 transition-all"
          >
            <Github className="w-4 h-4" />
            View on GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
