#!/usr/bin/env python3
"""
Unit tests for Coinbase AgentKit Action Provider (Base L2 x402 Micropayments)
Author: @dextermos / @dextermos-dev
Settlement Address: 0x8366bCe3a2D379Dec7656D7A67015789FaF999f20
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from agentkit_bounty_settler import (
    AgentKitBountySettlerActionProvider,
    MANDATORY_WALLET
)

class TestAgentKitActionProvider(unittest.TestCase):
    def setUp(self):
        self.provider = AgentKitBountySettlerActionProvider()

    def test_schema_validity(self):
        schema = self.provider.get_action_schema()
        self.assertEqual(schema["name"], "settle_bounty_micropayment")
        self.assertIn("recipient_wallet", schema["parameters"]["required"])
        self.assertIn("amount_usdc", schema["parameters"]["required"])

    def test_execution_success(self):
        res = self.provider.execute_settlement(
            recipient_wallet=MANDATORY_WALLET,
            amount_usdc=500.0,
            deliverable_proof_hash="sha256:abc1234567890",
            task_id="bounty_agentkit_001"
        )
        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(res["recipient_wallet"], MANDATORY_WALLET)
        self.assertEqual(res["amount_usdc"], 500.0)
        self.assertEqual(res["settlement_wallet"], MANDATORY_WALLET)
        self.assertTrue(res["transaction_hash"].startswith("0x"))

    def test_invalid_address_rejection(self):
        with self.assertRaises(ValueError):
            self.provider.execute_settlement(
                recipient_wallet="invalid_address",
                amount_usdc=100.0,
                deliverable_proof_hash="sha256:abc",
                task_id="bounty_err_001"
            )

    def test_invalid_amount_rejection(self):
        with self.assertRaises(ValueError):
            self.provider.execute_settlement(
                recipient_wallet=MANDATORY_WALLET,
                amount_usdc=-50.0,
                deliverable_proof_hash="sha256:abc",
                task_id="bounty_err_002"
            )

if __name__ == '__main__':
    unittest.main()
