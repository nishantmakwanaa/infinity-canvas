import { X } from 'lucide-react';

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-background/50" onClick={onClose} />
      <div className="relative z-10 w-96 border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold font-mono">Send feedback</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
        </div>
        <p className="text-xs font-mono text-muted-foreground mb-4">
          Have a bug, issue or idea for CNVS? Let us know!
        </p>
        <ul className="space-y-2 text-xs font-mono">
          <li>
            •{' '}
            <a href="https://nishantmakwana.tech" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:opacity-70">
              DM me on my portfolio
            </a>
          </li>
          <li>
            •{' '}
            <a href="https://github.com/nishantmakwana/infinity-canvas/issues" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:opacity-70">
              Submit an issue on GitHub
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
