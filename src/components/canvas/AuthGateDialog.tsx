import { Chrome } from 'lucide-react';

interface AuthGateDialogProps {
  mode: 'home' | 'share' | 'share-edit';
  loading?: boolean;
  onSignIn: () => void;
  presentation?: 'fullscreen' | 'overlay';
  onClose?: () => void;
  dismissOnBackdrop?: boolean;
}

export function AuthGateDialog({
  mode,
  loading = false,
  onSignIn,
  presentation = 'fullscreen',
  onClose,
  dismissOnBackdrop = false,
}: AuthGateDialogProps) {
  const isShareEdit = mode === 'share-edit';
  const isShare = mode === 'share';
  const isOverlay = presentation === 'overlay';

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center px-4 ${isOverlay ? 'bg-background/35 backdrop-blur-[1px]' : 'bg-background'}`}
      onClick={(event) => {
        if (!dismissOnBackdrop) return;
        if (event.target !== event.currentTarget) return;
        onClose?.();
      }}
    >
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
            : isShare
              ? 'Sign in to share and collaborate on this canvas with your team.'
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
