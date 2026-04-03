import { LogOut, User as UserIcon, Download, MoreVertical, PanelLeftClose, PanelLeftOpen, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportCanvasAsCnvs, exportCanvasAsPng, exportCanvasAsSvg } from '@/lib/export';
import { AppMenu } from './AppMenu';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { FeedbackDialog } from './FeedbackDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { parseCanvasRouteName } from '@/lib/canvasNaming';

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
  currentCanvasLabel?: string | null;
  currentPageLabel?: string | null;
  pageItems?: { id: string; label: string }[];
  onSelectPage?: (canvasId: string) => void;
  onCreatePage?: () => void;
}

function slugifyUsername(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
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
  currentCanvasLabel,
  currentPageLabel,
  pageItems = [],
  onSelectPage,
  onCreatePage,
}: AppHeaderProps) {
  const [showProfile, setShowProfile] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showPageMenu, setShowPageMenu] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const isMobile = useIsMobile();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const headerCanvasName = (currentCanvasLabel || '').trim() || 'Untitled Canvas';
  const headerPageName = (currentPageLabel || '').trim() || 'Page 1';

  const getShareUrl = async () => {
    if (!user) return null;
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

      if (!canvas) {
        toast.error('No canvas found');
        return null;
      }

      let routeCanvasName = (currentCanvasName || '').trim();
      if (!routeCanvasName) {
        const { data: canvasRow } = await supabase
          .from('canvases')
          .select('name')
          .eq('id', canvas.id)
          .maybeSingle();
        routeCanvasName = ((canvasRow as any)?.name || '').trim();
      }
      const routeOwner = slugifyUsername(user.username);
      const parsed = parseCanvasRouteName(routeCanvasName);

      const { data: upsertedShare } = await supabase
        .from('shared_canvases')
        .upsert(
          {
            canvas_id: canvas.id,
            owner_username: routeOwner,
            canvas_name: parsed.canvasSlug,
            page_name: parsed.pageSlug,
          } as any,
          { onConflict: 'canvas_id' }
        )
        .select('share_token,owner_username,canvas_name,page_name')
        .single();

      const shareToken = (upsertedShare as any)?.share_token;
      const nextShareUrl = routeOwner && parsed.canvasSlug
        ? `${window.location.origin}/${encodeURIComponent(routeOwner)}/view/${encodeURIComponent(parsed.canvasSlug)}/${encodeURIComponent(parsed.pageSlug)}`
        : `${window.location.origin}/view/${shareToken}`;

      setShareUrl(nextShareUrl);
      return nextShareUrl;
    } catch {
      toast.error('Failed to share');
      return null;
    } finally {
      setSharing(false);
    }
  };

  const handleCopyShareLink = async () => {
    const nextShareUrl = await getShareUrl();
    if (!nextShareUrl) return;
    await navigator.clipboard.writeText(nextShareUrl);
    toast.success('Share link copied!');
  };

  const handleOpenQrShare = async () => {
    const nextShareUrl = await getShareUrl();
    if (!nextShareUrl) return;
    setShowQrDialog(true);
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
        className="fixed top-0 right-0 z-50 h-14 flex items-center justify-between px-4"
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
          <span className="max-w-[40vw] truncate text-sm font-semibold tracking-tight text-foreground font-mono">
            {headerCanvasName}
          </span>
          <div className="relative">
            <button
              className="h-7 px-2 border border-border bg-card text-[11px] font-mono hover:bg-accent"
              onClick={() => setShowPageMenu((prev) => !prev)}
              title="Select page"
            >
              / {headerPageName.toLowerCase()}
            </button>
            {showPageMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowPageMenu(false)} />
                <div className="absolute left-0 top-9 z-50 w-44 border border-border bg-card p-1 shadow-lg">
                  <button
                    className="w-full text-left px-2 py-1.5 text-xs font-mono hover:bg-accent"
                    onClick={() => {
                      setShowPageMenu(false);
                      onCreatePage?.();
                    }}
                  >
                    + Add new page
                  </button>
                  <div className="my-1 h-px bg-border" />
                  {pageItems.map((item) => (
                    <button
                      key={item.id}
                      className="w-full text-left px-2 py-1.5 text-xs font-mono hover:bg-accent"
                      onClick={() => {
                        setShowPageMenu(false);
                        onSelectPage?.(item.id);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
                  onOpenExtension={() => toast.info('Browser extension coming soon!')}
                />
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
        {user ? (
          <button onClick={handleOpenQrShare} disabled={sharing} className="toolbar-btn" title="Share canvas">
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
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="max-w-sm" data-no-translate="true">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono">Share Canvas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="border border-border p-2 bg-card flex items-center justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}`}
                alt="Canvas share QR code"
                className="w-48 h-48"
              />
            </div>
            <div className="text-[11px] font-mono text-muted-foreground break-all border border-border p-2">
              {shareUrl}
            </div>
            <button
              className="h-9 w-full border border-border text-xs font-mono hover:bg-accent"
              onClick={handleCopyShareLink}
            >
              Copy link
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
