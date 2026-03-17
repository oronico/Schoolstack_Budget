import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { FeedbackWidget } from "../FeedbackWidget";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <FeedbackWidget />
    </div>
  );
}
