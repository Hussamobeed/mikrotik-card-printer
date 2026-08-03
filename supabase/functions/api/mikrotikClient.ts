// Minimal RouterOS API client implemented directly against the documented
// binary protocol (https://wiki.mikrotik.com/wiki/Manual:API), using Deno's
// native TCP socket API. This replaces the Node "node-routeros" library,
// which cannot run in the Supabase Edge Function (Deno) runtime.
//
// IMPORTANT: this talks the *modern* plain-text login flow (RouterOS >= 6.43,
// released 2018). Routers on older firmware need the legacy MD5
// challenge-response login and are NOT supported by this client.
//
// This has not been tested against a live router — verify carefully before
// relying on it in production, especially the export/import flow.

export interface RouterOSConnection {
  write(words: string[]): Promise<void>;
  readSentence(): Promise<{ reply: string; attrs: Record<string, string> }>;
  /** Sends a command and collects all "!re" rows until "!done". */
  command(words: string[]): Promise<Record<string, string>[]>;
  close(): void;
}

function encodeLength(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  if (len < 0x4000) return new Uint8Array([0x80 | (len >> 8), len & 0xff]);
  if (len < 0x200000) {
    return new Uint8Array([0xc0 | (len >> 16), (len >> 8) & 0xff, len & 0xff]);
  }
  if (len < 0x10000000) {
    return new Uint8Array([
      0xe0 | (len >> 24),
      (len >> 16) & 0xff,
      (len >> 8) & 0xff,
      len & 0xff,
    ]);
  }
  return new Uint8Array([
    0xf0,
    (len >>> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
  ]);
}

class ByteReader {
  private buffer = new Uint8Array(0);

  constructor(private conn: Deno.Conn) {}

  private async fill(min: number): Promise<void> {
    while (this.buffer.length < min) {
      const chunk = new Uint8Array(4096);
      const n = await this.conn.read(chunk);
      if (n === null) throw new Error("MikroTik connection closed unexpectedly");
      const merged = new Uint8Array(this.buffer.length + n);
      merged.set(this.buffer, 0);
      merged.set(chunk.subarray(0, n), this.buffer.length);
      this.buffer = merged;
    }
  }

  async readByte(): Promise<number> {
    await this.fill(1);
    const b = this.buffer[0];
    this.buffer = this.buffer.subarray(1);
    return b;
  }

  async readBytes(n: number): Promise<Uint8Array> {
    if (n === 0) return new Uint8Array(0);
    await this.fill(n);
    const out = this.buffer.subarray(0, n);
    this.buffer = this.buffer.subarray(n);
    return out;
  }

  async readWordLength(): Promise<number> {
    const b0 = await this.readByte();
    if ((b0 & 0x80) === 0) return b0;
    if ((b0 & 0xc0) === 0x80) {
      const b1 = await this.readByte();
      return ((b0 & 0x3f) << 8) | b1;
    }
    if ((b0 & 0xe0) === 0xc0) {
      const b1 = await this.readByte();
      const b2 = await this.readByte();
      return ((b0 & 0x1f) << 16) | (b1 << 8) | b2;
    }
    if ((b0 & 0xf0) === 0xe0) {
      const b1 = await this.readByte();
      const b2 = await this.readByte();
      const b3 = await this.readByte();
      return ((b0 & 0x0f) << 24) | (b1 << 16) | (b2 << 8) | b3;
    }
    const b1 = await this.readByte();
    const b2 = await this.readByte();
    const b3 = await this.readByte();
    const b4 = await this.readByte();
    return (b1 << 24) | (b2 << 16) | (b3 << 8) | b4;
  }

  async readWord(): Promise<string | null> {
    const len = await this.readWordLength();
    if (len === 0) return null; // end of sentence
    const bytes = await this.readBytes(len);
    return new TextDecoder().decode(bytes);
  }
}

export async function connectRouterOS(params: {
  host: string;
  port: number;
  username: string;
  password: string;
  ssl: boolean;
  timeoutMs?: number;
}): Promise<RouterOSConnection> {
  const conn = params.ssl
    ? await Deno.connectTls({ hostname: params.host, port: params.port })
    : await Deno.connect({ hostname: params.host, port: params.port });

  const reader = new ByteReader(conn);

  async function write(words: string[]): Promise<void> {
    const parts: Uint8Array[] = [];
    for (const word of words) {
      const wordBytes = new TextEncoder().encode(word);
      parts.push(encodeLength(wordBytes.length), wordBytes);
    }
    parts.push(new Uint8Array([0])); // end of sentence
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      out.set(p, offset);
      offset += p.length;
    }
    await conn.write(out);
  }

  async function readSentence(): Promise<{ reply: string; attrs: Record<string, string> }> {
    const words: string[] = [];
    while (true) {
      const word = await reader.readWord();
      if (word === null) break;
      words.push(word);
    }
    const reply = words[0] ?? "";
    const attrs: Record<string, string> = {};
    for (const w of words.slice(1)) {
      const eq = w.indexOf("=", 1);
      if (w.startsWith("=") && eq > 0) {
        attrs[w.slice(1, eq)] = w.slice(eq + 1);
      }
    }
    return { reply, attrs };
  }

  async function command(words: string[]): Promise<Record<string, string>[]> {
    await write(words);
    const rows: Record<string, string>[] = [];
    while (true) {
      const { reply, attrs } = await readSentence();
      if (reply === "!re") {
        rows.push(attrs);
      } else if (reply === "!done") {
        return rows;
      } else if (reply === "!trap" || reply === "!fatal") {
        throw new Error(attrs.message ?? `MikroTik API error (${reply})`);
      }
    }
  }

  async function login(): Promise<void> {
    await write(["/login", `=name=${params.username}`, `=password=${params.password}`]);
    const { reply, attrs } = await readSentence();
    if (reply === "!trap" || reply === "!fatal") {
      throw new Error(attrs.message ?? "MikroTik login failed");
    }
    if (reply !== "!done") {
      throw new Error(`Unexpected login response: ${reply}`);
    }
  }

  try {
    await login();
  } catch (err) {
    conn.close();
    throw err;
  }

  return {
    write,
    readSentence,
    command,
    close: () => {
      try {
        conn.close();
      } catch {
        /* already closed */
      }
    },
  };
}
