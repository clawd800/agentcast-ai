#!/usr/bin/env node

/**
 * Register a Farcaster username (fname) on the Farcaster Name Registry,
 * then set it as UserData on the hub.
 *
 * Uses OWS (Open Wallet Standard) for EIP-712 signing.
 * No raw private keys needed - OWS handles custody securely.
 *
 * Usage:
 *   node register-fname.mjs \
 *     --wallet <ows-wallet-name> \
 *     --fid <fid> \
 *     --fname <username>
 *
 * Options:
 *   --wallet     OWS wallet name or ID (required, for EIP-712 fname registration)
 *   --fid        Farcaster FID (required)
 *   --fname      Username to register (required, lowercase alphanumeric + hyphens, 1-16 chars)
 *   --hub-url    Hub endpoint for UserData message (default: AgentCast proxy)
 *   --passphrase OWS wallet passphrase (or set OWS_PASSPHRASE env var)
 *
 * Environment:
 *   SIGNER_KEY   Ed25519 signer private key (for hub UserData message)
 */

import {
  getWallet,
  signTypedData,
} from "@open-wallet-standard/core";
import {
  makeUserDataAdd,
  NobleEd25519Signer,
  FarcasterNetwork,
  UserDataType,
  Message,
} from "@farcaster/core";

const FNAME_REGISTRY = "https://fnames.farcaster.xyz";
const AGENTCAST_HUB_PROXY = "https://ac.800.works/api/neynar/hub";

// ── Parse args ───────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  let i = 2;
  while (i < argv.length) {
    const flag = argv[i];
    const val = argv[i + 1];
    if (val === undefined && flag.startsWith("--")) {
      console.error(`Missing value for ${flag}`);
      process.exit(1);
    }
    switch (flag) {
      case "--wallet":
        args.wallet = val;
        i += 2;
        break;
      case "--fid":
        args.fid = Number(val);
        i += 2;
        break;
      case "--fname":
        args.fname = val;
        i += 2;
        break;
      case "--hub-url":
        args.hubUrl = val;
        i += 2;
        break;
      case "--passphrase":
        args.passphrase = val;
        i += 2;
        break;
      default:
        console.error(`Unknown flag: ${flag}`);
        process.exit(1);
    }
  }
  return args;
}

const args = parseArgs(process.argv);

const signerKey = process.env.SIGNER_KEY;
const passphrase = args.passphrase || process.env.OWS_PASSPHRASE || undefined;

if (!args.wallet) {
  console.error("Error: --wallet is required (OWS wallet name or ID)");
  process.exit(1);
}
if (!signerKey) {
  console.error("Error: SIGNER_KEY environment variable required (Ed25519 signer private key)");
  process.exit(1);
}
if (!args.fid) {
  console.error("Error: --fid is required");
  process.exit(1);
}
if (!args.fname) {
  console.error("Error: --fname is required");
  process.exit(1);
}

// Validate fname format
if (!/^[a-z0-9][a-z0-9-]{0,15}$/.test(args.fname)) {
  console.error("Error: fname must be lowercase alphanumeric + hyphens, 1-16 chars, cannot start with hyphen");
  process.exit(1);
}

// ── Resolve wallet ───────────────────────────────────────────────────

let walletInfo;
try {
  walletInfo = getWallet(args.wallet);
} catch (err) {
  console.error(`Error: Could not find OWS wallet "${args.wallet}": ${err.message}`);
  process.exit(1);
}

const evmAccount = walletInfo.accounts.find((a) => a.chainId.startsWith("eip155:") || a.chainId === "evm");
if (!evmAccount) {
  console.error("Error: OWS wallet has no EVM account");
  process.exit(1);
}
const walletAddress = evmAccount.address;

// ── Step 1: Check availability ───────────────────────────────────────

console.log(`\nRegistering fname "${args.fname}" for FID ${args.fid}...`);
console.log(`Wallet: ${walletAddress} (OWS: ${walletInfo.name})\n`);

const checkRes = await fetch(`${FNAME_REGISTRY}/transfers/current?name=${args.fname}`);
if (checkRes.ok) {
  const existing = await checkRes.json();
  if (existing.transfer && existing.transfer.to !== 0) {
    if (existing.transfer.to === args.fid) {
      console.log(`ℹ️  Fname "${args.fname}" already registered to FID ${args.fid}`);
      console.log("   Skipping registry, setting UserData on hub...\n");
    } else {
      console.error(`❌ Fname "${args.fname}" is already taken by FID ${existing.transfer.to}`);
      process.exit(1);
    }
  }
} else if (checkRes.status !== 404) {
  console.warn(`⚠️  Could not check fname availability (HTTP ${checkRes.status}), proceeding anyway...`);
}

// ── Step 2: Register on fnames.farcaster.xyz (EIP-712 via OWS) ──────

const timestamp = Math.floor(Date.now() / 1000);

const typedData = {
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    UserNameProof: [
      { name: "name", type: "string" },
      { name: "timestamp", type: "uint256" },
      { name: "owner", type: "address" },
    ],
  },
  primaryType: "UserNameProof",
  domain: {
    name: "Farcaster name verification",
    version: "1",
    chainId: "1",
    verifyingContract: "0xe3Be01D99bAa8dB9905b33a3cA391238234B79D1",
  },
  message: {
    name: args.fname,
    timestamp: String(timestamp),
    owner: walletAddress,
  },
};

const sigResult = signTypedData(
  args.wallet,
  "evm",
  JSON.stringify(typedData),
  passphrase
);

const signature = sigResult.signature.startsWith("0x")
  ? sigResult.signature
  : `0x${sigResult.signature}`;

const regRes = await fetch(`${FNAME_REGISTRY}/transfers`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: args.fname,
    from: 0,
    to: args.fid,
    fid: args.fid,
    owner: walletAddress,
    timestamp,
    signature,
  }),
});

if (regRes.ok) {
  const data = await regRes.json();
  console.log(`✅ Fname registered on fnames.farcaster.xyz (transfer ID: ${data.transfer?.id ?? "?"})`);
} else {
  const text = await regRes.text();
  if (text.includes("already registered")) {
    console.log(`ℹ️  Fname already registered, continuing...`);
  } else {
    console.error(`❌ Fname registration failed: HTTP ${regRes.status} - ${text}`);
    process.exit(1);
  }
}

// ── Step 3: Wait for hub sync ────────────────────────────────────────

console.log("\n⏳ Waiting 30 seconds for hub to sync fname...");
await new Promise((r) => setTimeout(r, 30000));

// ── Step 4: Set UserData USERNAME on hub ──────────────────────────────

const hubUrl = args.hubUrl || AGENTCAST_HUB_PROXY;
console.log(`\nSetting UserData USERNAME on hub (${hubUrl})...`);

const keyBytes = Buffer.from(signerKey.replace(/^0x/, ""), "hex");
const signer = new NobleEd25519Signer(keyBytes);

const result = await makeUserDataAdd(
  { type: UserDataType.USERNAME, value: args.fname },
  { fid: args.fid, network: FarcasterNetwork.MAINNET },
  signer
);

if (result.isErr()) {
  console.error(`❌ Failed to create UserData message: ${result.error.message}`);
  process.exit(1);
}

const messageBytes = Buffer.from(Message.encode(result.value).finish());
const hubRes = await fetch(hubUrl, {
  method: "POST",
  headers: { "Content-Type": "application/octet-stream" },
  body: messageBytes,
});

if (hubRes.ok) {
  console.log(`✅ Username "${args.fname}" set on hub`);
  console.log(`\n🎉 Done! Verify: https://farcaster.xyz/${args.fname}`);
} else {
  const body = await hubRes.text();
  console.error(`❌ Hub rejected UserData: HTTP ${hubRes.status} - ${body}`);
  process.exit(1);
}
