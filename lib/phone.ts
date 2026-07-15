import { z } from "zod";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export type NormalizeResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Normalizes human-entered phone input to E.164 (e.g. "+972501234567").
 * Accepts +, digits, spaces/dashes/dots/parens, and a leading "00" (treated
 * as a "+" prefix). Rejects bare national-format numbers -- there's no way
 * to safely guess a country code, so we ask the user to include one.
 */
export function normalizeToE164(raw: string): NormalizeResult {
  let value = raw.trim().replace(/[\s\-().]/g, "");

  if (value.startsWith("00")) {
    value = `+${value.slice(2)}`;
  }

  if (!value.startsWith("+")) {
    return {
      ok: false,
      error: "Include the country code, e.g. +972 50 123 4567",
    };
  }

  if (!E164_PATTERN.test(value)) {
    return {
      ok: false,
      error: "That doesn't look like a valid phone number",
    };
  }

  return { ok: true, value };
}

/** "" / undefined -> undefined; otherwise a normalized "+E.164" string or a validation issue. */
export const optionalWhatsappNumberSchema = z
  .string()
  .trim()
  .max(30)
  .optional()
  .or(z.literal(""))
  .transform((raw, ctx) => {
    if (!raw) return undefined;
    const result = normalizeToE164(raw);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.value;
  });
