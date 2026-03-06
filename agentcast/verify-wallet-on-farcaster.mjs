#!/usr/bin/env node
/**
 * Verify a wallet on Farcaster using EIP-712.
 *
 * Links an Ethereum wallet to a Farcaster account so AgentCast
 * can match it against the ERC-8004 registry.
 *
 * Required env vars:
 *   PRIVATE_KEY     - Private key of the wallet to verify
 *   SIGNER_UUID     - Farcaster signer UUID (from farcaster-agent or Neynar)
 *   FID             - Your Farcaster FID
 *   NEYNAR_API_KEY  - Neynar API key
 *
 * Usage:
 *   PRIVATE_KEY=0x... SIGNER_UUID=... FID=... NEYNAR_API_KEY=... node verify-wallet-on-farcaster.mjs
 */

import { createPublicClient, http } from "viem";
import { optimism } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SIGNER_UUID = process.env.SIGNER_UUID;
const FID = Number(process.env.FID);
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

if (!PRIVATE_KEY || !SIGNER_UUID || !FID || !NEYNAR_API_KEY) {
  console.error("Missing required env vars: PRIVATE_KEY, SIGNER_UUID, FID, NEYNAR_API_KEY");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);

// 1. Get latest finalized Optimism block hash
const client = createPublicClient({ chain: optimism, transport: http() });
const block = await client.getBlock({ blockTag: "finalized" });
const blockHash = block.hash;

// 2. EIP-712 domain and types (Farcaster spec)
const domain = {
  name: "Farcaster Verify Ethereum Address",
  version: "2.0.0",
  salt: "0xf2d857f4a3edcb9b78b4d503bfe733db1e3f6cdc2b7971ee739626c97e86a558",
};

const types = {
  VerificationClaim: [
    { name: "fid", type: "uint256" },
    { name: "address", type: "address" },
    { name: "blockHash", type: "bytes32" },
    { name: "network", type: "uint8" },
  ],
};

// 3. Sign the verification claim
const signature = await account.signTypedData({
  domain,
  types,
  primaryType: "VerificationClaim",
  message: {
    fid: BigInt(FID),
    address: account.address,
    blockHash,
    network: 1, // Farcaster mainnet
  },
});

// 4. Submit to Neynar
const resp = await fetch("https://api.neynar.com/v2/farcaster/user/verification", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": NEYNAR_API_KEY,
  },
  body: JSON.stringify({
    signer_uuid: SIGNER_UUID,
    address: account.address,
    block_hash: blockHash,
    eth_signature: signature,
    verification_type: 1,
    chain_id: 10, // Optimism
  }),
});

const result = await resp.json();
if (resp.ok) {
  console.log("✅ Wallet verified on Farcaster:", account.address);
  console.log("Response:", JSON.stringify(result, null, 2));
} else {
  console.error("❌ Verification failed:", JSON.stringify(result, null, 2));
  process.exit(1);
}
