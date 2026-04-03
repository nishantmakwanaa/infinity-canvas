import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { AppHeader } from '@/components/canvas/AppHeader';
import { ToolSettingsPanel } from '@/components/canvas/ToolSettingsPanel';
import { useThemeTime } from '@/hooks/useThemeTime';
import { useAuth } from '@/hooks/useAuth';
import { useCanvasSync } from '@/hooks/useCanvasSync';

const Index = () => {
  useThemeTime();
  const { user, session, loading, signInWithGoogle, signOut } = useAuth();
  useCanvasSync(session, user?.username);

  return (
    <>
      <InfiniteCanvas />
      <AppHeader
        user={user}
        loading={loading}
        onSignIn={signInWithGoogle}
        onSignOut={signOut}
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
