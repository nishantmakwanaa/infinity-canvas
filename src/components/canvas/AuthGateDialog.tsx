import { Chrome } from 'lucide-react';

interface AuthGateDialogProps {
  mode: 'home' | 'share-edit';
  loading?: boolean;
  onSignIn: () => void;
}

export function AuthGateDialog({ mode, loading = false, onSignIn }: AuthGateDialogProps) {
  const isShareEdit = mode === 'share-edit';

  return (
    <div className="fixed inset-0 z-[120] bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md border border-border bg-card p-6 space-y-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-foreground flex items-center justify-center">
            <span className="text-background text-sm font-bold font-mono">C</span>
          </div>
          <div>
            <div className="text-base font-mono font-semibold text-foreground">CNVS</div>
            <div className="text-[11px] font-mono text-muted-foreground">Your second-brain canvas</div>
          </div>
        </div>

        <p className="text-xs font-mono text-muted-foreground">
          Infinite pages for notes, drawings, and live collaboration with your team.
        </p>

        <p className="text-xs font-mono text-foreground border border-border bg-card/70 px-3 py-2">
          {isShareEdit
            ? 'If you want to join and edit this shared canvas, you must log in first.'
            : 'Please log in to create, sync, and collaborate on your canvases.'}
        </p>

        <button
          className="h-10 w-full border border-border bg-foreground text-background text-xs font-mono inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60"
          onClick={onSignIn}
          disabled={loading}
        >
          <Chrome size={14} />
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
