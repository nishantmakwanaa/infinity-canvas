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
            <div className="w-8 h-8 bg-foreground flex items-center justify-center">
              <span className="text-background text-lg leading-none font-bold font-mono">C</span>
            </div>
            <span className="text-base font-semibold tracking-tight font-mono">CNVS</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold font-mono mb-8">User Manual</h1>

        <section className="mb-10">
          <h2 className="text-xl font-semibold font-mono mb-3">Introduction</h2>
          <p className="text-sm text-muted-foreground leading-relaxed font-mono">
            Welcome to the CNVS user manual. Learn how to use the product, review policies, and find official project resources.
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
            <li className="border-b border-border pb-2">Coming soon</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold font-mono mb-3">Documents</h2>
          <ul className="space-y-2 text-sm font-mono text-muted-foreground">
            <li className="leading-relaxed">
              Legal summary: CNVS and its source code are Copyright 2026 Nishant Makwana. All Rights Reserved. See the LICENSE file in the repository root for full terms.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold font-mono mb-3">Links</h2>
          <p className="text-sm text-muted-foreground font-mono mb-3">Connect with Nishant on:</p>
          <ul className="space-y-2 text-sm font-mono">
            <li>
              <a href="https://github.com/nishantmakwanaa" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:opacity-70">
                GitHub
              </a>
            </li>
            <li>
              <a href="https://x.com/wordsofnishant" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:opacity-70">
                Twitter/X
              </a>
            </li>
            <li>
              <a href="https://linkedin.com/in/nishantmakwanaa" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:opacity-70">
                LinkedIn
              </a>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
