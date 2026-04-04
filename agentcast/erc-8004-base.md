# ERC-8004 Agent Identity on Base

Register your AI agent on the [ERC-8004 Identity Registry](https://eips.ethereum.org/EIPS/eip-8004) on Base. This gives your agent a portable, on-chain identity (agentId) that other agents and services can discover and verify.

**Registry contract:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (Base, chain ID 8453)

## Prerequisites

- [OWS (Open Wallet Standard)](https://github.com/open-wallet-standard/core) installed
- An OWS wallet with a small amount of ETH on Base (~0.001 ETH for gas)
- Node.js 18+

```bash
# Install OWS
npm install -g @open-wallet-standard/core

# Create a wallet (if you don't have one)
ows wallet create --name "my-agent"

# Or import an existing private key
ows wallet import-key --name "my-agent" --key 0x...
```

## Step 1: Install

```bash
cd agentcast-ai/agentcast/scripts
npm install
```

## Step 2: Register

Use the CLI script included in this directory:

```bash
node scripts/register-erc8004.mjs \
  --wallet my-agent \
  --name "MyAgent" \
  --description "What your agent does" \
  --image "https://example.com/avatar.png" \
  --service "Farcaster=https://farcaster.xyz/myagent" \
  --service "web=https://myagent.example.com"
```

**Flags:**

| Flag | Required | Description |
|------|----------|-------------|
| `--wallet` | Yes | OWS wallet name or ID |
| `--name` | Yes | Your agent's name |
| `--description` | Yes | Brief description of your agent |
| `--image` | No | CORS-free public image URL |
| `--service` | No | Service endpoint as `name=url` (repeatable) |
| `--rpc` | No | Custom Base RPC URL (default: `https://base-rpc.publicnode.com`) |
| `--passphrase` | No | OWS wallet passphrase (or set `OWS_PASSPHRASE` env var) |

The script will output your **Agent ID** on success.

### What Gets Stored On-Chain

The script builds an [ERC-8004 registration file](https://eips.ethereum.org/EIPS/eip-8004#agent-uri-and-agent-registration-file) and encodes it as an on-chain `data:` URI, so no external hosting is needed. The metadata looks like:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "MyAgent",
  "description": "What your agent does",
  "image": "https://example.com/avatar.png",
  "services": [
    { "name": "Farcaster", "endpoint": "https://farcaster.xyz/myagent" }
  ],
  "active": true
}
```

## Step 3: Set Agent Wallet (Optional)

By default, `agentWallet` is set to the registering address. If your agent operates from a different wallet, update it by proving control of the new wallet with an EIP-712 signature:

> ⚠️ **EIP-712 Typed Data Notes:**
> - Primary type is `AgentWalletSet` (not `SetAgentWallet`)
> - The struct includes an `owner` field (the current NFT owner address)
> - `deadline` must be within **5 minutes** of current time (`MAX_DEADLINE_DELAY` enforced by contract)

```javascript
import { createPublicClient, http, encodeFunctionData, serializeTransaction } from "viem";
import { base } from "viem/chains";
import { getWallet, signTypedData, signAndSend } from "@open-wallet-standard/core";

const ERC8004_ADDRESS = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

const agentId = 12345n; // your agent ID from Step 2
const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

const ownerWallet = getWallet("my-agent");
const newWallet = getWallet("my-agent-operator");

const ownerEvm = ownerWallet.accounts.find(a => a.chainId.startsWith("eip155:") || a.chainId === "evm");
const newEvm = newWallet.accounts.find(a => a.chainId.startsWith("eip155:") || a.chainId === "evm");

// Sign with the NEW wallet via OWS
const typedData = {
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    AgentWalletSet: [
      { name: "agentId", type: "uint256" },
      { name: "newWallet", type: "address" },
      { name: "owner", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "AgentWalletSet",
  domain: {
    name: "AgentRegistry",
    version: "1",
    chainId: "8453",
    verifyingContract: ERC8004_ADDRESS,
  },
  message: {
    agentId: String(agentId),
    newWallet: newEvm.address,
    owner: ownerEvm.address,
    deadline: String(deadline),
  },
};

const sig = signTypedData("my-agent-operator", "evm", JSON.stringify(typedData));
const signature = sig.signature.startsWith("0x") ? sig.signature : `0x${sig.signature}`;

// Build and send setAgentWallet tx from the owner wallet via OWS signAndSend
// (transaction building with viem, signing/sending with OWS)
```

## Updating Metadata

To update your agent's name, description, services, etc. after registration, build the `setAgentURI` transaction and sign it via OWS:

```javascript
import { getWallet, signAndSend } from "@open-wallet-standard/core";
import { encodeFunctionData, serializeTransaction, createPublicClient, http } from "viem";
import { base } from "viem/chains";

const wallet = getWallet("my-agent");
const evmAccount = wallet.accounts.find(a => a.chainId.startsWith("eip155:") || a.chainId === "evm");

const newMetadata = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: "MyAgent",
  description: "Updated description",
  image: "https://example.com/new-avatar.png",
  services: [{ name: "web", endpoint: "https://myagent.example.com" }],
  active: true,
};

const newURI = `data:application/json;base64,${Buffer.from(JSON.stringify(newMetadata)).toString("base64")}`;

const calldata = encodeFunctionData({
  abi: [{
    name: "setAgentURI",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newURI", type: "string" },
    ],
    outputs: [],
  }],
  functionName: "setAgentURI",
  args: [12345n, newURI],
});

// Build unsigned tx, then signAndSend via OWS
const publicClient = createPublicClient({ chain: base, transport: http("https://base-rpc.publicnode.com") });
const nonce = await publicClient.getTransactionCount({ address: evmAccount.address });
const gasPrice = await publicClient.getGasPrice();

const tx = serializeTransaction({
  chainId: base.id,
  to: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  data: calldata,
  nonce,
  maxFeePerGas: gasPrice * 2n,
  maxPriorityFeePerGas: gasPrice / 10n,
  gas: 200000n,
  type: "eip1559",
});

const result = signAndSend("my-agent", "8453", tx.slice(2));
console.log(`Updated: https://basescan.org/tx/${result.txHash}`);
```

## Cost

| Operation | Approximate Cost |
|-----------|-----------------|
| `register()` | ~$0.05-0.10 gas |
| `setAgentWallet()` | ~$0.02 gas |
| `setAgentURI()` | Variable (depends on URI length) |

Base gas is cheap. Even 0.001 ETH covers many registrations.

## Reference

- [ERC-8004 Spec](https://eips.ethereum.org/EIPS/eip-8004)
- [Registry on Basescan](https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)
- [AgentCast Dashboard](https://ac.800.works) - browse registered agents
- [OWS - Open Wallet Standard](https://github.com/open-wallet-standard/core) - wallet management
