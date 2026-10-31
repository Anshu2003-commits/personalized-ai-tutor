import dns from "node:dns/promises";
import net from "node:net";
import {
  REPORT_REASONS,
  RESOURCE_TYPES,
  type ResourceDoc,
} from "@/lib/models/resource";

export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ReportReason = (typeof REPORT_REASONS)[number];

type Preview = {
  url: string;
  normalizedUrl: string;
  title: string;
  description: string | null;
  siteName: string | null;
  domain: string;
  thumbnailUrl: string | null;
  provider: string;
  youtubeVideoId: string | null;
};

const MAX_PREVIEW_BYTES = 200_000;
const PRIVATE_HOSTS = new Set(["localhost", "0.0.0.0"]);

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function isResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && RESOURCE_TYPES.includes(value as ResourceType);
}

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && REPORT_REASONS.includes(value as ReportReason);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export function computeRankScore(resource: Pick<ResourceDoc, "upvotedByClerkIds" | "reportCount" | "verified" | "createdAt">): number {
  const ageHours = Math.max(0, (Date.now() - new Date(resource.createdAt).getTime()) / 3_600_000);
  const recencyBonus = Math.max(0, 24 - ageHours) / 24;
  return (
    (resource.verified ? 1_000 : 0) +
    resource.upvotedByClerkIds.length * 3 -
    resource.reportCount * 6 +
    recencyBonus
  );
}

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }
  return false;
}

async function assertSafeUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https links are allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOSTS.has(host) || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Internal links are not allowed.");
  }
  if (net.isIP(host) && isPrivateIp(host)) {
    throw new Error("Private network links are not allowed.");
  }
  const records = await dns.lookup(host, { all: true }).catch(() => []);
  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error("Private network links are not allowed.");
  }
}

export async function normalizeResourceUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  await assertSafeUrl(parsed);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }
  return parsed;
}

export function youtubeVideoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return cleanText(url.pathname.slice(1), 32) || null;
  if (!["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) return null;
  if (url.pathname === "/watch") return cleanText(url.searchParams.get("v"), 32) || null;
  const match = url.pathname.match(/\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,32})/);
  return match?.[1] ?? null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function meta(html: string, names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
    const reverse = new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, "i");
    const found = html.match(re)?.[1] ?? html.match(reverse)?.[1];
    if (found) return cleanText(decodeHtml(found), 400);
  }
  return null;
}

async function fetchText(url: URL, redirects = 0): Promise<string | null> {
  if (redirects > 3) return null;
  await assertSafeUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) return null;
      return fetchText(new URL(location, url), redirects + 1);
    }
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("text/html") || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_PREVIEW_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
    }
    return new TextDecoder().decode(Buffer.concat(chunks, Math.min(total, MAX_PREVIEW_BYTES)));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function youtubePreview(url: URL, videoId: string): Promise<Partial<Preview>> {
  const oembed = new URL("https://www.youtube.com/oembed");
  oembed.searchParams.set("url", url.toString());
  oembed.searchParams.set("format", "json");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const res = await fetch(oembed, { signal: controller.signal });
    const data = res.ok ? ((await res.json()) as { title?: string; author_name?: string }) : null;
    return {
      title: cleanText(data?.title, 160) || "YouTube video",
      siteName: cleanText(data?.author_name, 120) || "YouTube",
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      provider: "youtube",
    };
  } catch {
    return {
      title: "YouTube video",
      siteName: "YouTube",
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      provider: "youtube",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildResourcePreview(rawUrl: string, titleOverride?: string, descriptionOverride?: string): Promise<Preview> {
  const url = await normalizeResourceUrl(rawUrl);
  const normalizedUrl = url.toString();
  const domain = url.hostname.replace(/^www\./, "");
  const videoId = youtubeVideoId(url);
  const yt = videoId ? await youtubePreview(url, videoId) : {};
  const html = videoId ? null : await fetchText(url);
  const title =
    cleanText(titleOverride, 160) ||
    yt.title ||
    (html ? meta(html, ["og:title", "twitter:title"]) : null) ||
    (html?.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ? cleanText(decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]), 160)
      : "") ||
    domain;
  const description =
    cleanText(descriptionOverride, 400) ||
    yt.description ||
    (html ? meta(html, ["og:description", "twitter:description", "description"]) : null);
  const image = yt.thumbnailUrl || (html ? meta(html, ["og:image", "twitter:image"]) : null);
  const thumbnailUrl = image ? new URL(image, url).toString() : null;

  return {
    url: normalizedUrl,
    normalizedUrl,
    title,
    description: description || null,
    siteName: yt.siteName || (html ? meta(html, ["og:site_name"]) : null),
    domain,
    thumbnailUrl,
    provider: yt.provider || "website",
    youtubeVideoId: videoId,
  };
}
