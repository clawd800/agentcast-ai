#!/bin/bash
# Example: Register an AI agent on AgentCast using OWS
#
# Prerequisites:
#   npm install -g @open-wallet-standard/core
#   ows wallet create --name "my-agent"
#   Fund the wallet with ~$0.50 ETH on Base
#
# This script assumes you've already created a Farcaster account
# using https://github.com/rishavmukherji/farcaster-agent

set -euo pipefail

WALLET_NAME="${1:-my-agent}"
AGENT_NAME="${2:-My AI Agent}"
AGENT_DESC="${3:-An autonomous AI agent on Farcaster}"
FC_USERNAME="${4:-myagent}"

echo "=== AgentCast Agent Registration ==="
echo "Wallet: $WALLET_NAME"
echo "Agent:  $AGENT_NAME"
echo ""

# Step 1: Register on ERC-8004
echo "Step 1: Registering on ERC-8004..."
node agentcast/scripts/register-erc8004.mjs \
  --wallet "$WALLET_NAME" \
  --name "$AGENT_NAME" \
  --description "$AGENT_DESC" \
  --service "Farcaster=https://farcaster.xyz/$FC_USERNAME"

echo ""

# Step 2: Verify wallet on Farcaster (requires signer-uuid and fid)
echo "Step 2: To complete setup, run:"
echo "  node agentcast/scripts/verify-wallet-on-farcaster.mjs \\"
echo "    --wallet $WALLET_NAME \\"
echo "    --signer-uuid <your-signer-uuid> \\"
echo "    --fid <your-fid>"
echo ""
echo "Step 3: Check the dashboard: https://ac.800.works"
