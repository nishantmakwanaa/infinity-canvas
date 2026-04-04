import { MoreVertical, PanelLeftClose, PanelLeftOpen, Share2, ChevronDown, Users, Eye, EyeOff, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AppMenu } from './AppMenu';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { parseCanvasRouteName } from '@/lib/canvasNaming';
import { toEditSharePagePath, toOwnerPagePath, toPageApiUrl, toSharePagePath } from '@/lib/pageApi';

interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface AppHeaderProps {
  user: AuthUser | null;
  loading: boolean;
  onSignIn: () => void;
  readOnlyMode?: boolean;
  forceShowCollaboratorsButton?: boolean;
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
  onRenameCanvas?: (nextName: string) => Promise<boolean>;
  onRenamePage?: (nextName: string) => Promise<boolean>;
  collaborators?: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    activeTool: string | null;
    isVisible: boolean;
    color: string;
    isSelf?: boolean;
  }[];
  collaborationConnected?: boolean;
  collaborationActiveCount?: number;
  collaborationLimitCount?: number;
  onToggleCollaboratorVisibility?: (userId: string) => void;
}

function slugifyUsername(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

export function AppHeader({
  user,
  loading,
  onSignIn,
  readOnlyMode = false,
  forceShowCollaboratorsButton = false,
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
  onRenameCanvas,
  onRenamePage,
  collaborators = [],
  collaborationConnected = false,
  collaborationActiveCount = 0,
  collaborationLimitCount = 20,
  onToggleCollaboratorVisibility,
}: AppHeaderProps) {
  const [sharing, setSharing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showCollaboratorMenu, setShowCollaboratorMenu] = useState(false);
  const [shareAccessLevel, setShareAccessLevel] = useState<'viewer' | 'editor'>('viewer');
  const [isPublished, setIsPublished] = useState(false);
  const [showPageMenu, setShowPageMenu] = useState(false);
  const [editingCanvasName, setEditingCanvasName] = useState(false);
  const [editingPageName, setEditingPageName] = useState(false);
  const [canvasNameDraft, setCanvasNameDraft] = useState('');
  const [pageNameDraft, setPageNameDraft] = useState('');
  const [renamingCanvas, setRenamingCanvas] = useState(false);
  const [renamingPage, setRenamingPage] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const isMobile = useIsMobile();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const sharePanelRef = useRef<HTMLDivElement>(null);
  const shareMenuContentRef = useRef<HTMLDivElement>(null);
  const collabButtonRef = useRef<HTMLButtonElement>(null);
  const collabPanelRef = useRef<HTMLDivElement>(null);
  const collabMenuContentRef = useRef<HTMLDivElement>(null);
  const headerCanvasName = (currentCanvasLabel || '').trim() || 'Untitled Canvas';
  const headerPageName = (currentPageLabel || '').trim() || 'Page 1';
  const isGuestUser = !user;
  const shouldShowCollaborators = Boolean(
    user && onToggleCollaboratorVisibility && !readOnlyMode && forceShowCollaboratorsButton
  );

  const resolveShareContext = async () => {
    if (!user) return null;
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
    const ownerRouteName = `${parsed.canvasSlug}/${parsed.pageSlug}`;
    const fallbackOwnerPath = toOwnerPagePath(routeOwner, ownerRouteName, user.id);

    return {
      canvasId: canvas.id,
      routeOwner,
      parsed,
      fallbackOwnerPath,
    };
  };

  const publishCanvas = async (accessLevel: 'viewer' | 'editor') => {
    if (!user) return null;
    setSharing(true);
    try {
      const context = await resolveShareContext();
      if (!context) return null;

      let upsertedShare: any = null;
      const rpc = await (supabase as any).rpc('upsert_canvas_share', {
        p_canvas_id: context.canvasId,
        p_access_level: accessLevel,
      });

      if (rpc?.data) {
        upsertedShare = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      }

      if (!upsertedShare?.share_token) {
        const fallback = await supabase
          .from('shared_canvases')
          .upsert(
            {
              canvas_id: context.canvasId,
              owner_username: context.routeOwner,
              canvas_name: context.parsed.canvasSlug,
              page_name: context.parsed.pageSlug,
              access_level: accessLevel,
            } as any,
            { onConflict: 'canvas_id' }
          )
          .select('share_token,access_level')
          .single();
        upsertedShare = fallback.data as any;
      }

      const shareToken = (upsertedShare as any)?.share_token;
      if (!shareToken) {
        toast.error('Failed to publish share link');
        return null;
      }

      const resolvedAccess = ((upsertedShare as any)?.access_level as 'viewer' | 'editor' | undefined) || accessLevel;
      const nextViewShareUrl = toPageApiUrl(toSharePagePath(context.routeOwner, shareToken, user.id));
      const nextEditShareUrl = toPageApiUrl(toEditSharePagePath(context.routeOwner, shareToken, user.id));
      const nextShareUrl = resolvedAccess === 'editor' ? nextEditShareUrl : nextViewShareUrl;

      setShareAccessLevel(resolvedAccess);
      setShareUrl(nextShareUrl);
      setIsPublished(true);
      return nextShareUrl;
    } catch {
      toast.error('Failed to publish');
      return null;
    } finally {
      setSharing(false);
    }
  };

  const unpublishCanvas = async () => {
    if (!user) return false;
    setSharing(true);
    try {
      const context = await resolveShareContext();
      if (!context) return false;

      const { error } = await supabase
        .from('shared_canvases')
        .delete()
        .eq('canvas_id', context.canvasId);

      if (error) {
        toast.error('Failed to unpublish');
        return false;
      }

      setIsPublished(false);
      setShareUrl('');
      toast.success('Unpublished');
      return true;
    } finally {
      setSharing(false);
    }
  };

  const loadShareState = async () => {
    if (!user) return;
    const context = await resolveShareContext();
    if (!context) return;

    const { data } = await supabase
      .from('shared_canvases')
      .select('share_token,access_level')
      .eq('canvas_id', context.canvasId)
      .maybeSingle();

    if (!data?.share_token) {
      setIsPublished(false);
      setShareUrl('');
      setShareAccessLevel('viewer');
      return;
    }

    const resolvedAccess = (((data as any).access_level as 'viewer' | 'editor') || 'viewer');
    const nextViewShareUrl = toPageApiUrl(toSharePagePath(context.routeOwner, (data as any).share_token, user.id));
    const nextEditShareUrl = toPageApiUrl(toEditSharePagePath(context.routeOwner, (data as any).share_token, user.id));
    const nextShareUrl = resolvedAccess === 'editor' ? nextEditShareUrl : nextViewShareUrl;
    setShareAccessLevel(resolvedAccess);
    setIsPublished(true);
    setShareUrl(nextShareUrl);
  };

  const handleCopyShareLink = async () => {
    if (!isPublished || !shareUrl) {
      toast.info('Publish first to copy the public link');
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    toast.success('Share link copied!');
  };

  const handlePublishToggle = async () => {
    if (isPublished) {
      await unpublishCanvas();
      return;
    }
    const nextShareUrl = await publishCanvas(shareAccessLevel);
    if (!nextShareUrl) return;
    toast.success(shareAccessLevel === 'editor' ? 'Published as editor access' : 'Published as viewer access');
  };

  const handleShareAccessChange = async (nextAccess: 'viewer' | 'editor') => {
    setShareAccessLevel(nextAccess);
    if (!isPublished) return;
    const nextShareUrl = await publishCanvas(nextAccess);
    if (!nextShareUrl) return;
    toast.success(nextAccess === 'editor' ? 'Permission updated to editor' : 'Permission updated to viewer');
  };

  const emitShareMenuVisibility = useCallback((open: boolean) => {
    if (typeof window === 'undefined') return;
    const rect = shareMenuContentRef.current?.getBoundingClientRect();
    window.dispatchEvent(
      new CustomEvent('cnvs-share-menu-visibility', {
        detail: {
          open,
          bottom: rect ? rect.bottom : null,
        },
      })
    );
  }, []);

  const emitCollaboratorMenuVisibility = useCallback((open: boolean) => {
    if (typeof window === 'undefined') return;
    const rect = collabMenuContentRef.current?.getBoundingClientRect();
    window.dispatchEvent(
      new CustomEvent('cnvs-collaborator-menu-visibility', {
        detail: {
          open,
          bottom: rect ? rect.bottom : null,
        },
      })
    );
  }, []);

  const startCanvasRename = () => {
    if (!onRenameCanvas || renamingCanvas) return;
    setCanvasNameDraft(headerCanvasName);
    setEditingCanvasName(true);
  };

  const submitCanvasRename = async () => {
    if (!onRenameCanvas) return;
    const next = canvasNameDraft.trim();
    setEditingCanvasName(false);
    if (!next || next === headerCanvasName) return;
    setRenamingCanvas(true);
    await onRenameCanvas(next);
    setRenamingCanvas(false);
  };

  const startPageRename = () => {
    if (!onRenamePage || renamingPage) return;
    setPageNameDraft(headerPageName);
    setEditingPageName(true);
    setShowPageMenu(false);
  };

  const submitPageRename = async () => {
    if (!onRenamePage) return;
    const next = pageNameDraft.trim();
    setEditingPageName(false);
    if (!next || next === headerPageName) return;
    setRenamingPage(true);
    await onRenamePage(next);
    setRenamingPage(false);
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

  useEffect(() => {
    if (!showShareMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (shareButtonRef.current?.contains(target)) return;
      if (sharePanelRef.current?.contains(target)) return;
      setShowShareMenu(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [showShareMenu]);

  useEffect(() => {
    if (!showShareMenu) {
      emitShareMenuVisibility(false);
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      emitShareMenuVisibility(true);
    });

    const onResize = () => emitShareMenuVisibility(true);
    window.addEventListener('resize', onResize);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      emitShareMenuVisibility(false);
    };
  }, [emitShareMenuVisibility, showShareMenu]);

  useEffect(() => {
    if (!showCollaboratorMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (collabButtonRef.current?.contains(target)) return;
      if (collabPanelRef.current?.contains(target)) return;
      setShowCollaboratorMenu(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [showCollaboratorMenu]);

  useEffect(() => {
    if (!showCollaboratorMenu) {
      emitCollaboratorMenuVisibility(false);
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      emitCollaboratorMenuVisibility(true);
    });

    const onResize = () => emitCollaboratorMenuVisibility(true);
    window.addEventListener('resize', onResize);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      emitCollaboratorMenuVisibility(false);
    };
  }, [emitCollaboratorMenuVisibility, showCollaboratorMenu]);

  useEffect(() => {
    const onOpenShortcuts = () => setShowShortcutsDialog(true);
    window.addEventListener('cnvs-open-shortcuts', onOpenShortcuts);
    return () => {
      window.removeEventListener('cnvs-open-shortcuts', onOpenShortcuts);
    };
  }, []);

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
          {isGuestUser ? (
            <div className="flex items-center gap-2 select-none">
              <div className="w-7 h-7 bg-foreground flex items-center justify-center">
                <span className="text-background text-xs font-bold font-mono">C</span>
              </div>
              <span className="text-sm font-semibold tracking-tight text-foreground font-mono">CNVS</span>
            </div>
          ) : (
            <>
              {editingCanvasName ? (
                <input
                  autoFocus
                  className="h-8 px-2 border border-border bg-card text-sm font-mono text-foreground min-w-[140px] max-w-[40vw]"
                  value={canvasNameDraft}
                  onChange={(e) => setCanvasNameDraft(e.target.value)}
                  onBlur={() => { void submitCanvasRename(); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submitCanvasRename();
                    }
                    if (e.key === 'Escape') {
                      setEditingCanvasName(false);
                      setCanvasNameDraft(headerCanvasName);
                    }
                  }}
                />
              ) : (
                <button
                  className="max-w-[40vw] truncate text-sm font-semibold tracking-tight text-foreground font-mono hover:text-primary disabled:opacity-60"
                  onClick={startCanvasRename}
                  disabled={!onRenameCanvas || renamingCanvas}
                  title="Rename canvas"
                >
                  {headerCanvasName}
                </button>
              )}
              <div className="relative">
                <div className="flex items-center">
                  {editingPageName ? (
                    <input
                      autoFocus
                      className="h-7 px-2 border border-border bg-card text-[11px] font-mono text-foreground min-w-[110px]"
                      value={pageNameDraft}
                      onChange={(e) => setPageNameDraft(e.target.value)}
                      onBlur={() => { void submitPageRename(); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void submitPageRename();
                        }
                        if (e.key === 'Escape') {
                          setEditingPageName(false);
                          setPageNameDraft(headerPageName);
                        }
                      }}
                    />
                  ) : (
                    <button
                      className="h-7 px-2 border border-border bg-card text-[11px] font-mono hover:bg-accent disabled:opacity-60"
                      onClick={startPageRename}
                      disabled={!onRenamePage || renamingPage}
                      title="Rename page"
                    >
                      / {headerPageName}
                    </button>
                  )}
                  <button
                    className="h-7 w-7 border border-l-0 border-border bg-card inline-flex items-center justify-center hover:bg-accent"
                    onClick={() => setShowPageMenu((prev) => !prev)}
                    title="Select page"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
                {showPageMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowPageMenu(false)} />
                    <div className="absolute left-0 top-9 z-50 w-44 border border-border bg-card p-1 shadow-lg">
                      {onCreatePage && !readOnlyMode && (
                        <>
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
                        </>
                      )}
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
            </>
          )}
          <div className="relative" ref={menuPanelRef}>
            <button ref={menuButtonRef} onClick={() => setShowMenu(!showMenu)} className="toolbar-btn w-7 h-7">
              <MoreVertical size={14} />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <AppMenu
                  onClose={() => setShowMenu(false)}
                  isMobile={isMobile}
                  onOpenShortcuts={() => setShowShortcutsDialog(true)}
                  onOpenExtension={() => toast.info('Browser extension coming soon!')}
                />
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
        {user && shouldShowCollaborators && (
          <div className="relative" ref={collabPanelRef}>
            <button
              ref={collabButtonRef}
              onClick={() => {
                setShowShareMenu(false);
                setShowCollaboratorMenu((prev) => !prev);
              }}
              className="toolbar-btn relative"
              title="Active collaborators"
            >
              <Users size={14} />
              {collaborators.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-foreground text-background text-[9px] font-mono inline-flex items-center justify-center">
                  {collaborators.length}
                </span>
              )}
            </button>
            {showCollaboratorMenu && (
              <div ref={collabMenuContentRef} className="absolute right-0 top-10 z-50 w-72 border border-border bg-card p-2 shadow-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-foreground">Active editors</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                    {collaborationConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
                    <span>{Math.max(collaborationActiveCount, collaborators.length)}/{collaborationLimitCount}</span>
                  </span>
                </div>
                {collaborators.length === 0 ? (
                  <div className="text-[10px] font-mono text-muted-foreground border border-border p-2">
                    No active editors right now.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar">
                    {collaborators.map((collab) => (
                      <div key={collab.userId} className="flex items-center justify-between border border-border px-2 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {collab.avatarUrl ? (
                            <img src={collab.avatarUrl} alt="" className="w-6 h-6 object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div
                              className="w-6 h-6 text-[10px] font-mono text-white flex items-center justify-center"
                              style={{ backgroundColor: collab.color }}
                            >
                              {(collab.displayName || 'U').slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-[11px] font-mono text-foreground truncate">{collab.displayName}{collab.isSelf ? ' (You)' : ''}</div>
                            <div className="text-[10px] font-mono text-muted-foreground truncate">
                              {collab.activeTool ? `Tool: ${collab.activeTool}` : 'Browsing'}
                            </div>
                          </div>
                        </div>
                        <button
                          className="toolbar-btn w-7 h-7"
                          title={collab.isVisible ? 'Hide this user changes' : 'Show this user changes'}
                          onClick={() => onToggleCollaboratorVisibility?.(collab.userId)}
                        >
                          {collab.isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {user && (
          <div className="relative" ref={sharePanelRef}>
            <button
              ref={shareButtonRef}
              onClick={() => {
                setShowCollaboratorMenu(false);
                setShowMenu(false);
                setShowShareMenu((prev) => {
                  const next = !prev;
                  if (next) {
                    void loadShareState();
                  }
                  return next;
                });
              }}
              disabled={sharing}
              className="toolbar-btn"
              title="Share canvas"
            >
              <Share2 size={14} />
            </button>
            {showShareMenu && (
              <div ref={shareMenuContentRef} className="absolute top-10 right-0 z-50 w-72 border border-border bg-card p-3 shadow-lg space-y-3">
                <div className="space-y-1">
                  <div className="text-[11px] font-mono text-foreground">Share canvas</div>
                  <div className="text-[10px] font-mono text-muted-foreground">Publish to make this page public. Unpublish hides it from public links.</div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-mono text-muted-foreground">Permission</label>
                  <select
                    className="h-8 w-full border border-border bg-card px-2 text-[11px] font-mono"
                    value={shareAccessLevel}
                    onChange={(e) => {
                      void handleShareAccessChange((e.target.value as 'viewer' | 'editor') || 'viewer');
                    }}
                  >
                    <option value="viewer">Anyone can view</option>
                    <option value="editor">Anyone can edit</option>
                  </select>
                </div>

                <div className="border border-border p-2 bg-card flex items-center justify-center min-h-[138px]">
                  {shareUrl ? (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}`}
                      alt="Canvas share QR code"
                      className="w-32 h-32"
                    />
                  ) : (
                    <div className="text-[10px] font-mono text-muted-foreground">Publish to generate QR code</div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button className="h-8 border border-border text-[11px] font-mono hover:bg-accent" onClick={handlePublishToggle} disabled={sharing}>
                    {isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                  <button className="h-8 border border-border text-[11px] font-mono hover:bg-accent" onClick={handleCopyShareLink} disabled={sharing || !isPublished || !shareUrl}>
                    Copy link
                  </button>
                </div>
                {shareUrl && (
                  <div className="border border-border p-2 text-[10px] font-mono text-muted-foreground break-all">{shareUrl}</div>
                )}
              </div>
            )}
          </div>
        )}

        {loading ? null : !user ? (
          <button onClick={onSignIn} className="h-9 px-4 border border-border bg-foreground text-background text-xs font-mono hover:opacity-90 transition-opacity">
            Sign in to share
          </button>
        ) : null}
        </div>
      </header>

      {showShortcutsDialog && <KeyboardShortcutsDialog onClose={() => setShowShortcutsDialog(false)} />}
    </>
  );
}
