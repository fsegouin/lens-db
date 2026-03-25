import { createRateLimit } from "@/lib/rate-limit";
import type { SessionUser } from "@/lib/user-auth";
import type { EntityType } from "@/lib/revisions";

const editLimiter = createRateLimit(30, "3600 s"); // 30 edits per hour

export type ProtectionLevel = "none" | "autoconfirmed" | "trusted" | "admin";

/**
 * Determine a user's trust tier based on account age and edit count.
 */
export function getUserTier(user: SessionUser): ProtectionLevel {
  if (user.role === "admin") return "admin";
  if (user.role === "trusted") return "trusted";

  const accountAge = Date.now() - (user.createdAt ? new Date(user.createdAt).getTime() : Date.now());
  const threeDays = 3 * 24 * 60 * 60 * 1000;

  if ((user.editCount ?? 0) >= 10 && accountAge >= threeDays) {
    return "autoconfirmed";
  }
  return "none";
}

/**
 * Check whether a user's tier meets the required protection level.
 */
const tierOrder: Record<ProtectionLevel, number> = {
  none: 0,
  autoconfirmed: 1,
  trusted: 2,
  admin: 3,
};

export function meetsProtectionLevel(
  userTier: ProtectionLevel,
  requiredLevel: ProtectionLevel
): boolean {
  return tierOrder[userTier] >= tierOrder[requiredLevel];
}

/**
 * Validate an edit request. Returns null if valid, or an error string.
 */
export async function validateEdit({
  user,
  entityType,
  protectionLevel,
  newData,
  oldData,
}: {
  user: SessionUser;
  entityType: EntityType;
  protectionLevel: string | null;
  newData: Record<string, unknown>;
  oldData: Record<string, unknown>;
}): Promise<string | null> {
  // Ban check
  if (user.isBanned) return "Your account is suspended";

  // Email verification check
  if (!user.emailVerifiedAt) return "Please verify your email before editing";

  // Protection level check
  const userTier = getUserTier(user);
  const required = (protectionLevel || "none") as ProtectionLevel;
  if (!meetsProtectionLevel(userTier, required)) {
    return `This ${entityType} is protected. You need ${required} status to edit it.`;
  }

  // Rate limit check
  const { success } = await editLimiter.limit(`edit:${user.id}`);
  if (!success) return "You've made too many edits recently. Please wait before editing again.";

  // Blanking detection: reject if >50% of non-null fields are being cleared
  const nonNullFields = Object.entries(oldData).filter(
    ([, v]) => v != null && v !== ""
  );
  if (nonNullFields.length > 0) {
    const blankedCount = nonNullFields.filter(([key]) => {
      const newVal = newData[key];
      return newVal === null || newVal === "" || newVal === undefined;
    }).length;
    if (blankedCount / nonNullFields.length > 0.5) {
      return "This edit would blank too many fields. If this is intentional, contact an admin.";
    }
  }

  // URL protocol validation
  if (newData.url != null && newData.url !== "" && newData.url !== null) {
    const url = String(newData.url);
    if (!/^https?:\/\//i.test(url)) {
      return "URL must start with http:// or https://";
    }
    if (url.length > 2000) {
      return "URL is too long (max 2000 characters)";
    }
  }

  // String length validation (prevent storage abuse)
  for (const [key, val] of Object.entries(newData)) {
    if (typeof val === "string" && val.length > 5000 && key !== "url") {
      return `${key} is too long (max 5000 characters)`;
    }
  }

  // Year validation
  for (const field of ["yearIntroduced", "yearDiscontinued"]) {
    const val = newData[field];
    if (val != null && val !== "") {
      const num = Number(val);
      if (isNaN(num) || num < 1800 || num > 2100 || !Number.isInteger(num)) {
        return `${field} must be a valid 4-digit year`;
      }
    }
  }

  // Numeric field validation
  for (const field of [
    "focalLengthMin", "focalLengthMax", "apertureMin", "apertureMax",
    "weightG", "filterSizeMm", "minFocusDistanceM", "maxMagnification",
    "megapixels",
  ]) {
    const val = newData[field];
    if (val != null && val !== "") {
      const num = Number(val);
      if (isNaN(num) || num < 0) {
        return `${field} must be a non-negative number`;
      }
    }
  }

  return null;
}
