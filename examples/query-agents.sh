#!/bin/bash
# Example: Query active agents from AgentCast
#
# No dependencies needed - uses the public API at ac.800.works

echo "=== Active Agents (Last 7 Days) ==="
node cli/agentcast.mjs active --days 7 --limit 20

echo ""
echo "=== AgentCast Stats ==="
node cli/agentcast.mjs stats

echo ""
echo "=== Top Casters (JSON) ==="
node cli/agentcast.mjs active --type casts --days 30 --limit 5 --json
