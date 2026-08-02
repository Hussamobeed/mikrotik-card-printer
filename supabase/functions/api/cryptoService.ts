// AES-256-GCM encryption for router passwords, using the Web Crypto API
// (available natively in the Deno/Edge Function runtime — no Node "crypto"
// module needed). The key comes from the ENCRYPTION_KEY secret (64 hex chars
// = 32 bytes), set via `supabase secrets set`.

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getKey(): Promise<CryptoKey> {
  const hex = Deno.env.get("ENCRYPTION_KEY");
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY secret must be a 64-character hex string (32 bytes)");
  }
  return crypto.subtle.importKey("raw", hexToBytes(hex), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Returns iv:ciphertext (both hex-encoded, ciphertext includes the GCM auth tag). */
export async function encrypt(plainText: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(cipherBuffer))}`;
}

/** Decrypts a string produced by encrypt(). Never return this to the frontend. */
export async function decrypt(payload: string): Promise<string> {
  const [ivHex, dataHex] = payload.split(":");
  if (!ivHex || !dataHex) throw new Error("Invalid encrypted payload format");
  const key = await getKey();
  const iv = hexToBytes(ivHex);
  const data = hexToBytes(dataHex);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plainBuffer);
}
