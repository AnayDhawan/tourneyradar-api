/**
 * Request ceilings per tier (issue #28).
 *
 * The API stays keyless. Anonymous callers keep the limit they have always
 * had, and a key is how somebody asks for a higher ceiling, not a gate on
 * access. Nothing here makes an endpoint require authentication.
 *
 * The numbers are deliberately generous. This serves cached, read-only
 * tournament data, so the limit exists to stop one runaway script exhausting
 * a free-tier backend for everyone, not to meter a product. If a legitimate
 * user hits a ceiling, the ceiling is wrong.
 *
 * No tier costs money and none is planned to. The names say what the tier is
 * for, not what it costs: an earlier draft called the top one "pro", which
 * reads as a paid plan on an API that is free and means to stay that way.
 */

export const TIERS = ['anonymous', 'free', 'bulk'] as const;
export type Tier = (typeof TIERS)[number];

export type TierLimit = {
  /** Requests allowed per minute. */
  perMinute: number;
  description: string;
};

export const TIER_LIMITS: Record<Tier, TierLimit> = {
  anonymous: {
    perMinute: 100,
    description: 'No key. The limit the API has always had, unchanged.',
  },
  free: {
    perMinute: 600,
    description: 'A key. Free, and enough to back a site or a bot without thinking about it.',
  },
  bulk: {
    perMinute: 6000,
    description: 'For bulk or high-frequency work. Also free, just ask and say what you are building.',
  },
};

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}

export function limitFor(tier: Tier): number {
  return TIER_LIMITS[tier].perMinute;
}
