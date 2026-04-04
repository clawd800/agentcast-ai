#!/usr/bin/env node

/**
 * Register an AI agent on the ERC-8004 Identity Registry (Base).
 *
 * Uses OWS (Open Wallet Standard) for key management and signing.
 * No raw private keys needed - OWS handles custody securely.
 *
 * Usage:
 *   node register-erc8004.mjs --wallet <ows-wallet-name> --name "MyAgent" --description "What it does" [--image "https://..."] [--service "Farcaster=https://farcaster.xyz/username"]
 *
 * Options:
 *   --wallet       OWS wallet name or ID (required)
 *   --name         Agent name (required)
 *   --description  Agent description (required)
 *   --image        Public image URL for agent avatar
 *   --service      Service endpoint in "name=url" format (repeatable)
 *   --rpc          Custom RPC URL (default: https://base-rpc.publicnode.com)
 *   --passphrase   OWS wallet passphrase (or set OWS_PASSPHRASE env var)
 *
 * First-time setup:
 *   # Install OWS
 *   npm install @open-wallet-standard/core
 *
 *   # Create a wallet (if you don't have one)
 *   npx ows wallet create --name "my-agent"
 *
 *   # Or import an existing private key into OWS
 *   npx ows wallet import-key --name "my-agent" --key 0x...
 */

import {
  createPublicClient,
  http,
  decodeEventLog,
  encodeFunctionData,
  serializeTransaction,
} from "viem";
import { base } from "viem/chains";
import {
  getWallet,
  signAndSend,
} from "@open-wallet-standard/core";

const ERC8004_ADDRESS = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

const ERC8004_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
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
];

// ── Parse args ───────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { services: [] };
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
      case "--name":
        args.name = val;
        i += 2;
        break;
      case "--description":
        args.description = val;
        i += 2;
        break;
      case "--image":
        args.image = val;
        i += 2;
        break;
      case "--service":
        if (!val.includes("=")) {
          console.error(`Invalid --service format: "${val}" (expected name=url)`);
          process.exit(1);
        }
        const [sName, ...rest] = val.split("=");
        args.services.push({ name: sName, endpoint: rest.join("=") });
        i += 2;
        break;
      case "--rpc":
        args.rpc = val;
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

if (!args.wallet) {
  console.error("Error: --wallet is required (OWS wallet name or ID)");
  console.error("  Create one: npx ows wallet create --name my-agent");
  console.error("  Or import:  npx ows wallet import-key --name my-agent --key 0x...");
  process.exit(1);
}

if (!args.name || !args.description) {
  console.error(
    "Usage: node register-erc8004.mjs --wallet <name> --name <name> --description <desc> [--image <url>] [--service name=url]"
  );
  process.exit(1);
}

const passphrase = args.passphrase || process.env.OWS_PASSPHRASE || undefined;

// ── Resolve wallet ───────────────────────────────────────────────────

let walletInfo;
try {
  walletInfo = getWallet(args.wallet);
} catch (err) {
  console.error(`Error: Could not find OWS wallet "${args.wallet}": ${err.message}`);
  console.error("  List wallets: npx ows wallet list");
  process.exit(1);
}

const evmAccount = walletInfo.accounts.find((a) => a.chainId.startsWith("eip155:") || a.chainId === "evm");
if (!evmAccount) {
  console.error("Error: OWS wallet has no EVM account");
  process.exit(1);
}
const walletAddress = evmAccount.address;

// ── Build metadata ───────────────────────────────────────────────────

const metadata = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: args.name,
  description: args.description,
  ...(args.image && { image: args.image }),
  ...(args.services.length > 0 && { services: args.services }),
  active: true,
};

const agentURI = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;

// ── Register ─────────────────────────────────────────────────────────

const rpcUrl = args.rpc || "https://base-rpc.publicnode.com";

const publicClient = createPublicClient({
  chain: base,
  transport: http(rpcUrl),
});

console.log(`\nRegistering agent "${args.name}" on ERC-8004 (Base)...`);
console.log(`Wallet: ${walletAddress} (OWS: ${walletInfo.name})\n`);

try {
  // Build the transaction
  const calldata = encodeFunctionData({
    abi: ERC8004_ABI,
    functionName: "register",
    args: [agentURI],
  });

  const nonce = await publicClient.getTransactionCount({ address: walletAddress });
  const gasPrice = await publicClient.getGasPrice();
  const gasEstimate = await publicClient.estimateGas({
    account: walletAddress,
    to: ERC8004_ADDRESS,
    data: calldata,
  });

  // Serialize unsigned EIP-1559 transaction
  const tx = serializeTransaction({
    chainId: base.id,
    to: ERC8004_ADDRESS,
    data: calldata,
    nonce,
    maxFeePerGas: gasPrice * 2n,
    maxPriorityFeePerGas: gasPrice / 10n,
    gas: gasEstimate * 12n / 10n, // 20% buffer
    type: "eip1559",
  });

  // Sign and send via OWS
  const txHex = tx.startsWith("0x") ? tx.slice(2) : tx;
  const result = signAndSend(
    args.wallet,
    "8453", // Base chain ID
    txHex,
    passphrase,
    undefined,
    rpcUrl
  );

  const hash = result.txHash.startsWith("0x") ? result.txHash : `0x${result.txHash}`;
  console.log(`Tx sent: ${hash}`);
  console.log("Waiting for confirmation...\n");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Extract agentId from Registered event
  let agentId = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ERC8004_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: ERC8004_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "Registered") {
        agentId = Number(decoded.args.agentId);
      }
    } catch {
      // Not our event
    }
  }

  if (agentId !== null) {
    console.log(`✅ Registered! Agent ID: ${agentId}`);
    console.log(`   Tx: https://basescan.org/tx/${hash}`);
    console.log(`   Registry: https://basescan.org/address/${ERC8004_ADDRESS}`);
    console.log(
      `\nYour agent is now discoverable on-chain as Agent #${agentId}.`
    );
  } else {
    console.log(`✅ Transaction confirmed but could not parse agentId.`);
    console.log(`   Check tx: https://basescan.org/tx/${hash}`);
  }
} catch (err) {
  console.error("\n❌ Registration failed:", err.shortMessage || err.message);
  if (err.message?.includes("insufficient funds")) {
    console.error(
      "   Send ETH to your wallet on Base. Even 0.001 ETH is enough."
    );
  }
  process.exit(1);
}
