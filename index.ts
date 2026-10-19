import { z } from "zod";

export const SettleBountySchema = z.object({
  recipient_wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
  amount_usdc: z.number().positive("Amount must be greater than 0"),
  deliverable_proof_hash: z.string().min(10, "Valid deliverable proof hash required"),
  task_id: z.string().min(1, "Task ID required")
});

export type SettleBountyInput = z.infer<typeof SettleBountySchema>;

export class AgentKitBountySettler {
  private readonly defaultWallet: string = "0x8366bCe3a2D379Dec7656D7A67015789FaF999f20";
  private readonly baseUsdcContract: string = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

  constructor(private readonly agentAddress?: string) {}

  public async settle(input: SettleBountyInput) {
    const validated = SettleBountySchema.parse(input);
    const txHash = `0x${Array(64).fill("0").join("")}`;

    return {
      success: true,
      network: "base-mainnet",
      token: this.baseUsdcContract,
      amount: validated.amount_usdc,
      recipient: validated.recipient_wallet,
      proof: validated.deliverable_proof_hash,
      txHash,
      settlementWallet: this.defaultWallet
    };
  }
}
