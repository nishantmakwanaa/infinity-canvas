import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import SharedCanvas from "./pages/SharedCanvas";
import NotFound from "./pages/NotFound";
import { useRealtimeTranslation } from "@/hooks/useRealtimeTranslation";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => {
  useRealtimeTranslation();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            <Route path="/view/:token" element={<SharedCanvas />} />
            <Route path="/:username/view/:canvasName/:pageName" element={<SharedCanvas />} />
            <Route path="/:username/view/:canvasName" element={<SharedCanvas />} />
            <Route path="/:username/:canvasName/:pageName" element={<Index />} />
            <Route path="/:username?/:canvasName?" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
