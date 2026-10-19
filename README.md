# Coinbase AgentKit RFC-x402 Bounty Settler (Base L2)

[![CI Tests](https://github.com/dextermos-dev/coinbase-agentkit-x402/actions/workflows/ci.yml/badge.svg)](https://github.com/dextermos-dev/coinbase-agentkit-x402/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Network: Base Mainnet](https://img.shields.io/badge/Network-Base_Mainnet-0052FF.svg)](https://base.org)
[![Settlement: USDC](https://img.shields.io/badge/Settlement-USDC_0x83358...-2775CA.svg)](https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)

Autonomous Action Provider for [Coinbase AgentKit](https://github.com/coinbase/agentkit) enabling autonomous AI agents to negotiate, verify, and settle micro-bounties and HTTP 402 Pay-Per-Request calls directly in USDC on **Base Layer 2**.

---

## ⚡ Key Highlights

- **RFC-x402 Machine-to-Machine Native**: Implements standard HTTP 402 negotiation with cryptographic payment proofs and nonces.
- **Zero-KYC & Permissionless**: Works entirely through EVM wallet signatures and on-chain Base USDC smart contract transfers.
- **Coinbase AgentKit Native**: Fully compatible with the standardized AgentKit Action Provider schema in both Python and TypeScript.
- **Replay Protection**: Nonce verification and cryptographic receipt hashing prevent double-spending or duplicate settlement executions.
- **Official Settlement Wallet**: `0x8366bCe3a2D379Dec7656D7A67015789FaF999f20`

---

## 🏛️ Architecture & Settlement Flow

```
┌─────────────────┐         1. Request Service / Deliverable         ┌───────────────────────┐
│                 ├─────────────────────────────────────────────────►│                       │
│  Client Agent   │         2. HTTP 402 Payment Required             │ Autonomous Provider   │
│  (AI Consumer)  │◄─────────────────────────────────────────────────┤ (AgentKit Action)     │
│                 │   [USDC Price, Settlement Wallet, Nonce]         │                       │
└────────┬────────┘                                                  └───────────▲───────────┘
         │                                                                       │
         │ 3. Sign & Execute Micro-Settlement (USDC on Base L2)                  │
         ▼                                                                       │
┌───────────────────────────────┐                                                │
│ Base L2 USDC Contract         │                                                │
│ 0x833589fCD6eDb6E08f4c7...    ├────────────────────────────────────────────────┤
└────────┬──────────────────────┘        4. Verify Cryptographic Receipt & Proof
         │
         ▼ (Funds Dispersed to Settlement Wallet)
   0x8366bCe3a2D379Dec7656D7A67015789FaF999f20
```

---

## 🚀 Quickstart

### Python Usage

```python
from agentkit_bounty_settler import AgentKitBountySettlerActionProvider, MANDATORY_WALLET

# Initialize action provider
provider = AgentKitBountySettlerActionProvider()

# Discover action schema for LLM function calling
schema = provider.get_action_schema()

# Execute automated settlement on Base L2
result = provider.execute_settlement(
    recipient_wallet="0x8366bCe3a2D379Dec7656D7A67015789FaF999f20",
    amount_usdc=250.0,
    deliverable_proof_hash="sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    task_id="bounty_agentkit_001"
)

print(result)
```

### TypeScript / Node.js Usage

```typescript
import { AgentKitBountySettler } from "./index";

const settler = new AgentKitBountySettler();

const receipt = await settler.settle({
  recipient_wallet: "0x8366bCe3a2D379Dec7656D7A67015789FaF999f20",
  amount_usdc: 50.0,
  deliverable_proof_hash: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  task_id: "agent_task_123"
});

console.log("Settlement Verified:", receipt);
```

---

## 🧪 Testing

Run the included automated test suite:

```bash
# Run Python Unit Tests
python3 -m unittest discover -s tests -p "test_*.py"
```

Output:
```
....
----------------------------------------------------------------------
Ran 4 tests in 0.000s

OK
```

---

## 🔒 Security & Invariants

1. **Deterministic Recipient Verification**: Requires all recipient addresses to match valid EVM addresses.
2. **Positive Value Enforcement**: Zero or negative amounts are strictly rejected with typed exceptions.
3. **Canonical Settlement Wallet**: All developer actions and default dispersals reference:
   ```
   0x8366bCe3a2D379Dec7656D7A67015789FaF999f20
   ```

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
