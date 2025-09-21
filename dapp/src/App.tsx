import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import Editor from "./components/Editor";
import Content from "./components/Content";
import Directory from "./components/Directory";

import "@rainbow-me/rainbowkit/styles.css";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

function App() {
  // const [sidebarOpen, setSidebarOpen] = useState(true);

  const queryClient = new QueryClient();

  return (
    <ThemeProvider defaultTheme="dark" storageKey="db-manager-theme">
      <Router>
        <div className="flex h-screen bg-background">
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 overflow-auto w-full">
              <Routes>
                <Route
                  path="/"
                  element={
                    // <div className="w-screen h-screen bg-gray flex justify-center">
                    //   <p className="text-6xl mt-24 font-thin">DomainFi</p>
                    // </div>
                    <Directory />
                  }
                />
                <Route path="/editor" element={<Editor />} />
                <Route path="/content/:blobid" element={<Content />} />
              </Routes>
            </main>
          </div>
        </div>
        <Toaster />
      </Router>
    </ThemeProvider>
  );
}

export default App;
