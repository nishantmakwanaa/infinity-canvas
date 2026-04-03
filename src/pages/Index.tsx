import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { useThemeTime } from '@/hooks/useThemeTime';

const Index = () => {
  useThemeTime();

  return (
    <>
      <InfiniteCanvas />
      <Toolbar />
    </>
  );
};

export default Index;
