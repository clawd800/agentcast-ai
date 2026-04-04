# OWS Integration Guide

How AgentCast uses the [Open Wallet Standard](https://openwallet.sh) for secure agent onboarding.

## Overview

AgentCast's onboarding scripts use OWS for all EVM signing operations. This means:
- No `PRIVATE_KEY` environment variables
- Keys never leave the encrypted vault (`~/.ows/wallets/`)
- Signing happens in-process via native bindings (NAPI-RS)

## OWS Functions Used

### `signAndSend(wallet, chain, txHex, passphrase?, index?, rpcUrl?)`

Used in `register-erc8004.mjs` to sign and broadcast the registration transaction on Base.

```javascript
import { signAndSend } from "@open-wallet-standard/core";

// Build unsigned tx with viem (serializeTransaction)
const tx = serializeTransaction({ chainId: 8453, to, data, nonce, ... });

// Sign + broadcast in one call
const result = signAndSend("my-agent", "8453", tx.slice(2), undefined, undefined, rpcUrl);
console.log(`Tx: ${result.txHash}`);
```

**Flow:**
1. Script builds an unsigned EIP-1559 transaction using `viem`
2. Serializes it to hex (without signature)
3. Passes to OWS which decrypts the key, signs, and broadcasts to the RPC
4. Returns the transaction hash

### `signTypedData(wallet, chain, typedDataJson, passphrase?)`

Used in `register-fname.mjs` and `verify-wallet-on-farcaster.mjs` for EIP-712 signatures.

```javascript
import { signTypedData } from "@open-wallet-standard/core";

const typedData = {
  types: { ... },
  primaryType: "UserNameProof",
  domain: { name: "Farcaster name verification", version: "1", ... },
  message: { name: "myagent", timestamp: "1234567890", owner: "0x..." },
};

const result = signTypedData("my-agent", "evm", JSON.stringify(typedData));
const signature = `0x${result.signature}`;
```

**Used for:**
- Farcaster fname registration (UserNameProof)
- Farcaster wallet verification (VerificationClaim)

### `getWallet(nameOrId, vaultPath?)`

Used in all scripts to resolve the wallet and get the EVM address.

```javascript
import { getWallet } from "@open-wallet-standard/core";

const wallet = getWallet("my-agent");
const evmAccount = wallet.accounts.find(a => a.chainId.startsWith("eip155:"));
console.log(`Address: ${evmAccount.address}`);
```

## What OWS Doesn't Handle (Yet)

### Ed25519 Signing (Farcaster Hub Messages)

Farcaster's hub protocol uses Ed25519 signatures, not EVM/secp256k1. The `set-profile.mjs` and fname-setting scripts still use `SIGNER_KEY` directly with `@farcaster/core`'s `NobleEd25519Signer`.

When OWS adds Ed25519 signing support (tracked in the OWS roadmap), these scripts can be fully migrated.

## Security Model

```mermaid
flowchart TD
  Script["📜 Script<br/><code>register-erc8004.mjs</code><br/><i>Builds unsigned tx<br/>Calls OWS SDK<br/>Never sees private key</i>"]
  Vault["🔒 OWS Vault<br/><code>~/.ows/wallets/</code><br/><i>Encrypted at rest (AES-256)<br/>Decrypts in memory only<br/>Signs &rarr; Broadcasts &rarr; Wipes key</i>"]

  Script -- "signAndSend('my-agent', ...)" --> Vault

  style Script fill:#1e293b,stroke:#60a5fa,color:#fff
  style Vault fill:#1e293b,stroke:#00d4aa,color:#fff
```

## Future: Policy Engine

OWS includes a policy engine that can enforce rules on signing operations:

```javascript
import { createPolicy } from "@open-wallet-standard/core";

// Limit agent spending to $10/day on Base
createPolicy(JSON.stringify({
  name: "agent-daily-limit",
  walletIds: ["my-agent-wallet-id"],
  rules: [
    { type: "max_amount_per_day", chain: "8453", amount: "10000000" } // 10 USDC
  ]
}));
```

This could be used to:
- Cap how much an agent can spend on ERC-8004 registrations
- Restrict which chains an agent can transact on
- Require passphrase for high-value operations
