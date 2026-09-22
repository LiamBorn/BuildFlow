/* =========================================================================
   A very small Redis client — enough for the rate limiter, and nothing else.

   Hand-rolled on node:net/node:tls for the same reason auth.ts is hand-rolled on
   node:crypto: the server installs no dependencies and runs offline. RESP is a
   simple protocol and the command surface here is one EVAL, so the client is
   small enough to read in one sitting.

   The thing that makes this safe to hand-roll is what happens when it breaks.
   Every caller treats a rejection as "Redis is not available" and falls back to
   the in-process limiter, which is what this server did before Redis existed. A
   bug in here therefore degrades to the previous behaviour rather than taking
   authentication down with it.

   Two details worth knowing:
   - RESP replies come back in the order the commands were sent, so pending
     callers sit in a FIFO queue and each reply resolves the oldest. There is no
     request id in the protocol to correlate with; the order IS the correlation.
   - Reconnection is lazy and backs off. Nothing retries a command across a
     reconnect: a command in flight when the socket dies is rejected, the caller
     falls back for that one request, and the next call opens a new connection.
   ========================================================================= */
import net from "node:net";
import tls from "node:tls";

export type RedisValue = string | number | null | RedisValue[];

const CRLF = "\r\n";
const CONNECT_TIMEOUT_MS = 2000;
const COMMAND_TIMEOUT_MS = 1000;
/** After a failure, wait this long before trying to connect again. */
const RETRY_BACKOFF_MS = [250, 1000, 5000, 15000];

type Pending = {
  resolve: (value: RedisValue) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

/** Encode a command the way Redis wants it: an array of bulk strings. */
function encode(args: (string | number)[]): string {
  let out = `*${args.length}${CRLF}`;
  for (const arg of args) {
    const value = String(arg);
    out += `$${Buffer.byteLength(value)}${CRLF}${value}${CRLF}`;
  }
  return out;
}

/**
 * Parse ONE reply starting at `offset`. Returns the value and where it ended, or
 * undefined when the buffer does not hold a whole reply yet — TCP delivers whatever
 * it has, so a half-arrived reply is normal and simply waits for more bytes.
 */
function parseReply(buf: Buffer, offset: number): { value: RedisValue; next: number } | undefined {
  if (offset >= buf.length) return undefined;
  const lineEnd = buf.indexOf(CRLF, offset);
  if (lineEnd === -1) return undefined;
  const type = buf[offset];
  const line = buf.toString("utf8", offset + 1, lineEnd);
  const afterLine = lineEnd + 2;

  switch (type) {
    case 0x2b: // '+' simple string
      return { value: line, next: afterLine };
    case 0x2d: // '-' error
      throw new RedisError(line);
    case 0x3a: // ':' integer
      return { value: Number(line), next: afterLine };
    case 0x24: {
      // '$' bulk string; -1 is the null bulk string
      const length = Number(line);
      if (length === -1) return { value: null, next: afterLine };
      const end = afterLine + length;
      if (buf.length < end + 2) return undefined;
      return { value: buf.toString("utf8", afterLine, end), next: end + 2 };
    }
    case 0x2a: {
      // '*' array; -1 is the null array
      const count = Number(line);
      if (count === -1) return { value: null, next: afterLine };
      const items: RedisValue[] = [];
      let cursor = afterLine;
      for (let i = 0; i < count; i += 1) {
        const item = parseReply(buf, cursor);
        if (!item) return undefined; // the array is not all here yet
        items.push(item.value);
        cursor = item.next;
      }
      return { value: items, next: cursor };
    }
    default:
      throw new RedisError(`Unexpected reply type ${String.fromCharCode(type)}`);
  }
}

export class RedisError extends Error {}

type Parsed = { host: string; port: number; password?: string; username?: string; db?: number; tls: boolean };

/** redis://[user:pass@]host[:port][/db], and rediss:// for TLS. */
export function parseRedisUrl(raw: string): Parsed {
  const url = new URL(raw);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error(`REDIS_URL must start with redis:// or rediss:// (got ${url.protocol})`);
  }
  const db = url.pathname.replace("/", "");
  return {
    host: url.hostname || "127.0.0.1",
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: db ? Number(db) : undefined,
    tls: url.protocol === "rediss:"
  };
}

export class RedisClient {
  private socket?: net.Socket;
  private buffer: Buffer = Buffer.alloc(0);
  private queue: Pending[] = [];
  private connecting?: Promise<void>;
  private failures = 0;
  private nextAttemptAt = 0;
  private closed = false;

  constructor(private readonly config: Parsed) {}

  static fromUrl(url: string): RedisClient {
    return new RedisClient(parseRedisUrl(url));
  }

  /** Send a command and wait for its reply. Rejects if Redis is unreachable or slow. */
  async command(...args: (string | number)[]): Promise<RedisValue> {
    await this.connect();
    const socket = this.socket;
    if (!socket) throw new RedisError("not connected");
    return new Promise<RedisValue>((resolve, reject) => {
      const timer = setTimeout(() => {
        // A timed-out command still has a reply coming, and replies are matched by
        // order — so the connection is dropped rather than left to hand that reply to
        // whoever asks next.
        this.fail(new RedisError("command timed out"));
      }, COMMAND_TIMEOUT_MS);
      this.queue.push({ resolve, reject, timer });
      socket.write(encode(args));
    });
  }

  /** Close for good. Used by tests and shutdown; a closed client never reconnects. */
  close() {
    this.closed = true;
    this.fail(new RedisError("client closed"));
    this.socket?.destroy();
    this.socket = undefined;
  }

  private connect(): Promise<void> {
    if (this.closed) return Promise.reject(new RedisError("client closed"));
    if (this.socket && !this.socket.destroyed) return Promise.resolve();
    if (this.connecting) return this.connecting;
    if (Date.now() < this.nextAttemptAt) {
      // Still inside the backoff window: fail fast rather than queue up behind a
      // connection that is not going to happen yet.
      return Promise.reject(new RedisError("backing off"));
    }

    this.connecting = new Promise<void>((resolve, reject) => {
      const onFailure = (error: Error) => {
        this.failures += 1;
        this.nextAttemptAt = Date.now() + RETRY_BACKOFF_MS[Math.min(this.failures - 1, RETRY_BACKOFF_MS.length - 1)];
        this.connecting = undefined;
        reject(error instanceof RedisError ? error : new RedisError(error.message));
      };

      const socket = this.config.tls
        ? tls.connect({ host: this.config.host, port: this.config.port, servername: this.config.host })
        : net.connect({ host: this.config.host, port: this.config.port });

      socket.setTimeout(CONNECT_TIMEOUT_MS, () => socket.destroy(new Error("connect timed out")));
      socket.once("error", onFailure);
      socket.once("connect", () => {
        socket.setTimeout(0); // the connect timeout must not become an idle timeout
        socket.removeListener("error", onFailure);
        socket.on("error", (error) => this.fail(new RedisError(error.message)));
        socket.on("close", () => this.fail(new RedisError("connection closed")));
        socket.on("data", (chunk) => this.onData(chunk));
        this.socket = socket;
        this.connecting = undefined;

        // AUTH and SELECT ride the same queue as everything else.
        const handshake: Promise<unknown>[] = [];
        if (this.config.password) {
          handshake.push(
            this.config.username
              ? this.command("AUTH", this.config.username, this.config.password)
              : this.command("AUTH", this.config.password)
          );
        }
        if (this.config.db) handshake.push(this.command("SELECT", this.config.db));
        Promise.all(handshake)
          .then(() => {
            this.failures = 0;
            resolve();
          })
          .catch((error) => {
            this.socket = undefined;
            socket.destroy();
            onFailure(error instanceof Error ? error : new Error(String(error)));
          });
      });
    });
    return this.connecting;
  }

  private onData(chunk: Buffer) {
    this.buffer = this.buffer.length === 0 ? chunk : (Buffer.concat([this.buffer, chunk]) as Buffer);
    for (;;) {
      let parsed: { value: RedisValue; next: number } | undefined;
      try {
        parsed = parseReply(this.buffer, 0);
      } catch (error) {
        // An error reply belongs to the oldest waiting caller, not to the connection.
        const pending = this.queue.shift();
        const lineEnd = this.buffer.indexOf(CRLF, 0);
        this.buffer = lineEnd === -1 ? Buffer.alloc(0) : this.buffer.subarray(lineEnd + 2);
        if (pending) {
          clearTimeout(pending.timer);
          pending.reject(error instanceof Error ? error : new RedisError(String(error)));
        }
        continue;
      }
      if (!parsed) return; // wait for the rest of it
      this.buffer = this.buffer.subarray(parsed.next);
      const pending = this.queue.shift();
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(parsed.value);
      }
    }
  }

  /** Drop the connection and reject everyone waiting on it. */
  private fail(error: Error) {
    const waiting = this.queue;
    this.queue = [];
    for (const pending of waiting) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.buffer = Buffer.alloc(0);
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = undefined;
    }
  }
}
