/**
 * Nano (XNO) settlement utilities – TypeScript
 *
 * This module provides a minimal, dependency‑light implementation for:
 *   • Generating a Nano keypair from a seed
 *   • Building a signed "send" block (the cryptographic receipt)
 *   • Verifying a signed block
 *
 * It uses only standard crypto primitives (tweetnacl) and blake2b hashing.
 *
 * References:
 *   • https://docs.nano.org/integration-guides/the-basics/#block-hash
 *   • https://github.com/nanocurrency/nano-node/blob/master/src/crypto/Blake2b.cpp
 */

import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';
import { encode as base32Encode } from 'base32-encode';
import { decode as base32Decode } from 'base32-decode';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Convert a Uint8Array to a hex string */
const toHex = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('hex');

/** Convert a hex string to Uint8Array */
const fromHex = (hex: string): Uint8Array =>
  new Uint8Array(Buffer.from(hex, 'hex'));

/** Pad a hex string to the desired length (bytes) */
const padHex = (hex: string, bytes: number): string =>
  hex.padStart(bytes * 2, '0');

/** Nano address encoding/decoding (base32 with checksum) */
const NANO_ALPHABET = '13456789abcdefghijkmnopqrstuwxyz';
const ADDRESS_PREFIX = 'nano_';

function encodeAddress(publicKey: Uint8Array): string {
  const checksum = blake2b(publicKey, null, 5).reverse(); // 5‑byte checksum
  const addressBytes = new Uint8Array(32 + 5);
  addressBytes.set(publicKey, 0);
  addressBytes.set(checksum, 32);
  const encoded = base32Encode(addressBytes, 'RFC4648', { padding: false }).toLowerCase();
  // Insert the 60‑character address into the Nano alphabet
  let result = ADDRESS_PREFIX;
  for (let i = 0; i < encoded.length; i++) {
    const idx = parseInt(encoded[i], 36);
    result += NANO_ALPHABET[idx];
  }
  return result;
}

function decodeAddress(address: string): Uint8Array {
  if (!address.startsWith(ADDRESS_PREFIX)) {
    throw new Error('Invalid Nano address prefix');
  }
  const body = address.slice(ADDRESS_PREFIX.length);
  // Map Nano alphabet back to base32 digits
  let base32 = '';
  for (const ch of body) {
    const idx = NANO_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid character in Nano address');
    base32 += idx.toString(36);
  }
  const decoded = base32Decode(base32, 'RFC4648');
  if (decoded.length !== 37) throw new Error('Invalid decoded address length');
  const publicKey = decoded.slice(0, 32);
  const checksum = decoded.slice(32);
  const expectedChecksum = blake2b(publicKey, null, 5).reverse();
  if (!expectedChecksum.every((v, i) => v === checksum[i])) {
    throw new Error('Address checksum mismatch');
  }
  return publicKey;
}

/** Convert a decimal string amount (raw) to a 16‑byte big‑endian Uint8Array */
function amountToBytes(amountRaw: string): Uint8Array {
  const bn = BigInt(amountRaw);
  const bytes = new Uint8Array(16);
  for (let i = 15; i >= 0; i--) {
    bytes[i] = Number(bn & 0xffn);
    bn >>= 8n;
  }
  return bytes;
}

/** Convert a Uint8Array (big‑endian) to a decimal string (raw) */
function bytesToAmount(bytes: Uint8Array): string {
  let bn = 0n;
  for (const b of bytes) {
    bn = (bn << 8n) + BigInt(b);
  }
  return bn.toString();
}

// -----------------------------------------------------------------------------
// Key Management
// -----------------------------------------------------------------------------

/**
 * Derive a Nano keypair from a 32‑byte seed and an optional index.
 * Returns the private key (32 bytes), public key (32 bytes) and address.
 */
export function keypairFromSeed(seedHex: string, index = 0): {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
} {
  const seed = fromHex(padHex(seedHex, 32));
  // Derive a deterministic private key: blake2b(seed || index)
  const indexBuf = new Uint8Array(4);
  new DataView(indexBuf.buffer).setUint32(0, index, false); // big‑endian
  const privateKey = blake2b(Buffer.concat([seed, indexBuf]), null, 32);
  const keyPair = nacl.sign.keyPair.fromSeed(privateKey);
  const address = encodeAddress(keyPair.publicKey);
  return {
    privateKey: keyPair.secretKey.slice(0, 32),
    publicKey: keyPair.publicKey,
    address,
  };
}

// -----------------------------------------------------------------------------
// Block Construction
// -----------------------------------------------------------------------------

export type SendBlockParams = {
  /** Sender's private key (32‑byte Uint8Array) */
  privateKey: Uint8Array;
  /** Sender's public key (32‑byte Uint8Array) */
  publicKey: Uint8Array;
  /** Previous block hash (hex, 64 chars) */
  previous: string;
  /** Representative address (nano_…) */
  representative: string;
  /** New balance after the send (raw, decimal string) */
  balance: string;
  /** Destination address (nano_…) */
  link: string; // in Nano, the "link" field holds the destination public key
};

/**
 * Build and sign a Nano "send" block.
 * Returns the block object, its hash (hex) and the signature (hex).
 */
export function createSignedSendBlock(params: SendBlockParams): {
  block: Record<string, string>;
  hash: string;
  signature: string;
} {
  const {
    privateKey,
    publicKey,
    previous,
    representative,
    balance,
    link,
  } = params;

  // 1️⃣ Prepare fields as raw bytes
  const account = publicKey; // 32 bytes
  const previousBytes = fromHex(padHex(previous, 32));
  const repPubKey = decodeAddress(representative);
  const balanceBytes = amountToBytes(balance);
  const linkPubKey = decodeAddress(link);

  // 2️⃣ Compute block hash (blake2b of concatenated fields)
  const hashInput = Buffer.concat([
    account,
    previousBytes,
    repPubKey,
    balanceBytes,
    linkPubKey,
  ]);
  const hashBytes = blake2b(hashInput, null, 32);
  const hashHex = toHex(hashBytes);

  // 3️⃣ Sign the hash with the sender's private key (ed25519)
  const signatureBytes = nacl.sign.detached(hashBytes, Buffer.concat([privateKey, publicKey]));
  const signatureHex = toHex(signatureBytes);

  // 4️⃣ Assemble the block in the JSON format used by Nano RPC
  const block = {
    type: 'send',
    account: encodeAddress(account),
    previous: padHex(previous, 32),
    representative,
    balance: padHex(BigInt(balance).toString(16), 16), // hex, 16 bytes
    link: encodeAddress(linkPubKey),
    signature: signatureHex,
    work: '0000000000000000', // placeholder; real work generation omitted for brevity
  };

  return { block, hash: hashHex, signature: signatureHex };
}

/**
 * Verify a signed Nano block.
 * Returns true if the signature matches the block hash.
 */
export function verifyBlock(block: Record<string, string>): boolean {
  const {
    account,
    previous,
    representative,
    balance,
    link,
    signature,
  } = block;

  const accountPub = decodeAddress(account);
  const previousBytes = fromHex(padHex(previous, 32));
  const repPub = decodeAddress(representative);
  const balanceBytes = amountToBytes(BigInt(balance).toString()); // balance is hex string
  const linkPub = decodeAddress(link);
  const signatureBytes = fromHex(signature);

  const hashInput = Buffer.concat([
    accountPub,
    previousBytes,
    repPub,
    balanceBytes,
    linkPub,
  ]);
  const hashBytes = blake2b(hashInput, null, 32);

  // Verify using the public key derived from the account address
  return nacl.sign.detached.verify(hashBytes, signatureBytes, accountPub);
}

// -----------------------------------------------------------------------------
// Example usage (can be removed in production)
// -----------------------------------------------------------------------------

if (require.main === module) {
  // Example: create a send block from a seed
  const seed = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
  const { privateKey, publicKey, address } = keypairFromSeed(seed);
  console.log('Sender address:', address);

  const destination = 'nano_3e3j5...replace_with_valid_address...';
  const previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const representative = address; // self‑representative for demo
  const newBalance = (BigInt('1000000000000000000000000') - BigInt('1000000000000000000')).toString(); // subtract 1 XNO (raw)

  const { block, hash, signature } = createSignedSendBlock({
    privateKey,
    publicKey,
    previous: previousHash,
    representative,
    balance: newBalance,
    link: destination,
  });

  console.log('Block hash:', hash);
  console.log('Signature:', signature);
  console.log('Block JSON:', JSON.stringify(block, null, 2));

  console.log('Verification result:', verifyBlock(block));
}