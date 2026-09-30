/**
 * Downloads an NFT's image (for a submission's portrait, and later NFT looks).
 * The address comes from NFT metadata, which anyone who mints can write, so:
 * https only, the standard port, every address the name resolves to must be
 * public (checked at connection time, so a DNS change can't slip through),
 * at most 3 redirects (each checked the same way), a size cap and a timeout.
 */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import https from "node:https";
import { BlockList, isIP } from "node:net";

export type ImageFetcher = (url: string) => Promise<Buffer>;

// Separate lists: Node's BlockList matches IPv4 addresses against the IPv4-mapped
// IPv6 range (::ffff:0:0/96), so that range must never sit in the IPv4 list.
const blocked4 = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked4.addSubnet(net, bits, "ipv4");
// IPv4 wrapped in IPv6 (mapped ::ffff:0:0/96 and NAT64 64:ff9b::/96) is refused whole, whichever way it's written.
const blocked6 = new BlockList();
for (const [net, bits] of [["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32]] as const) {
  blocked6.addSubnet(net, bits, "ipv6");
}

/** Whether an IP address is on the public internet (not private, loopback, link-local, multicast or reserved). */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !blocked4.check(ip, "ipv4");
  if (family === 6) {
    const lower = ip.toLowerCase();
    // Dotted IPv4 inside IPv6 (::ffff:10.0.0.1) is refused like the hex form.
    if (/^(?:::ffff:|64:ff9b::)\d+\.\d+\.\d+\.\d+$/.test(lower)) return false;
    return !blocked6.check(lower, "ipv6");
  }
  return false;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS lookup that refuses any non-public address, for https.request. */
function publicLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} isn't a public address`), { code: "EBLOCKED" }), []);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}

export interface FetchImageOptions {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("not a valid address");
  }
  if (url.protocol !== "https:") throw new Error("only https images can be fetched");
  if (url.port !== "" && url.port !== "443") throw new Error("only the standard https port is allowed");
  if (url.username || url.password) throw new Error("addresses with passwords aren't allowed");
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ""))) throw new Error("that isn't a public address");
  return url;
}

export async function fetchImage(raw: string, opts: FetchImageOptions): Promise<Buffer> {
  let url = checkUrl(raw);
  for (let hop = 0; ; hop++) {
    const result = await new Promise<{ redirect: string } | { bytes: Buffer }>((resolve, reject) => {
      const req = https.get(url, { lookup: publicLookup as never, timeout: opts.timeoutMs ?? 10_000, headers: { accept: "image/*" } }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: new URL(res.headers.location, url).toString() });
        }
        if (status !== 200) {
          res.resume();
          return reject(new Error(`the image address answered HTTP ${status}`));
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > opts.maxBytes) {
          res.destroy();
          return reject(new Error("the image is too large"));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxBytes) {
            res.destroy();
            reject(new Error("the image is too large"));
          } else chunks.push(chunk);
        });
        res.on("end", () => resolve({ bytes: Buffer.concat(chunks) }));
        res.on("error", reject);
      });
      req.on("timeout", () => req.destroy(new Error("the image took too long")));
      req.on("error", reject);
    });
    if ("bytes" in result) return result.bytes;
    if (hop >= (opts.maxRedirects ?? 3)) throw new Error("too many redirects");
    url = checkUrl(result.redirect);
  }
}

/** The real fetcher, capped at `maxBytes`. */
export function imageFetcher(maxBytes: number): ImageFetcher {
  return (url) => fetchImage(url, { maxBytes });
}
