export type Country = 'CA' | 'US';

export interface Location {
  country: Country;
  region: string;
}

export const COUNTRIES: { code: Country; name: string; short: string; regionWord: string }[] = [
  { code: 'CA', name: 'Canada', short: 'Canada', regionWord: 'Province / territory' },
  { code: 'US', name: 'United States', short: 'U.S.', regionWord: 'State' },
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
  flag: string;
}

/**
 * The smallest level of government at which `loc` differs from the default:
 * same country → just the region; different country → country + region.
 */
export function locationSuffix(loc: Location, def: Location): SuffixPart[] | null {
  if (sameLocation(loc, def)) return null;
  const region = { label: regionName(loc.country, loc.region), flag: flagId(loc.country, loc.region) };
  if (loc.country === def.country) return [region];
  return [{ label: countryOf(loc.country).short, flag: flagId(loc.country) }, region];
}
