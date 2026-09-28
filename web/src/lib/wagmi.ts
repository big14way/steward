// ADAPT (Day 4): viem ships `arcTestnet` (id 5042002, USDC 18-dp native, rpc.testnet.arc.network, arcscan explorer),
// and Circle's use-arc skill says a custom chain definition is never required — so no defineChain here.
import { arcTestnet } from "viem/chains";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

export { arcTestnet };

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: { [arcTestnet.id]: http(process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.io") },
  ssr: true,
});
