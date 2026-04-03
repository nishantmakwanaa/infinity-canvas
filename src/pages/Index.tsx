import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { AppHeader } from '@/components/canvas/AppHeader';
import { ToolSettingsPanel } from '@/components/canvas/ToolSettingsPanel';
import { CanvasSidebar } from '@/components/canvas/CanvasSidebar';
import { useThemeTime } from '@/hooks/useThemeTime';
import { useAuth } from '@/hooks/useAuth';
import { useCanvasSync } from '@/hooks/useCanvasSync';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

function slugifyUsername(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '-');
}

const Index = () => {
  useThemeTime();
  const { user, session, loading, signInWithGoogle, signOut } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ username?: string; canvasName?: string }>();
  const { canvases, currentCanvasId, currentCanvasName, createCanvas, selectCanvas, selectCanvasByName } = useCanvasSync(session, user?.username);

  useEffect(() => {
    if (!session?.user?.id || !params.canvasName) return;
    const decodedName = decodeURIComponent(params.canvasName);
    if (decodedName && decodedName !== currentCanvasName) {
      selectCanvasByName(decodedName);
    }
  }, [session?.user?.id, params.canvasName, currentCanvasName, selectCanvasByName]);

  useEffect(() => {
    if (!user || !currentCanvasName) return;
    const desired = `/${slugifyUsername(user.username)}/${encodeURIComponent(currentCanvasName)}`;
    if (window.location.hash !== `#${desired}`) {
      navigate(desired, { replace: true });
    }
  }, [user, currentCanvasName, navigate]);

  return (
    <>
      <InfiniteCanvas />
      <AppHeader
        user={user}
        loading={loading}
        onSignIn={signInWithGoogle}
        onSignOut={signOut}
        currentCanvasId={currentCanvasId}
        currentCanvasName={currentCanvasName}
      />
      <CanvasSidebar
        loggedInUserId={session?.user?.id ?? null}
        canvases={canvases}
        currentCanvasId={currentCanvasId}
        onCreateCanvas={() => createCanvas()}
        onSelectCanvas={(id) => selectCanvas(id)}
      />
      <Toolbar />
      <ToolSettingsPanel />
      {/* Made by Nishant */}
      <div className="fixed bottom-3 right-4 z-50 px-3 py-1.5 bg-secondary/60 border border-border select-none pointer-events-none">
        <span className="text-[9px] font-mono text-muted-foreground block leading-tight">made by</span>
        <span className="text-[11px] font-mono font-bold text-foreground block leading-tight">Nishant</span>
      </div>
    </>
  );
};

export default Index;
