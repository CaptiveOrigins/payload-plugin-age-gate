/**
 * Ages by place: the age of digital consent (the youngest age someone may sign up without a parent's consent) and the
 * age of majority (legal adult). Keys are ISO 3166-1 alpha-2 country codes, or "CC-RR" for a region whose age differs
 * from its country's (US states, for example).
 *
 * NOT LEGAL ADVICE, AND NOT YET CHECKED BY COUNSEL. These values come from public summaries of GDPR Article 8 national
 * choices, COPPA (US) and national civil codes, as at 2026-11. Each site using this plugin must have its own lawyer
 * check them for the places it serves before relying on them. Pass your own `ages` option to override any entry.
 */
export type AgeRule = {
  /** Youngest age to sign up without a parent's consent. */
  consent: number
  /** Age of majority: an adult from this age. */
  majority: number
  note?: string
}

/** Used for any place not in the table. */
export const DEFAULT_RULE: AgeRule = { consent: 13, majority: 18 }

const EU = (consent: number): AgeRule => ({ consent, majority: 18, note: 'GDPR Art. 8 national age' })

export const AGES: Record<string, AgeRule> = {
  // European Union (GDPR Art. 8: 13 to 16, chosen by each member state)
  AT: EU(14), BE: EU(13), BG: EU(14), HR: EU(16), CY: EU(14), CZ: EU(15), DK: EU(13), EE: EU(13), FI: EU(13),
  FR: EU(15), DE: EU(16), GR: EU(15), HU: EU(16), IE: EU(16), IT: EU(14), LV: EU(13), LT: EU(14), LU: EU(16),
  MT: EU(13), NL: EU(16), PL: EU(16), PT: EU(13), RO: EU(16), SK: EU(16), SI: EU(15), ES: EU(14), SE: EU(13),
  // European Economic Area and nearby
  NO: { consent: 13, majority: 18 }, IS: { consent: 13, majority: 18 }, LI: { consent: 16, majority: 18 }, CH: { consent: 16, majority: 18 },
  GB: { consent: 13, majority: 18, note: 'UK GDPR' },
  // Americas
  US: { consent: 13, majority: 18, note: 'COPPA; majority varies by state' },
  'US-AL': { consent: 13, majority: 19 }, 'US-NE': { consent: 13, majority: 19 }, 'US-MS': { consent: 13, majority: 21 },
  CA: { consent: 13, majority: 18, note: 'majority 19 in some provinces' },
  'CA-BC': { consent: 13, majority: 19 }, 'CA-NB': { consent: 13, majority: 19 }, 'CA-NL': { consent: 13, majority: 19 }, 'CA-NS': { consent: 13, majority: 19 }, 'CA-NT': { consent: 13, majority: 19 }, 'CA-NU': { consent: 13, majority: 19 }, 'CA-YT': { consent: 13, majority: 19 },
  MX: { consent: 13, majority: 18 }, BR: { consent: 13, majority: 18 },
  // Asia and Pacific
  JP: { consent: 13, majority: 18 }, KR: { consent: 14, majority: 19 }, TW: { consent: 13, majority: 18 }, CN: { consent: 14, majority: 18 },
  TH: { consent: 13, majority: 20 }, ID: { consent: 13, majority: 21 }, SG: { consent: 13, majority: 21 },
  AU: { consent: 13, majority: 18 }, NZ: { consent: 13, majority: 18 },
  // Others
  RU: { consent: 14, majority: 18 }, UA: { consent: 14, majority: 18 },
}

/**
 * The rule for a place: the region's if given and listed, else the country's. Protective by default (kids first):
 * when a country has regional rules and no region is given, the highest consent and majority among them is used.
 */
export function ruleFor(country: string, region?: string | null, ages: Record<string, AgeRule> = AGES): AgeRule {
  const c = country.trim().toUpperCase()
  const r = region?.trim().toUpperCase()
  if (r && ages[`${c}-${r}`]) return ages[`${c}-${r}`]!
  const base = ages[c] ?? DEFAULT_RULE
  if (r) return base // a region with no rule of its own follows its country
  const regional = Object.entries(ages).filter(([k]) => k.startsWith(`${c}-`)).map(([, v]) => v)
  if (!regional.length) return base
  return { consent: Math.max(base.consent, ...regional.map((x) => x.consent)), majority: Math.max(base.majority, ...regional.map((x) => x.majority)), note: 'highest of its regions (no region given)' }
}

/** The highest age of majority anywhere in the table: the cap on how long anyone stays a minor. */
export const maxMajority = (ages: Record<string, AgeRule> = AGES) => Math.max(DEFAULT_RULE.majority, ...Object.values(ages).map((a) => a.majority))
