// ═══════════════════════════════════════════════════════════════
// courts-data.ts — Pre-scraped eCourts India Court Database
// Provides instant lookups for districts, complexes, and
// establishments without making live API calls.
// Source: scrape_courts.js → courts.json (7,079 records)
// ═══════════════════════════════════════════════════════════════

import courtsRaw from "src/data/courts.json";

export interface CourtRecord {
  state_code: string;
  state_name: string;
  district_code: string;
  district_name: string;
  court_complex_code: string;
  court_complex_name: string;
  court_complex_arr: string;
  has_establishments: string;
  establishment_code: string;
  establishment_name: string;
}

const courts: CourtRecord[] = courtsRaw as CourtRecord[];

// ─── Get all unique districts for a state code ───
export function getDistrictsLocal(stateCode: string): Array<{ value: string; name: string }> {
  const seen = new Set<string>();
  const results: Array<{ value: string; name: string }> = [];

  for (const r of courts) {
    if (r.state_code === stateCode && !seen.has(r.district_code)) {
      seen.add(r.district_code);
      results.push({ value: r.district_code, name: r.district_name });
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Get all court complexes for a state + district ───
export function getCourtComplexesLocal(
  stateCode: string,
  districtCode: string
): Array<{
  code: string;
  arr: string;
  hasEstablishments: boolean;
  name: string;
}> {
  const seen = new Set<string>();
  const results: Array<{
    code: string;
    arr: string;
    hasEstablishments: boolean;
    name: string;
  }> = [];

  for (const r of courts) {
    if (
      r.state_code === stateCode &&
      r.district_code === districtCode &&
      !seen.has(r.court_complex_code)
    ) {
      seen.add(r.court_complex_code);
      results.push({
        code: r.court_complex_code,
        arr: r.court_complex_arr,
        hasEstablishments: r.has_establishments === "Y",
        name: r.court_complex_name,
      });
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Get all establishments for a state + district + complex ───
export function getEstablishmentsLocal(
  stateCode: string,
  districtCode: string,
  complexCode: string
): Array<{ value: string; name: string }> {
  const results: Array<{ value: string; name: string }> = [];

  for (const r of courts) {
    if (
      r.state_code === stateCode &&
      r.district_code === districtCode &&
      r.court_complex_code === complexCode &&
      r.establishment_code
    ) {
      results.push({ value: r.establishment_code, name: r.establishment_name });
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Get all unique states (from scraped data) ───
export function getStatesLocal(): Array<{ code: string; name: string }> {
  const seen = new Set<string>();
  const results: Array<{ code: string; name: string }> = [];

  for (const r of courts) {
    if (!seen.has(r.state_code)) {
      seen.add(r.state_code);
      results.push({ code: r.state_code, name: r.state_name });
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Full lookup: get all complexes for a district (with establishments) ───
export function getFullCourtHierarchy(
  stateCode: string,
  districtCode: string
): Array<{
  complexCode: string;
  complexName: string;
  complexArr: string;
  hasEstablishments: boolean;
  establishments: Array<{ code: string; name: string }>;
}> {
  const complexMap = new Map<
    string,
    {
      complexCode: string;
      complexName: string;
      complexArr: string;
      hasEstablishments: boolean;
      establishments: Array<{ code: string; name: string }>;
    }
  >();

  for (const r of courts) {
    if (r.state_code !== stateCode || r.district_code !== districtCode) continue;

    if (!complexMap.has(r.court_complex_code)) {
      complexMap.set(r.court_complex_code, {
        complexCode: r.court_complex_code,
        complexName: r.court_complex_name,
        complexArr: r.court_complex_arr,
        hasEstablishments: r.has_establishments === "Y",
        establishments: [],
      });
    }

    if (r.establishment_code) {
      complexMap.get(r.court_complex_code)!.establishments.push({
        code: r.establishment_code,
        name: r.establishment_name,
      });
    }
  }

  return Array.from(complexMap.values()).sort((a, b) =>
    a.complexName.localeCompare(b.complexName)
  );
}
