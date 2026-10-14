// Which Arc the app talks to. NEXT_PUBLIC_CHAIN_ID=5042 is Arc mainnet; anything else (default 5042002) is Arc Testnet.
// viem ships both chain definitions, so no defineChain here.
import { arc, arcTestnet } from "viem/chains";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 5042002);
export const MAINNET = CHAIN_ID === 5042;
export const NETWORK = MAINNET ? "Arc" : "Arc Testnet";
export const chain = MAINNET ? arc : arcTestnet;
export const RPC = process.env.NEXT_PUBLIC_ARC_RPC ?? (MAINNET ? "https://rpc.mainnet.arc.io" : "https://rpc.testnet.arc.io");
export const DEFAULT_EXPLORER = MAINNET ? "https://explorer.arc.io" : "https://explorer.testnet.arc.io";
