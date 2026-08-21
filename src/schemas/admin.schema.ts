import { z } from "zod";
import { ALLOWED_SETTING_KEYS } from "../config/settings";

/**
 * PATCH /api/v2/admin/settings — body is a partial object mapping whitelisted
 * keys to boolean values (e.g. { events_registration_open: true }).
 * Unknown keys and non-boolean values are rejected with human-readable errors.
 * Unknown keys surface as field-level errors (errors.<key>) per the API contract.
 */
export const updateSettingsSchema = z
  .record(
    z.string(),
    z.boolean({ message: "Settings values must be true or false" }),
    { message: "Request body must be a JSON object of setting key/value pairs" }
  )
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one setting must be provided",
  })
  .superRefine((obj, ctx) => {
    for (const key of Object.keys(obj)) {
      if (!(ALLOWED_SETTING_KEYS as readonly string[]).includes(key)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown setting key: ${key}`,
          path: [key],
        });
      }
    }
  });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Parse + clamp page/pageSize query params into safe ranges. */
export function clampPagination(
  pageRaw: unknown,
  pageSizeRaw: unknown,
  maxPageSize: number
): { page: number; pageSize: number } {
  const page = Math.max(1, Number.parseInt(String(pageRaw ?? ""), 10) || 1);
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, Number.parseInt(String(pageSizeRaw ?? ""), 10) || 10)
  );
  return { page, pageSize };
}