// ═══════════════════════════════════════════════════════════════
// courts-mapping.ts — Indian State/UT → eCourts State Code Mapping
// Used to resolve user-provided state names to eCourts API codes
// ═══════════════════════════════════════════════════════════════

export interface StateMapping {
  code: string;
  name: string;
  aliases: string[]; // Alternative names for fuzzy matching
}

/**
 * Complete list of Indian states/UTs and their eCourts numeric codes.
 * Source: eCourts India portal (services.ecourts.gov.in)
 */
export const INDIAN_STATES: StateMapping[] = [
  { code: "1", name: "Maharashtra", aliases: ["maharashtra", "mh"] },
  { code: "2", name: "Andhra Pradesh", aliases: ["andhra pradesh", "ap", "andhra"] },
  { code: "3", name: "Karnataka", aliases: ["karnataka", "ka", "karnatak"] },
  { code: "4", name: "Kerala", aliases: ["kerala", "kl"] },
  { code: "5", name: "Himachal Pradesh", aliases: ["himachal pradesh", "hp", "himachal"] },
  { code: "6", name: "Assam", aliases: ["assam", "as"] },
  { code: "7", name: "Jharkhand", aliases: ["jharkhand", "jh"] },
  { code: "8", name: "Bihar", aliases: ["bihar", "br"] },
  { code: "9", name: "Rajasthan", aliases: ["rajasthan", "rj"] },
  { code: "10", name: "Tamil Nadu", aliases: ["tamil nadu", "tn", "tamilnadu"] },
  { code: "11", name: "Odisha", aliases: ["odisha", "or", "orissa"] },
  { code: "12", name: "Jammu and Kashmir", aliases: ["jammu and kashmir", "jk", "j&k", "jammu kashmir"] },
  { code: "13", name: "Uttar Pradesh", aliases: ["uttar pradesh", "up"] },
  { code: "14", name: "Haryana", aliases: ["haryana", "hr"] },
  { code: "15", name: "Uttarakhand", aliases: ["uttarakhand", "uk", "uttaranchal"] },
  { code: "16", name: "West Bengal", aliases: ["west bengal", "wb", "bengal"] },
  { code: "17", name: "Gujarat", aliases: ["gujarat", "gj"] },
  { code: "18", name: "Chhattisgarh", aliases: ["chhattisgarh", "cg", "chattisgarh"] },
  { code: "19", name: "Mizoram", aliases: ["mizoram", "mz"] },
  { code: "20", name: "Tripura", aliases: ["tripura", "tr"] },
  { code: "21", name: "Meghalaya", aliases: ["meghalaya", "ml"] },
  { code: "22", name: "Punjab", aliases: ["punjab", "pb"] },
  { code: "23", name: "Madhya Pradesh", aliases: ["madhya pradesh", "mp"] },
  { code: "24", name: "Sikkim", aliases: ["sikkim", "sk"] },
  { code: "25", name: "Manipur", aliases: ["manipur", "mn"] },
  { code: "26", name: "Delhi", aliases: ["delhi", "dl", "new delhi", "nct of delhi", "nct delhi"] },
  { code: "27", name: "Chandigarh", aliases: ["chandigarh", "ch"] },
  { code: "28", name: "Andaman and Nicobar", aliases: ["andaman and nicobar", "andaman & nicobar", "an", "andaman nicobar", "andaman"] },
  { code: "29", name: "Telangana", aliases: ["telangana", "ts", "telengana"] },
  { code: "30", name: "Goa", aliases: ["goa", "ga"] },
  { code: "33", name: "Ladakh", aliases: ["ladakh", "la"] },
  { code: "34", name: "Nagaland", aliases: ["nagaland", "nl"] },
  { code: "35", name: "Puducherry", aliases: ["puducherry", "py", "pondicherry"] },
  { code: "36", name: "Arunachal Pradesh", aliases: ["arunachal pradesh", "ar", "arunachal"] },
  { code: "37", name: "Lakshadweep", aliases: ["lakshadweep", "ld"] },
  { code: "38", name: "Dadra & Nagar Haveli and Daman & Diu", aliases: ["dadra", "daman", "diu", "dadra and nagar haveli", "daman and diu", "dd", "dnhdd"] },
];

/**
 * Resolves a state name (or alias) to its eCourts state code.
 * Case-insensitive matching against name and aliases.
 * @returns The state code string, or null if not found.
 */
export function resolveStateCode(stateName: string): string | null {
  if (!stateName) return null;
  const normalized = stateName.toLowerCase().trim();

  for (const state of INDIAN_STATES) {
    if (state.name.toLowerCase() === normalized) return state.code;
    if (state.aliases.includes(normalized)) return state.code;
  }

  // Partial match fallback
  for (const state of INDIAN_STATES) {
    if (state.name.toLowerCase().includes(normalized) || normalized.includes(state.name.toLowerCase())) {
      return state.code;
    }
  }

  return null;
}

/**
 * Gets the state name from a state code.
 */
export function getStateName(code: string): string {
  const state = INDIAN_STATES.find((s) => s.code === code);
  return state?.name || `State Code ${code}`;
}

/**
 * Returns sorted list of states for dropdown display.
 */
export function getStatesForDropdown(): Array<{ value: string; label: string }> {
  return INDIAN_STATES
    .map((s) => ({ value: s.code, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
