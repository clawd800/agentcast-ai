/**
 * ERC-8004 Agent Identity Registry — contract config
 *
 * Registry: https://basescan.org/address/0x8004a169fb4a3325136eb29fa0ceb6d2e539a432
 * Chain: Base (8453)
 *
 * This is the same ABI used by the AgentCast indexer to read agent data on-chain.
 */

import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";

// ── RPC endpoints (all public, no API key needed) ────────────────────

const RPC_URLS = [
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org",
  "https://base-pokt.nodies.app",
  "https://base.rpc.subquery.network/public",
  "https://gateway.tenderly.co/public/base",
  "https://base.blockpi.network/v1/rpc/public",
  "https://1rpc.io/base",
  "https://base-mainnet.public.blastapi.io",
  "https://base.meowrpc.com",
  "https://base.llamarpc.com",
];

export const publicClient = createPublicClient({
  chain: base,
  transport: fallback(
    RPC_URLS.map((url) => http(url, { timeout: 15_000 })),
    { rank: false } // Fixed order, no latency ranking overhead
  ),
});

// ── Contract ─────────────────────────────────────────────────────────

export const ERC8004_ADDRESS =
  "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432" as const;

export const ERC8004_ABI = [
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getAgentWallet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    name: "setAgentWallet",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newWallet", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "setAgentURI",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "Registered",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;
