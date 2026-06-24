/**
 * Same-origin guard for the typed JSON route framework.
 * Extracted from apps/daemon/src/http/origin-guard.ts with
 * origin-validation logic inlined to remove the design-specific dependency.
 */

import type { Request } from 'express';
import { createApiError } from '@od-kernel/types';
import { err, ok, type Result } from './types.js';

export interface OriginContext {
  resolvedPortRef: { current: number };
}

// ---- Inlined from apps/daemon/src/origin-validation.ts ----

interface ParsedHostHeader {
  hostname: string;
  host: string;
  port: string;
}

interface RequestWithOriginHeaders {
  headers?: {
    host?: unknown;
    origin?: unknown;
    'sec-fetch-site'?: unknown;
  };
}

function headerValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return first == null ? undefined : String(first);
  }
  return value == null ? undefined : String(value);
}

function parseHostHeader(value: unknown): ParsedHostHeader | null {
  const raw = String(headerValue(value) || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(`http://${raw}`);
    return {
      hostname: parsed.hostname,
      host: parsed.host,
      port: parsed.port || '80',
    };
  } catch {
    return null;
  }
}

function isPrivateIpv4(hostname: unknown): boolean {
  const parts = String(hostname || '').split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map(Number);
  if (nums.some(isNaN)) return false;
  const [a, b] = nums as [number, number, number, number];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  return false;
}

function isIpLiteralHostname(hostname: unknown): boolean {
  const s = String(hostname || '');
  // IPv4 check
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) {
    const parts = s.split('.').map(Number);
    if (parts.length === 4 && parts.every((n) => n >= 0 && n <= 255)) return true;
  }
  // IPv6 check
  if (s.startsWith('[') && s.endsWith(']')) return true;
  if (s.includes(':')) return true;
  return false;
}

function isLoopbackOrPrivateLanHost(hostname: string): boolean {
  if (['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) return true;
  // 0.0.0.0 means "all interfaces" — it is NOT a loopback address and
  // should never be treated as safe/local. An attacker on the same network
  // can craft a Host header with 0.0.0.0 to bypass the same-origin guard.
  return isPrivateIpv4(hostname);
}

function configuredAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.OD_ALLOWED_ORIGINS || '';
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(
          'OD_ALLOWED_ORIGINS only supports http:// and https:// origins',
        );
      }
      return parsed.origin;
    });
}

function configuredAllowedHosts(origins = configuredAllowedOrigins()): string[] {
  return origins.map((origin) => new URL(origin).host);
}

function allowedBrowserPorts(
  port: number | string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number[] {
  const ports: number[] = [];
  const primary = Number(port);
  // Port 0 is valid (kernel-assigned ephemeral) — must not be filtered out.
  if (!isNaN(primary) && port !== null && port !== undefined && port !== '') {
    ports.push(primary);
  }
  const webPort = Number(env.OD_WEB_PORT);
  if (!isNaN(webPort) && webPort !== primary) ports.push(webPort);
  return ports;
}

function isAllowedBrowserHost(
  hostHeader: unknown,
  ports: number[],
  bindHost: string,
  extraAllowedOrigins: string[],
): boolean {
  const requestHost = parseHostHeader(hostHeader);
  if (!requestHost) return false;

  const loopbackHosts = ['127.0.0.1', 'localhost', '[::1]'];
  const explicitHosts = new Set([
    ...ports.flatMap((p) => [
      ...loopbackHosts.map((h) => `${h}:${p}`),
      `${bindHost}:${p}`,
    ]),
    ...configuredAllowedHosts(extraAllowedOrigins),
  ]);
  if (explicitHosts.has(requestHost.host)) return true;

  if (!ports.map(String).includes(requestHost.port)) return false;
  return isLoopbackOrPrivateLanHost(requestHost.hostname);
}

function isAllowedBrowserOrigin(
  origin: unknown,
  hostHeader: unknown,
  ports: number[],
  bindHost: string,
  extraAllowedOrigins: string[],
): boolean {
  if (extraAllowedOrigins.includes(String(origin))) return true;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(String(origin));
  } catch {
    return false;
  }
  if (
    parsedOrigin.protocol !== 'http:' &&
    parsedOrigin.protocol !== 'https:'
  )
    return false;

  const requestHost = parseHostHeader(hostHeader);
  if (!requestHost) return false;

  const schemes = ['http', 'https'];
  const loopbackHosts = ['127.0.0.1', 'localhost', '[::1]'];
  const explicitOrigins = new Set(
    ports.flatMap((p) => [
      ...schemes.flatMap((s) => loopbackHosts.map((h) => `${s}://${h}:${p}`)),
      ...schemes.map((s) => `${s}://${bindHost}:${p}`),
    ]),
  );
  if (explicitOrigins.has(String(origin))) return true;

  const originPort =
    parsedOrigin.port ||
    (parsedOrigin.protocol === 'https:' ? '443' : '80');
  if (!ports.map(String).includes(originPort)) return false;
  if (parsedOrigin.hostname !== requestHost.hostname) return false;
  return isLoopbackOrPrivateLanHost(parsedOrigin.hostname);
}

function isLocalSameOrigin(
  req: RequestWithOriginHeaders,
  port: number | string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const host = String(headerValue(req.headers?.host) || '');
  const origin = headerValue(req.headers?.origin);
  const ports = allowedBrowserPorts(port, env);
  const bindHost = env.OD_BIND_HOST || '127.0.0.1';
  let extraAllowedOrigins: string[];
  try {
    extraAllowedOrigins = configuredAllowedOrigins(env);
  } catch {
    console.error('[origin-guard] OD_ALLOWED_ORIGINS contains an invalid URL — ignoring.');
    extraAllowedOrigins = [];
  }
  const ipOnlyExtraOrigins = extraAllowedOrigins.filter((o) =>
    isIpLiteralHostname(new URL(o).hostname),
  );

  const localHostAllowed = isAllowedBrowserHost(
    host,
    ports,
    bindHost,
    ipOnlyExtraOrigins,
  );
  if (origin == null || origin === '') {
    if (localHostAllowed) return true;
    const fetchSite = headerValue(req.headers?.['sec-fetch-site']);
    if (fetchSite === 'same-origin') {
      return isAllowedBrowserHost(host, ports, bindHost, extraAllowedOrigins);
    }
    return false;
  }
  if (extraAllowedOrigins.includes(origin)) return true;
  if (!isAllowedBrowserHost(host, ports, bindHost, extraAllowedOrigins))
    return false;
  return isAllowedBrowserOrigin(
    origin,
    host,
    ports,
    bindHost,
    extraAllowedOrigins,
  );
}

// ---- Public API ----

/**
 * Adapter wrapper around `isLocalSameOrigin` that yields a `Result` so the
 * HTTP Adapter can fold the origin decision into the same error-handling
 * pipeline as parse/handle failures.
 */
export function guardSameOrigin(
  req: Request,
  origin: OriginContext,
): Result<void> {
  if (isLocalSameOrigin(req, origin.resolvedPortRef.current)) {
    return ok(undefined);
  }
  return err(createApiError('FORBIDDEN', 'cross-origin request rejected'));
}
