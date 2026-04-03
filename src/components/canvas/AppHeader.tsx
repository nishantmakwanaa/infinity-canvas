import { LogOut, Share2, User as UserIcon, Download, Puzzle, MoreVertical, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportCanvasAsCnvs, exportCanvasAsPng, exportCanvasAsSvg } from '@/lib/export';
import { AppMenu } from './AppMenu';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { FeedbackDialog } from './FeedbackDialog';
import { useIsMobile } from '@/hooks/use-mobile';

interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
}

interface AppHeaderProps {
  user: AuthUser | null;
  loading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  currentCanvasId?: string | null;
  currentCanvasName?: string | null;
  leftOffsetPercent?: number;
  showSidebarToggle?: boolean;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export function AppHeader({
  user,
  loading,
  onSignIn,
  onSignOut,
  currentCanvasId,
  currentCanvasName,
  leftOffsetPercent = 0,
  showSidebarToggle = false,
  isSidebarOpen = true,
  onToggleSidebar,
}: AppHeaderProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const isMobile = useIsMobile();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  const handleShare = async () => {
    if (!user) return;
    setSharing(true);
    try {
      const canvas = currentCanvasId
        ? { id: currentCanvasId }
        : (await supabase
          .from('canvases')
          .select('id')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single()).data;

      if (!canvas) { toast.error('No canvas found'); setSharing(false); return; }

      const { data: existing } = await supabase
        .from('shared_canvases')
        .select('share_token')
        .eq('canvas_id', canvas.id)
        .limit(1)
        .single();

      let token: string;
      if (existing) { token = existing.share_token; }
      else {
        const { data: newShare } = await supabase
          .from('shared_canvases')
          .insert({ canvas_id: canvas.id })
          .select('share_token')
          .single();
        token = newShare?.share_token || '';
      }

      const shareUrl = `${window.location.origin}/view/${token}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied!');
    } catch { toast.error('Failed to share'); }
    setSharing(false);
  };

  useEffect(() => {
    if (!showMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuButtonRef.current?.contains(target)) return;
      if (menuPanelRef.current?.contains(target)) return;
      setShowMenu(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [showMenu]);

  return (
    <>
      <header
        className="fixed top-0 right-0 z-50 h-14 border-b border-border bg-card/95 backdrop-blur-sm flex items-center justify-between px-4"
        style={{ left: `${leftOffsetPercent}%` }}
      >
        <div className="flex items-center gap-2">
          {showSidebarToggle && (
            <button
              onClick={onToggleSidebar}
              className="toolbar-btn w-8 h-8"
              title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {isSidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            </button>
          )}
          <div className="w-7 h-7 bg-foreground flex items-center justify-center">
            <span className="text-background text-xs font-bold font-mono">C</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground font-mono">CNVS</span>
          <div className="relative" ref={menuPanelRef}>
            <button ref={menuButtonRef} onClick={() => setShowMenu(!showMenu)} className="toolbar-btn w-7 h-7">
              <MoreVertical size={14} />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <AppMenu
                  onClose={() => setShowMenu(false)}
                  isLoggedIn={Boolean(user)}
                  isMobile={isMobile}
                  onOpenShortcuts={() => setShowShortcutsDialog(true)}
                  onOpenFeedback={() => setShowFeedbackDialog(true)}
                />
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
        {/* Extension button */}
        <button
          onClick={() => toast.info('Browser extension coming soon!')}
          className="toolbar-btn"
          title="Add extension"
        >
          <Puzzle size={14} />
        </button>

        {user ? (
          <button onClick={handleShare} disabled={sharing} className="toolbar-btn" title="Share canvas">
            <Share2 size={14} />
          </button>
        ) : (
          <div className="relative">
            <button onClick={() => setShowExport(!showExport)} className="toolbar-btn" title="Export">
              <Download size={14} />
            </button>
            {showExport && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />
                <div className="absolute right-0 top-11 z-50 w-32 border border-border bg-card">
                  <button onClick={() => { exportCanvasAsPng(); setShowExport(false); }} className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-accent">PNG</button>
                  <button onClick={() => { exportCanvasAsSvg(); setShowExport(false); }} className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-accent">SVG</button>
                  <button onClick={() => { exportCanvasAsCnvs(); setShowExport(false); }} className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-accent">CNVS</button>
                </div>
              </>
            )}
          </div>
        )}

        {loading ? null : !user ? (
          <button onClick={onSignIn} className="h-9 px-4 border border-border bg-foreground text-background text-xs font-mono hover:opacity-90 transition-opacity">
            Sign in to share
          </button>
        ) : (
          <div className="relative">
            <button onClick={() => setShowProfile(!showProfile)} className="w-9 h-9 border border-border bg-card overflow-hidden flex items-center justify-center">
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" /> : <UserIcon size={16} className="text-foreground" />}
            </button>
            {showProfile && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
                <div className="absolute right-0 top-11 z-50 w-56 border border-border bg-card p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-8 h-8 object-cover" /> : <div className="w-8 h-8 bg-muted flex items-center justify-center"><UserIcon size={14} /></div>}
                    <span className="text-xs font-mono text-foreground truncate">{user.username}</span>
                  </div>
                  <button onClick={() => { setShowProfile(false); onSignOut(); }} className="flex items-center gap-2 w-full text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
                    <LogOut size={12} /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        </div>
      </header>

      {showShortcutsDialog && <KeyboardShortcutsDialog onClose={() => setShowShortcutsDialog(false)} />}
      {showFeedbackDialog && <FeedbackDialog onClose={() => setShowFeedbackDialog(false)} />}
    </>
  );
}
