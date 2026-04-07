/**
 * Dynamic port allocation utilities.
 * Provides functions for allocating ephemeral ports and checking port availability.
 *
 * @module util/port-allocator
 */

import { createServer, type Server } from "net";

/** Default fallback port range when OS ephemeral allocation fails */
const DEFAULT_FALLBACK_RANGE = { min: 35000, max: 59999 };

/** Global registry to track allocated ports within a process */
const allocatedPorts = new Set<number>();

/**
 * Generate a random port within a range.
 *
 * @param min - Minimum port (inclusive)
 * @param max - Maximum port (inclusive)
 * @returns Random port within the range
 */
function randomInRange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Parse a port range string like "35000-59999".
 *
 * @param range - Range string
 * @returns Parsed min and max values
 */
export function parsePortRange(range: string): { min: number; max: number } {
  const parts = range.split("-").map((x) => parseInt(x.trim(), 10));
  const min = Number.isFinite(parts[0]) ? parts[0]! : DEFAULT_FALLBACK_RANGE.min;
  const max = Number.isFinite(parts[1]) ? parts[1]! : DEFAULT_FALLBACK_RANGE.max;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

/**
 * Get a fallback random port when OS allocation fails.
 *
 * @param range - Optional custom range
 * @returns Random port in the fallback range
 */
function getFallbackPort(range?: { min: number; max: number }): number {
  const { min, max } = range ?? DEFAULT_FALLBACK_RANGE;
  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    const port = randomInRange(min, max);
    if (!allocatedPorts.has(port)) {
      allocatedPorts.add(port);
      return port;
    }
    attempts++;
  }

  // If all attempts fail, just return a random port
  return randomInRange(min, max);
}

/**
 * Allocate an ephemeral TCP port by binding to port 0.
 * The OS assigns a random available port from its ephemeral range.
 *
 * @returns Promise resolving to an available port number
 *
 * @example
 * ```typescript
 * const port = await getRandomPort();
 * console.log(`Got port: ${port}`);
 * ```
 */
export async function getRandomPort(): Promise<number> {
  return new Promise((resolve) => {
    const server: Server = createServer();

    const finish = () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      allocatedPorts.add(port);
      try {
        server.close(() => resolve(port));
      } catch {
        resolve(port);
      }
    };

    server.once("error", () => {
      // Fallback for restricted sandboxes
      resolve(getFallbackPort());
    });

    try {
      // Bind on IPv4 loopback to avoid :: issues in sandboxed environments
      server.listen(0, "127.0.0.1", finish);
    } catch {
      resolve(getFallbackPort());
    }
  });
}

/**
 * Probe for a free TCP port within a specific range.
 *
 * @param min - Minimum port (inclusive)
 * @param max - Maximum port (inclusive)
 * @returns Promise resolving to an available port in the range
 *
 * @example
 * ```typescript
 * const port = await getRandomPortInRange(3000, 4000);
 * console.log(`Got port: ${port}`);
 * ```
 */
export async function getRandomPortInRange(min: number, max: number): Promise<number> {
  const lo = min | 0;
  const hi = max | 0;
  if (hi < lo) {
    throw new Error(`Invalid port range: ${min}-${max}`);
  }

  const count = hi - lo + 1;
  const candidates = Array.from({ length: count }, (_, i) => lo + i);

  // Shuffle candidates for random selection
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }

  for (const port of candidates) {
    if (port <= 1024) continue; // Skip privileged ports
    if (allocatedPorts.has(port)) continue;

    const available = await isPortAvailable(port);
    if (available) {
      allocatedPorts.add(port);
      return port;
    }
  }

  // Fallback: return a random candidate without probing
  const fallback = candidates[Math.floor(Math.random() * candidates.length)]!;
  allocatedPorts.add(fallback);
  return fallback;
}

/**
 * Check if a TCP port is available on 127.0.0.1.
 *
 * @param port - Port number to check
 * @returns Promise resolving to true if available
 *
 * @example
 * ```typescript
 * if (await isPortAvailable(3000)) {
 *   console.log('Port 3000 is available');
 * }
 * ```
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  const p = Number(port) | 0;
  if (p <= 0) return false;

  return new Promise((resolve) => {
    const server: Server = createServer();

    const done = (result: boolean) => {
      try {
        server.close(() => resolve(result));
      } catch {
        resolve(result);
      }
    };

    server.once("error", () => done(false));

    try {
      server.listen(p, "127.0.0.1", () => done(true));
    } catch {
      done(false);
    }
  });
}

/**
 * Allocate multiple random ports.
 *
 * @param count - Number of ports to allocate
 * @returns Promise resolving to array of available ports
 *
 * @example
 * ```typescript
 * const [httpPort, wsPort] = await getMultiplePorts(2);
 * ```
 */
export async function getMultiplePorts(count: number): Promise<number[]> {
  const ports: number[] = [];
  for (let i = 0; i < count; i++) {
    ports.push(await getRandomPort());
  }
  return ports;
}

/**
 * Release a previously allocated port from tracking.
 * Call this when a port is no longer in use to allow reallocation.
 *
 * @param port - Port number to release
 */
export function releasePort(port: number): void {
  allocatedPorts.delete(port);
}

/**
 * Clear all tracked port allocations.
 * Useful for test cleanup.
 */
export function clearAllocatedPorts(): void {
  allocatedPorts.clear();
}

/**
 * Get all currently tracked allocated ports.
 *
 * @returns Set of allocated port numbers
 */
export function getAllocatedPorts(): Set<number> {
  return new Set(allocatedPorts);
}
