import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useThemeTime } from '@/hooks/useThemeTime';

export default function Manual() {
  useThemeTime();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-foreground flex items-center justify-center">
              <span className="text-background text-[10px] font-bold font-mono">C</span>
            </div>
            <span className="text-sm font-semibold tracking-tight font-mono">CNVS</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold font-mono mb-8">User Manual</h1>

        <section className="mb-10">
          <h2 className="text-xl font-semibold font-mono mb-3">Introduction</h2>
          <p className="text-sm text-muted-foreground leading-relaxed font-mono">
            Welcome to the CNVS user manual. Here you can learn about using CNVS, find answers to questions, and refer to our legal documents.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed font-mono mt-2">
            Visit{' '}
            <a href="https://canvas.nishantmakwana.tech" className="text-foreground underline" target="_blank" rel="noopener noreferrer">
              canvas.nishantmakwana.tech
            </a>{' '}
            to start using CNVS.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold font-mono mb-3">Guides</h2>
          <ul className="space-y-2 text-sm font-mono text-muted-foreground">
            <li className="border-b border-border pb-2">Files</li>
            <li className="border-b border-border pb-2">Sharing</li>
            <li className="border-b border-border pb-2">Publishing</li>
            <li className="border-b border-border pb-2">Troubleshooting</li>
            <li>FAQ</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold font-mono mb-3">Documents</h2>
          <ul className="space-y-2 text-sm font-mono text-muted-foreground">
            <li>Legal summary</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold font-mono mb-3">Links</h2>
          <p className="text-sm text-muted-foreground font-mono mb-3">Connect with Nishant on:</p>
          <ul className="space-y-2 text-sm font-mono">
            <li>
              <a href="https://nishantmakwana.tech" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:opacity-70">
                Portfolio
              </a>
            </li>
            <li>
              <a href="https://github.com/nishantmakwana" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:opacity-70">
                GitHub
              </a>
            </li>
            <li>
              <a href="https://x.com/nishantmakwana" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:opacity-70">
                Twitter/X
              </a>
            </li>
            <li>
              <a href="https://linkedin.com/in/nishantmakwana" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:opacity-70">
                LinkedIn
              </a>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
