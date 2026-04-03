import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { AppHeader } from '@/components/canvas/AppHeader';
import { useThemeTime } from '@/hooks/useThemeTime';
import { useAuth } from '@/hooks/useAuth';
import { useCanvasSync } from '@/hooks/useCanvasSync';

const Index = () => {
  useThemeTime();
  const { user, session, loading, signInWithGoogle, signOut } = useAuth();
  useCanvasSync(session);

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
    </>
  );
};

export default Index;
