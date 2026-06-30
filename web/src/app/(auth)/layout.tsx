import { Suspense } from "react";
import { Loader2 } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
      <div className="w-full max-w-md px-4">
        <Suspense fallback={<div className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
          {children}
        </Suspense>
      </div>
    </div>
  );
}
