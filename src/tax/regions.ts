export type Country = 'CA' | 'US';

export interface Location {
  country: Country;
  region: string;
}

/** `abbr` is the compact tag used in the top-rack pills. */
export const COUNTRIES: { code: Country; name: string; short: string; abbr: string; regionWord: string }[] = [
  { code: 'CA', name: 'Canada', short: 'Canada', abbr: 'CAN', regionWord: 'Province / territory' },
  { code: 'US', name: 'United States', short: 'U.S.', abbr: 'U.S.', regionWord: 'State' },
];

export const REGIONS: Record<Country, { code: string; name: string }[]> = {
  CA: [
    { code: 'AB', name: 'Alberta' },
    { code: 'BC', name: 'British Columbia' },
    { code: 'MB', name: 'Manitoba' },
    { code: 'NB', name: 'New Brunswick' },
    { code: 'NL', name: 'Newfoundland and Labrador' },
    { code: 'NT', name: 'Northwest Territories' },
    { code: 'NS', name: 'Nova Scotia' },
    { code: 'NU', name: 'Nunavut' },
    { code: 'ON', name: 'Ontario' },
    { code: 'PE', name: 'Prince Edward Island' },
    { code: 'QC', name: 'Quebec' },
    { code: 'SK', name: 'Saskatchewan' },
    { code: 'YT', name: 'Yukon' },
  ],
  US: [
    ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
    ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
    ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
    ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
    ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'],
    ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
    ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
    ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'],
    ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
    ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'],
    ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ].map(([code, name]) => ({ code, name })),
};

export const DEFAULT_REGION: Record<Country, string> = { CA: 'NB', US: 'ME' };
export const DEFAULT_LOCATION: Location = { country: 'CA', region: 'NB' };

export const countryOf = (c: Country) => COUNTRIES.find((x) => x.code === c)!;
export const regionName = (c: Country, r: string) => REGIONS[c].find((x) => x.code === r)?.name ?? r;
export const flagId = (c: Country, r?: string) => (r ? `${c}-${r}` : c);
export const sameLocation = (a: Location, b: Location) => a.country === b.country && a.region === b.region;

export interface SuffixPart {
  label: string;
  /** Full name, for tooltips / screen readers. */
  title: string;
  flag: string;
}

/**
 * How much location detail every scenario name carries, decided across ALL scenarios
 * (the least-common level of government that still tells them apart):
 *  - 'none'    every scenario matches the default location
 *  - 'region'  some differ, but only by province / state → every name shows its province / state
 *  - 'country' some are in another nation → every name shows nation + province / state
 */
export type SuffixLevel = 'none' | 'region' | 'country';

export function suffixLevel(locs: Location[], def: Location): SuffixLevel {
  if (locs.some((l) => l.country !== def.country)) return 'country';
  if (locs.some((l) => l.region !== def.region)) return 'region';
  return 'none';
}

/** Full names ("Ontario", "United States") by default; `compact` gives "ON" / "CAN" / "U.S.". */
export function locationSuffix(loc: Location, level: SuffixLevel, compact = false): SuffixPart[] | null {
  if (level === 'none') return null;
  const region = {
    label: compact ? loc.region : regionName(loc.country, loc.region),
    title: regionName(loc.country, loc.region),
    flag: flagId(loc.country, loc.region),
  };
  if (level === 'region') return [region];
  const c = countryOf(loc.country);
  return [{ label: compact ? c.abbr : c.name, title: c.name, flag: flagId(loc.country) }, region];
}
