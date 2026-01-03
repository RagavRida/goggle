import { Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="relative border-t border-white/10 bg-black py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="font-mono font-bold text-lg">
            Context<span className="text-gradient">OS</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>Built with</span>
            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            <span>for the Gemini 3 Hackathon</span>
          </div>

          <div className="text-sm text-zinc-500">
            © 2024 ContextOS Team
          </div>
        </div>
      </div>
    </footer>
  );
}
