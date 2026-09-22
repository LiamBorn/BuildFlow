/**
 * The hand-rolled RESP client, driven over a real TCP socket.
 *
 * This is the part of the Redis work with no library behind it, so it is tested against an
 * actual server rather than a stub: chunked delivery, reply ordering, error replies, and
 * what happens when the connection goes away. The rate limiter treats every rejection as
 * "fall back to counting in this process", so the failures below are survivable by
 * design — but they still have to be failures and not wrong answers.
 */
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { RedisClient, parseRedisUrl } from "../src/redis.js";

type Handler = (command: string[], socket: net.Socket) => void;

const servers: net.Server[] = [];
const clients: RedisClient[] = [];

afterEach(() => {
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) s.close();
});

/** A server that speaks just enough RESP to answer whatever the test needs. */
async function fakeServer(handler: Handler): Promise<string> {
  const server = net.createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      // Commands arrive as *N\r\n$len\r\n<arg>\r\n… — pull off whole ones.
      for (;;) {
        if (!buffer.startsWith("*")) return;
        const lines = buffer.split("\r\n");
        const count = Number(lines[0].slice(1));
        const needed = 1 + count * 2;
        if (lines.length < needed + 1) return;
        const args: string[] = [];
        for (let i = 0; i < count; i += 1) args.push(lines[2 + i * 2]);
        buffer = lines.slice(needed).join("\r\n");
        handler(args, socket);
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  return `redis://127.0.0.1:${port}`;
}

function clientFor(url: string) {
  const client = RedisClient.fromUrl(url);
  clients.push(client);
  return client;
}

describe("reading replies", () => {
  it("parses each reply type", async () => {
    const url = await fakeServer(([verb], socket) => {
      if (verb === "SIMPLE") socket.write("+PONG\r\n");
      else if (verb === "INT") socket.write(":42\r\n");
      else if (verb === "BULK") socket.write("$5\r\nhello\r\n");
      else if (verb === "NIL") socket.write("$-1\r\n");
      else if (verb === "ARR") socket.write("*3\r\n:1\r\n$2\r\nhi\r\n*1\r\n:7\r\n");
      else socket.write("+OK\r\n");
    });
    const client = clientFor(url);
    expect(await client.command("SIMPLE")).toBe("PONG");
    expect(await client.command("INT")).toBe(42);
    expect(await client.command("BULK")).toBe("hello");
    expect(await client.command("NIL")).toBeNull();
    expect(await client.command("ARR")).toEqual([1, "hi", [7]]);
  });

  /** TCP does not deliver messages, it delivers bytes — a reply split over packets is normal. */
  it("waits for a reply that arrives in pieces", async () => {
    const url = await fakeServer((_c, socket) => {
      socket.write("$11\r\nhel");
      setTimeout(() => socket.write("lo wor"), 10);
      setTimeout(() => socket.write("ld\r\n"), 20);
    });
    expect(await clientFor(url).command("GET", "x")).toBe("hello world");
  });

  /**
   * RESP has no request id: replies come back in the order the commands went out, so the
   * order IS the correlation. If this is wrong, one caller silently receives another's
   * answer — a limiter would read somebody else's count.
   */
  it("gives each caller its own reply when several are in flight", async () => {
    const url = await fakeServer(([, n], socket) => socket.write(`:${n}\r\n`));
    const client = clientFor(url);
    const answers = await Promise.all([1, 2, 3, 4, 5].map((n) => client.command("ECHO", n)));
    expect(answers).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects the caller an error belongs to, and keeps taking commands", async () => {
    const url = await fakeServer(([verb], socket) => {
      if (verb === "BAD") socket.write("-ERR something went wrong\r\n");
      else socket.write("+OK\r\n");
    });
    const client = clientFor(url);
    await expect(client.command("BAD")).rejects.toThrow(/something went wrong/);
    expect(await client.command("GOOD"), "the connection survived the error").toBe("OK");
  });
});

describe("when the connection is not there", () => {
  it("rejects rather than hanging when nothing is listening", async () => {
    // Port 1 on loopback: reserved, and nothing will be on it.
    const client = clientFor("redis://127.0.0.1:1");
    await expect(client.command("PING")).rejects.toThrow();
  });

  it("rejects whoever was waiting when the server goes away mid-command", async () => {
    const url = await fakeServer((_c, socket) => socket.destroy());
    await expect(clientFor(url).command("PING")).rejects.toThrow();
  });

  it("backs off instead of hammering a server that is refusing", async () => {
    const client = clientFor("redis://127.0.0.1:1");
    await expect(client.command("PING")).rejects.toThrow();
    const startedAt = Date.now();
    // The second attempt is inside the backoff window, so it fails immediately rather
    // than spending another connect timeout on it.
    await expect(client.command("PING")).rejects.toThrow(/backing off/);
    expect(Date.now() - startedAt).toBeLessThan(100);
  });
});

describe("the connection url", () => {
  it("sends AUTH and SELECT when the url carries them", async () => {
    const seen: string[][] = [];
    const url = await fakeServer((command, socket) => {
      seen.push(command);
      socket.write("+OK\r\n");
    });
    const withCreds = url.replace("redis://", "redis://alice:s3cret@") + "/4";
    const client = clientFor(withCreds);
    await client.command("PING");
    expect(seen[0]).toEqual(["AUTH", "alice", "s3cret"]);
    expect(seen[1]).toEqual(["SELECT", "4"]);
    expect(seen[2]).toEqual(["PING"]);
  });

  it("refuses a url that is not redis", () => {
    expect(() => parseRedisUrl("postgres://localhost")).toThrow(/redis:\/\//);
  });
});
