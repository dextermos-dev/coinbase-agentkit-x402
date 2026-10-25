```typescript
/**
 * Nano (XNO) Settlement Module
 *
 * This module provides a minimal, self‑contained implementation for creating,
 * signing and verifying Nano send blocks with replay��protection via a nonce.
 *
 * It uses the `nanocurrency` npm package which implements the Nano block
 * format, address handling, and Ed25519 signing.
 *
 * Usage:
 *   import { NanoSettlement } from "./nano-settlement";
 *
 *   const settlement = new NanoSettlement(privateKey);
 *   const block = settlement.createSend({
 *     to: "nano_3e3j5...your destination...",
 *     amountRaw: "1000000000000000000000000", // 1 XNO = 10^30 raw
 *     previous: "E3A5...previous block hash...",
 *     representative: "nano_3e3j5...representative...",
 *     nonce: "unique‑nonce‑123"
 *   });
 *
 *   const signedBlock = settlement.signBlock(block);
 *   const receipt = settlement.getReceipt(signedBlock);
 *
 *   // `receipt` is the block hash and can be used as a cryptographic receipt.
 */

import {
  generateSeed,
  generateKeyPair,
  getPublicKey,
  getAccount,
  sign,
  verify,
  hashBlock,
  Block,
  BlockHash,
  Work,
  generateWork,
} from "nanocurrency";

export interface SendBlockParams {
  /** Destination Nano address */
  to: string;
  /** Amount in raw units (as a decimal string) */
  amountRaw: string;
  /** Hash of the previous block for the sending account */
  previous: string;
  /** Representative address for the sending account */
  representative: string;
  /** Optional nonce for replay protection – must be unique per settlement */
  nonce?: string;
}

/**
 * NanoSettlement encapsulates the creation and signing of Nano send blocks.
 * It adds a deterministic nonce to the `link` field to guarantee replay‑
 * protection without altering the Nano protocol.
 */
export class NanoSettlement {
  /** Private key in hex (64 characters) */
  private readonly privateKey: string;
  /** Public key in hex (64 characters) */
  private readonly publicKey: string;
  /** Account address derived from the public key */
  public readonly address: string;

  /**
   * Construct a settlement instance from a hex private key.
   * @param privateKeyHex 64‑character hex string (32‑byte Ed25519 private key)
   */
  constructor(privateKeyHex: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(privateKeyHex)) {
      throw new Error("Invalid private key format – must be 64 hex characters");
    }
    this.privateKey = privateKeyHex;
    this.publicKey = getPublicKey(this.privateKey);
    this.address = getAccount(this.publicKey);
  }

  /**
   * Create an unsigned send block. The `link` field is derived from the
   * destination address and an optional nonce. If a nonce is supplied, we
   * hash the concatenation of the destination address and nonce, then use the
   * first 32 bytes as the link. This guarantees that two identical sends with
   * different nonces produce distinct blocks, preventing replay.
   *
   * @param params Parameters for the send block
   * @returns Unsigned Nano block object
   */
  public createSend(params: SendBlockParams): Block {
    const { to, amountRaw, previous, representative, nonce } = params;

    // Validate address format
    if (!to.startsWith("nano_") && !to.startsWith("xrb_")) {
      throw new Error("Invalid destination address");
    }

    // Compute the link field:
    //   - If nonce is provided, hash(to + nonce) and use as link.
    //   - Otherwise, use the raw address bytes (standard Nano behaviour).
    const link = nonce
      ? this.computeNonceLink(to, nonce)
      : this.addressToLink(to);

    // Determine the new balance: previous balance - amount
    // In a real implementation you would fetch the previous balance from the
    // blockchain. For this minimal example we assume the caller supplies a
    // correct `previous` hash and that the balance is already known.
    // The caller must also compute the new balance string (raw units).
    // Here we simply require the caller to provide the correct balance via
    // `amountRaw` and we compute the new balance as a placeholder.
    // In production you would query the node for the current balance.
    const newBalance = this.computeNewBalance(previous, amountRaw);

    const block: Block = {
      type: "send",
      account: this.address,
      previous,
      representative,
      balance: newBalance,
      link,
    };

    return block;
  }

  /**
   * Sign a block with the instance's private key and compute its hash.
   *
   * @param block Unsigned block
   * @returns Signed block with `signature` and `work` fields populated
   */
  public async signBlock(block: Block): Promise<Block & { signature: string; work: string }> {
    // Compute block hash (pre‑signature)
    const blockHash = hashBlock(block) as BlockHash;

    // Sign the hash
    const signature = sign(this.privateKey, blockHash);

    // Generate work (Proof‑of‑Work) – required for block acceptance on the network.
    // For test environments you may skip work generation.
    const work: Work = await generateWork(blockHash);

    return {
      ...block,
      signature,
      work,
    };
  }

  /**
   * Verify a signed block's signature and work.
   *
   * @param signedBlock Block with `signature` and `work`
   * @returns True if both signature and work are valid
   */
  public async verifyBlock(signedBlock: Block & { signature: string; work: string }): Promise<boolean> {
    const { signature, work, ...unsigned } = signedBlock;
    const blockHash = hashBlock(unsigned) as BlockHash;

    // Verify signature
    const sigValid = verify(this.publicKey, blockHash, signature);
    if (!sigValid) return false;

    // Verify work (simple difficulty check – Nano requires work >= 0xfffffff800000000)
    const workValid = await this.validateWork(blockHash, work);
    return workValid;
  }

  /**
   * Return the block hash which serves as a cryptographic receipt.
   *
   * @param signedBlock Fully signed block
   * @returns Hex string of the block hash
   */
  public getReceipt(signedBlock: Block & { signature: string; work: string }): string {
    const { signature, work, ...unsigned } = signedBlock;
    return hashBlock(unsigned) as string;
  }

  /**
   * Compute a deterministic link from destination address + nonce.
   *
   * @param address Destination Nano address
   * @param nonce   Arbitrary string that must be unique per settlement
   * @returns 64‑character hex string (32‑byte link)
   */
  private computeNonceLink(address: string, nonce: string): string {
    // Convert address to raw 32‑byte representation
    const addressBytes = this.addressToBytes(address);
    // Concatenate address bytes with nonce (UTF‑8)
    const encoder = new TextEncoder();
    const nonceBytes = encoder.encode(nonce);
    const combined = new Uint8Array(addressBytes.length + nonceBytes.length);
    combined.set(addressBytes);
    combined.set(nonceBytes, addressBytes.length);
    // Hash with Blake2b (Nano uses Blake2b 256‑bit)
    const hash = this.blake2b256(combined);
    // Return first 32 bytes as hex
    return Buffer.from(hash).toString("hex");
  }

  /**
   * Convert a Nano address to the 32‑byte link representation.
   *
   * @param address Nano address
   * @returns 64‑character hex string
   */
  private addressToLink(address: string): string {
    const bytes = this.addressToBytes(address);
    return Buffer.from(bytes).toString("hex");
  }

  /**
   * Decode a Nano address to its raw 32‑byte public key.
   *
   * @param address Nano address
   * @returns Uint8Array of length 32
   */
  private addressToBytes(address: string): Uint8Array {
    // nanocurrency provides a helper to decode address to public key hex
    const publicKeyHex = getPublicKey(address);
    return Uint8Array.from(Buffer.from(publicKeyHex, "hex"));
  }

  /**
   * Simple Blake2b‑256 hash implementation using Node's crypto module.
   *
   * @param data Uint8Array input
   * @returns Uint8Array of length 32
   */
  private blake2b256(data: Uint8Array): Uint8Array {
    const crypto = require("crypto");
    return crypto.createHash("blake2b256").update(Buffer.from(data)).digest();
  }

  /**
   * Placeholder balance computation.
   *
   * In a production environment you must query the blockchain for the current
   * balance of `previous` and subtract `amountRaw`. Here we simply return the
   * amount as a string for demonstration.
   *
   * @param previousHash Hash of the previous block (unused)
   * @param amountRaw   Amount to send in raw units
   * @returns New balance as raw string
   */
  private computeNewBalance(_previousHash: string, amountRaw: string): string {
    // NOTE: Replace with real balance lookup and subtraction.
    // For demo purposes we assume the sender's balance after sending is zero.
    // This function should return (previousBalance - amountRaw) as a decimal string.
    return "0";
  }

  /**
   * Validate PoW work against Nano's difficulty threshold.
   *
   * @param hash Block hash
   * @param work Hex string of work
   * @returns True if work meets difficulty
   */
  private async validateWork(hash: BlockHash, work: string): Promise<boolean> {
    const crypto = require("crypto");
    const workBuffer = Buffer.from(work, "hex");
    const hashBuffer = Buffer.from(hash, "hex");
    const combined = Buffer.concat([workBuffer, hashBuffer]);
    const result = crypto.createHash("blake2b256").update(combined).digest();
    // Nano's difficulty for send blocks is 0xfffffff800000000 (as a 64‑bit integer)
    const difficulty = BigInt("0xfffffff800000000");
    const value = BigInt("0x" + result.slice(0, 8).toString("hex"));
    return value >= difficulty;
  }

  /**
   * Static helper to generate a fresh key pair.
   *
   * @returns Object containing `privateKey`, `publicKey`, and `address`
   */
  public static generateNewAccount(): {
    privateKey: string;
    publicKey: string;
    address: string;
  } {
    const seed = generateSeed();
    const { privateKey, publicKey } = generateKeyPair(seed, 0);
    const address = getAccount(publicKey);
    return { privateKey, publicKey, address };
  }
}

/* -------------------------------------------------------------------------- */
/* Example usage (uncomment to run)                                          */
/* -------------------------------------------------------------------------- */
/*
(async () => {
  // Generate a new account (only for demo – in production you already have a key)
  const { privateKey, address } = NanoSettlement.generateNewAccount();
  console.log("New account:", address);

  const settlement = new NanoSettlement(privateKey);

  const sendBlock = settlement.createSend({
    to: "nano_3e3j5t6z6z6z6z6z