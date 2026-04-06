// =============================================================================
// AL FILO — API Security Layer
//
// Shared input sanitization, validation, and security utilities.
// All API routes MUST use these before processing user input.
// =============================================================================

/**
 * Sanitize a string input: remove SQL injection patterns, null bytes,
 * control characters, and limit length.
 */
export function sanitizeString(input: string, maxLength = 200): string {
  if (!input || typeof input !== "string") return "";

  let s = input
    .replace(/\0/g, "")                    // null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // control chars (keep \n \r \t)
    .trim()
    .slice(0, maxLength);

  // Strip common SQL injection patterns
  const SQL_PATTERNS = [
    /--/g,           // SQL comments
    /;/g,            // statement terminators
    /\/\*/g,         // block comment start
    /\*\//g,         // block comment end
    /xp_/gi,         // extended stored procs
    /UNION\s+SELECT/gi,
    /INSERT\s+INTO/gi,
    /DROP\s+TABLE/gi,
    /ALTER\s+TABLE/gi,
    /DELETE\s+FROM/gi,
    /UPDATE\s+.*SET/gi,
    /EXEC(\s|\()/gi,
    /EXECUTE(\s|\()/gi,
  ];

  for (const pattern of SQL_PATTERNS) {
    s = s.replace(pattern, "");
  }

  return s.trim();
}

/**
 * Validate and clamp an integer within bounds.
 */
export function validateInt(
  value: any,
  defaultVal: number,
  min: number,
  max: number,
): number {
  const parsed = parseInt(String(value), 10);
  if (isNaN(parsed)) return defaultVal;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Validate a sort column against a whitelist. Returns the safe column or default.
 */
export function validateSortColumn(
  input: string,
  whitelist: Record<string, string>,
  defaultCol: string,
): string {
  const cleaned = sanitizeString(input, 50);
  return whitelist[cleaned] ? cleaned : defaultCol;
}

/**
 * Validate sort direction — only ASC or DESC allowed.
 */
export function validateSortDir(input: any): "ASC" | "DESC" {
  return String(input).toUpperCase() === "DESC" ? "DESC" : "ASC";
}

/**
 * Validate a value against a strict whitelist of allowed string values.
 */
export function validateWhitelist<T extends string>(
  input: any,
  allowed: readonly T[],
  defaultVal: T,
): T {
  const cleaned = sanitizeString(String(input || ""), 100);
  return (allowed as readonly string[]).includes(cleaned)
    ? (cleaned as T)
    : defaultVal;
}

/**
 * Parse JSON body from a POST request safely.
 * Returns null if body is invalid.
 */
export async function parsePostBody<T = Record<string, any>>(
  request: Request,
): Promise<T | null> {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;

    const text = await request.text();
    if (!text || text.length > 50_000) return null; // Max 50KB body

    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Standard security headers for API responses.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

/**
 * Build NextResponse headers merging security + cache headers.
 */
export function secureHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return { ...SECURITY_HEADERS, ...(extra || {}) };
}

/**
 * Validate an array of IDs (UUIDs or references).
 * Strips any that contain suspicious characters.
 */
export function validateIds(
  input: string | string[],
  maxCount = 10,
): string[] {
  const raw = Array.isArray(input) ? input : String(input).split(",");
  return raw
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && id.length < 200)
    .filter((id) => /^[a-zA-Z0-9_.-]+$/.test(id)) // Only safe chars
    .slice(0, maxCount);
}
