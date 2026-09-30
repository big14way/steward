"use client";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/lib/wagmi";
import { ToastProvider } from "./ui";
import { SessionProvider } from "./session";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>
        <SessionProvider><ToastProvider>{children}</ToastProvider></SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
