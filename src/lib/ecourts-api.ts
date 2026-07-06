// ═══════════════════════════════════════════════════════════════
// ecourts-api.ts — eCourts India Integration Module
// Server-side only. Uses Node.js built-in https module.
// No API keys needed — uses auto-generated session cookies.
// ═══════════════════════════════════════════════════════════════
import https from "https";

const ECOURTS_HOST = "services.ecourts.gov.in";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36";

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  keepAliveMsecs: 10000,
});

// ─── Types ───
export interface SessionCookies {
  SERVICES_SESSID: string;
  JSESSION: string;
}

export interface CourtCase {
  srNo: number;
  caseNumber: string;
  petitioner: string;
  respondent: string;
  orderDate: string;
}

export interface SearchResult {
  raw: any;
  cookies: SessionCookies;
  hasCases: boolean;
  cases: CourtCase[];
}

export interface DistrictOption {
  value: string;
  name: string;
}

export interface CourtComplexOption {
  code: string;
  arr: string;
  hasEstablishments: boolean;
  name: string;
}

export interface EstablishmentOption {
  value: string;
  name: string;
}

// ─── Internal: make a POST to eCourts ───
function _post(
  endpoint: string,
  payload: Record<string, string>,
  cookies: SessionCookies,
  timeoutMs = 90000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const body: Record<string, string> = {
      ...payload,
      ajax_req: "true",
      app_token: "",
    };

    const formBody = Object.entries(body)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const cookieStr = `SERVICES_SESSID=${cookies.SERVICES_SESSID}; JSESSION=${cookies.JSESSION}`;

    const options: https.RequestOptions = {
      hostname: ECOURTS_HOST,
      path: `/ecourtindia_v6/?p=${endpoint}`,
      method: "POST",
      agent,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://services.ecourts.gov.in/",
        Origin: "https://services.ecourts.gov.in",
        Cookie: cookieStr,
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        Connection: "keep-alive",
        "Content-Length": String(Buffer.byteLength(formBody)),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Failed to parse eCourts response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("eCourts request timed out"));
    });

    req.on("error", reject);
    req.write(formBody);
    req.end();
  });
}

// ─── 1. Get Session Cookies ───
export async function getSession(): Promise<SessionCookies> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: ECOURTS_HOST,
        path: "/ecourtindia_v6/?p=courtorder/index&app_token=",
        method: "GET",
        agent,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Connection: "keep-alive",
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          const cookies: Record<string, string> = {};
          (res.headers["set-cookie"] || []).forEach((c) => {
            const m = c.match(/^([^=]+)=([^;]+)/);
            if (m) cookies[m[1].trim()] = m[2].trim();
          });
          if (cookies.SERVICES_SESSID && cookies.JSESSION) {
            resolve({
              SERVICES_SESSID: cookies.SERVICES_SESSID,
              JSESSION: cookies.JSESSION,
            });
          } else {
            reject(new Error("Failed to obtain eCourts session cookies"));
          }
        });
      }
    );

    req.setTimeout(15000, () => req.destroy(new Error("Session request timed out")));
    req.on("error", reject);
    req.end();
  });
}

// ─── 2. Search Court Orders by Party Name ───
export async function searchCourtOrders({
  partyName,
  year = "",
  orderType = "both",
  stateCode,
  distCode,
  courtComplex,
  courtComplexArr,
  estCode = "",
  captcha = "",
}: {
  partyName: string;
  year?: string;
  orderType?: "final" | "interim" | "both";
  stateCode: string;
  distCode: string;
  courtComplex: string;
  courtComplexArr: string;
  estCode?: string;
  captcha?: string;
}): Promise<SearchResult> {
  const cookies = await getSession();
  return _searchWithCookies({
    partyName, year, orderType, stateCode, distCode,
    courtComplex, courtComplexArr, estCode, captcha,
  }, cookies);
}

// ─── 2b. Search with pre-fetched session (for batch searches) ───
// This avoids creating a new session per complex — prevents "socket hang up"
export async function searchCourtOrdersWithSession({
  partyName,
  year = "",
  orderType = "both",
  stateCode,
  distCode,
  courtComplex,
  courtComplexArr,
  estCode = "",
  captcha = "",
  cookies,
  maxRetries = 2,
}: {
  partyName: string;
  year?: string;
  orderType?: "final" | "interim" | "both";
  stateCode: string;
  distCode: string;
  courtComplex: string;
  courtComplexArr: string;
  estCode?: string;
  captcha?: string;
  cookies: SessionCookies;
  maxRetries?: number;
}): Promise<{ result: SearchResult; cookies: SessionCookies }> {
  let currentCookies = cookies;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await _searchWithCookies({
        partyName, year, orderType, stateCode, distCode,
        courtComplex, courtComplexArr, estCode, captcha,
      }, currentCookies);
      return { result, cookies: currentCookies };
    } catch (err: any) {
      lastError = err;
      const msg = (err.message || "").toLowerCase();
      const isRetryable = msg.includes("socket hang up") ||
        msg.includes("econnreset") ||
        msg.includes("timed out") ||
        msg.includes("econnrefused");

      if (isRetryable && attempt < maxRetries) {
        console.log(`[ECOURTS] Retry ${attempt + 1}/${maxRetries} after: ${err.message}`);
        // Wait before retrying — exponential backoff
        await delay(1000 * (attempt + 1));
        // Get a fresh session for the retry
        try {
          currentCookies = await getSession();
        } catch {
          // If session renewal fails, try with old cookies
        }
      } else {
        throw err;
      }
    }
  }

  throw lastError || new Error("Search failed after retries");
}

// ─── Internal: perform search with given cookies ───
function _searchWithCookies(
  params: {
    partyName: string;
    year: string;
    orderType: string;
    stateCode: string;
    distCode: string;
    courtComplex: string;
    courtComplexArr: string;
    estCode: string;
    captcha: string;
  },
  cookies: SessionCookies
): Promise<SearchResult> {
  return _post(
    "courtorder/submitPartyName",
    {
      partynameOrder: params.partyName,
      rgyearOrder: params.year,
      frad: params.orderType,
      order_party_captcha_code: params.captcha,
      state_code: params.stateCode,
      dist_code: params.distCode,
      court_complex: params.courtComplex,
      court_complex_arr: params.courtComplexArr,
      est_code: params.estCode,
    },
    cookies
  ).then((result) => ({
    raw: result,
    cookies,
    hasCases: result.status === 1 && !result.party_data?.includes("nodata"),
    cases: parseCases(result.party_data),
  }));
}

// ─── 3. Parse HTML Response into Structured Cases ───
export function parseCases(html: string): CourtCase[] {
  if (!html || html.includes("nodata")) return [];

  const cases: CourtCase[] = [];
  const rowRegex =
    /<tr>\s*<td>(\d+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([^<]+)<\/td>/gi;
  let match;

  while ((match = rowRegex.exec(html)) !== null) {
    const partiesRaw = match[3]
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/br>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const [petitioner = "", respondent = ""] = partiesRaw
      .split(/\s*Vs\s*/i)
      .map((s: string) => s.trim());

    cases.push({
      srNo: parseInt(match[1]),
      caseNumber: match[2].trim(),
      petitioner,
      respondent,
      orderDate: match[4].trim(),
    });
  }
  return cases;
}

// ─── 4. Get Districts for a State ───
export async function getDistricts(stateCode: string): Promise<DistrictOption[]> {
  const cookies = await getSession();
  const data = await _post(
    "casestatus/fillDistrict",
    { state_code: stateCode },
    cookies,
    45000
  );
  return parseOptions(data.dist_list);
}

// ─── 5. Get Court Complexes for a District ───
export async function getCourtComplexes(
  stateCode: string,
  distCode: string
): Promise<CourtComplexOption[]> {
  const cookies = await getSession();
  const data = await _post(
    "casestatus/fillcomplex",
    { state_code: stateCode, dist_code: distCode },
    cookies,
    45000
  );

  return parseOptions(data.complex_list).map((c) => {
    const [code, arr, hasEst] = c.value.split("@");
    return {
      code,
      arr: arr || "",
      hasEstablishments: hasEst === "Y",
      name: c.name,
    };
  });
}

// ─── 6. Get Establishments for a Court Complex ───
export async function getEstablishments(
  stateCode: string,
  distCode: string,
  complexCode: string
): Promise<EstablishmentOption[]> {
  const cookies = await getSession();
  const data = await _post(
    "casestatus/fillCourtEstablishment",
    {
      state_code: stateCode,
      dist_code: distCode,
      court_complex_code: complexCode,
    },
    cookies,
    45000
  );
  return parseOptions(data.establishment_list);
}

// ─── Helper: parse <option> HTML into array ───
function parseOptions(html: string): Array<{ value: string; name: string }> {
  if (!html) return [];
  const results: Array<{ value: string; name: string }> = [];
  const regex = /<option\s+value=['"]?([^'">\s]+)['"]?[^>]*>\s*([^<]+)/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const val = m[1].trim();
    const name = m[2].replace(/\s+/g, " ").trim();
    if (val && val !== "0") results.push({ value: val, name });
  }
  return results;
}

// ─── Helper: delay between requests (politeness) ───
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
