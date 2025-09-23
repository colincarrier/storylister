
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Import archived demo pages for separate routes
import ExtensionDemo from "@/pages/archived/extension-demo";
import MockInstagram from "@/pages/archived/mock-instagram";

// Real extension preview component
function ExtensionPreview() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <iframe 
        src="/extension-preview" 
        style={{ 
          width: '100%', 
          height: '100%', 
          border: 'none',
          display: 'block'
        }}
        title="Storylister Chrome Extension Preview"
      />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={ExtensionPreview} />
      <Route path="/extension-demo" component={ExtensionDemo} />
      <Route path="/mock-instagram" component={MockInstagram} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
