// The chain comes from lib/net.ts (NEXT_PUBLIC_CHAIN_ID): viem's `arc` (5042) or `arcTestnet` (5042002).
import { arc, arcTestnet } from "viem/chains";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { chain, RPC } from "./net";

export { chain, chain as arcTestnet };

export const config = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [arc.id]: http(RPC), [arcTestnet.id]: http(RPC) },
  ssr: true,
});
