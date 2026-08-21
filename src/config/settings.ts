/**
 * Global system toggles (V2 Module 01 — Super Admin Settings Hub).
 *
 * Whitelist of setting keys the SUPERADMIN may toggle via
 * PATCH /api/v2/admin/settings. Later modules extend this list when they ship
 * their own toggles (e.g. Module 07 adds a DataCamp scholarship setting).
 */

export const ALLOWED_SETTING_KEYS = [
  "events_registration_open",
  "merch_shop_open",
  "maintenance_mode",
] as const;

export type SettingKey = (typeof ALLOWED_SETTING_KEYS)[number];

export const SETTING_DESCRIPTIONS: Record<string, string> = {
  events_registration_open: "Whether event registrations are open across the portal",
  merch_shop_open: "Whether the merch pre-order shop is open",
  maintenance_mode: "Whether the entire portal is in maintenance mode",
};