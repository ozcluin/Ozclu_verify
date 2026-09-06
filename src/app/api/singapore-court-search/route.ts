import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, isErrorResponse } from "src/lib/apiAuth";
import { connectToDatabase } from "src/lib/mongodb";
import { isRecordFullNameMatch } from "src/lib/nameMatching";

/**
 * POST /api/singapore-court-search
 *
 * Live search gateway querying the official Singapore Judiciary Hearing List Portal
 * (https://www.judiciary.gov.sg/hearing-list/GetFilteredList/)
 * across the Supreme Court, State Courts, and Family Justice Courts.
 *
 * Body: {
 *   verificationId: string;
 *   candidateName: string;         // Party name, Case No, Judicial Officer, or Law Firm
 *   court?: string;                // "Supreme Court" | "State Courts" | "Family Justice Courts" | ""
 *   hearingType?: string;          // e.g. "Civil Trial", "Criminal - Trial", "Case Conference", etc.
 *   startDate?: string;            // ISO date or string
 *   endDate?: string;              // ISO date or string
 *   judgeName?: string;
 *   lawFirm?: string;
 *   pageSize?: number;
 * }
 */

const SG_JUDICIARY_URL = "https://www.judiciary.gov.sg/hearing-list/GetFilteredList/";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;
const REQUEST_TIMEOUT_MS = 25_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ParsedSingaporeCourtRecord {
  no: number | string;
  caseNo: string;
  hearingDate: string;
  hearingDateIso?: string;
  hearingType: string;
  title: string;
  venue: string;
  judge: string;
  detailUrl?: string;
  fullDetailUrl?: string;
  natureOfCase?: string;
  partiesSummary?: string;
  lastUpdated?: string;
}

function cleanHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse HTML response from GetFilteredList
 */
function parseListingHtml(html: string): { records: ParsedSingaporeCourtRecord[]; totalCount: number } {
  const records: ParsedSingaporeCourtRecord[] = [];
  if (!html) return { records, totalCount: 0 };

  // Parse total count
  const summaryMatch = html.match(/Showing results\s+[\d-]+ of ([\d,]+)/i);
  let totalCount = 0;
  if (summaryMatch) {
    totalCount = parseInt(summaryMatch[1].replace(/,/g, ""), 10) || 0;
  }

  // Parse items
  const itemRegex = /<a\s+class="list-item"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  let count = 0;

  while ((match = itemRegex.exec(html)) !== null) {
    count++;
    const href = match[1];
    const inner = match[2];

    const metaSpans = [...inner.matchAll(/<span class="metadata">([\s\S]*?)<\/span>/gi)].map((m) =>
      cleanHtml(m[1])
    );

    let hearingDate = metaSpans[0] || "";
    let caseNo = metaSpans[1] || "";

    // In some cases case number is in the heading or only 1 metadata span exists
    if (!caseNo && metaSpans.length === 1 && !hearingDate.includes(",")) {
      caseNo = hearingDate;
      hearingDate = "";
    }

    const hearingTypeMatch = inner.match(/<div class="hearing-type">([\s\S]*?)<\/div>/i);
    const hearingType = cleanHtml(hearingTypeMatch ? hearingTypeMatch[1] : "Hearing");

    const titleMatch = inner.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    let title = cleanHtml(titleMatch ? titleMatch[1] : "");

    // If title has case number prefix e.g. "SC-907097-2026 PP v. Doe"
    if (!caseNo && title.includes(" v. ")) {
      const parts = title.split(/\s{2,}|\s-\s/);
      if (parts.length > 1) {
        caseNo = parts[0].trim();
        title = parts.slice(1).join(" ").trim();
      }
    }

    // Extract venue
    const venueMatch = inner.match(/<div class="label">Venue<\/div>\s*<div class="text">([\s\S]*?)<\/div>/i);
    const venue = cleanHtml(venueMatch ? venueMatch[1] : "");

    // Extract judge
    const judgeMatch = inner.match(/<div class="label">Judge\/Judicial officer<\/div>\s*<div class="text">([\s\S]*?)<\/div>/i);
    const judge = cleanHtml(judgeMatch ? judgeMatch[1] : "");

    records.push({
      no: count,
      caseNo: caseNo || title || `SG-${count}`,
      hearingDate: hearingDate || "-",
      hearingType,
      title: title || caseNo,
      venue: venue || "Republic of Singapore Courts",
      judge: judge || "Not Specified",
      detailUrl: href,
      fullDetailUrl: href.startsWith("http") ? href : `https://www.judiciary.gov.sg${href}`,
    });
  }

  return { records, totalCount: totalCount || records.length };
}

/**
 * Fetch detail for an individual hearing item to enrich report
 */
async function fetchHearingDetails(relativeUrl: string): Promise<Partial<ParsedSingaporeCourtRecord>> {
  try {
    const fullUrl = relativeUrl.startsWith("http") ? relativeUrl : `https://www.judiciary.gov.sg${relativeUrl}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7_000);

    const res = await fetch(fullUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://www.judiciary.gov.sg/hearing-list",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return {};
    const html = await res.text();

    const natureMatch = html.match(/<div class="label">Nature of case<\/div>\s*<div class="text">([\s\S]*?)<\/div>/i);
    const natureOfCase = cleanHtml(natureMatch ? natureMatch[1] : "");

    const updatedMatch = html.match(/This hearing information was last updated on ([^.]+)\./i);
    const lastUpdated = updatedMatch ? cleanHtml(updatedMatch[1]) : "";

    // Parties involved
    const partiesIdx = html.indexOf("Parties involved");
    let partiesSummary = "";
    if (partiesIdx !== -1) {
      const partiesEnd = html.indexOf("This hearing information was last updated", partiesIdx);
      partiesSummary = cleanHtml(
        html.substring(partiesIdx, partiesEnd > 0 ? partiesEnd : partiesIdx + 2500)
      );
    }

    return {
      natureOfCase: natureOfCase || undefined,
      lastUpdated: lastUpdated || undefined,
      partiesSummary: partiesSummary || undefined,
    };
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const internalApiKey = req.headers.get("x-internal-api-key");
    const isInternalCall = internalApiKey && internalApiKey === process.env.NEXTAUTH_SECRET;

    if (!isInternalCall) {
      const authResult = await requireAuth();
      if (isErrorResponse(authResult)) return authResult;
      const { user } = authResult;

      const roleError = requireRole(user, ["client", "org_owner", "admin"]);
      if (roleError) return roleError;
    }

    const body = await req.json();
    const {
      verificationId,
      candidateName,
      court,
      hearingType,
      startDate,
      endDate,
      judgeName,
      lawFirm,
      pageSize = 20,
    } = body;

    if (!verificationId || !candidateName) {
      return NextResponse.json(
        { error: "Missing required fields: verificationId, candidateName" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Mark search in progress
    await db.collection("verifications").updateOne(
      { id: verificationId },
      {
        $set: {
          singaporeCourtStatus: "searching",
          singaporeCourtSearchStartedAt: new Date().toISOString(),
        },
      }
    );

    let lastError: Error | null = null;

    const payload = {
      model: {
        CurrentPage: 0,
        SelectedCourtTab: "",
        SearchKeywords: String(candidateName).trim(),
        SearchKeywordsGrouping: "",
        SelectedCourt: court && String(court).trim() !== "" ? String(court).trim() : "",
        SelectedLawFirms: lawFirm ? [String(lawFirm).trim()] : [],
        SelectedJudges: judgeName ? [String(judgeName).trim()] : [],
        SelectedHearingTypes: hearingType && String(hearingType).trim() !== "" ? [String(hearingType).trim()] : [],
        SelectedStartDate: startDate || null,
        SelectedEndDate: endDate || null,
        SelectedPageSize: Number(pageSize) || 20,
        SelectedSortBy: "",
      },
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`[SG-COURT] Retry attempt ${attempt}/${MAX_RETRIES} for ${verificationId}`);
          await delay(RETRY_DELAY_MS);
        }

        console.log(`[SG-COURT] Querying Singapore Judiciary API gateway: ${SG_JUDICIARY_URL}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(SG_JUDICIARY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Origin": "https://www.judiciary.gov.sg",
            "Referer": "https://www.judiciary.gov.sg/hearing-list",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Singapore Judiciary returned HTTP ${response.status}`);
        }

        const data = await response.json();
        const htmlList = data?.listPartialView || "";

        const { records, totalCount } = parseListingHtml(htmlList);

        // Enrich up to 5 top records with full details asynchronously
        if (records.length > 0) {
          const enrichLimit = Math.min(records.length, 5);
          await Promise.all(
            records.slice(0, enrichLimit).map(async (rec) => {
              if (rec.detailUrl) {
                const details = await fetchHearingDetails(rec.detailUrl);
                Object.assign(rec, details);
              }
            })
          );
        }

        // Strictly filter raw results: only include records where candidate full name matches parties or case title
        const matchedRecords = records.filter((rec) =>
          isRecordFullNameMatch(String(candidateName).trim(), [
            rec.title,
            rec.partiesSummary,
          ])
        );

        // Re-number matched records
        const finalRecords = matchedRecords.map((r, i) => ({ ...r, no: i + 1 }));
        const hasRecords = finalRecords.length > 0;
        const courtLabel = court || "Singapore Judiciary (Supreme Court, State Courts & Family Justice Courts)";
        const singaporeCourtSummary = hasRecords
          ? `${finalRecords.length} active court hearing case(s) matching candidate "${candidateName}" found in ${courtLabel}`
          : `Verified Clear: Zero active court hearings or adverse judicial cases found in ${courtLabel} for "${candidateName}"`;

        const updateDoc: Record<string, any> = {
          singaporeCourtResults: finalRecords,
          singaporeCourtSummary,
          singaporeCourtStatus: "completed",
          singaporeCourtHasRecords: hasRecords,
          singaporeCourtTotalResults: finalRecords.length,
          singaporeCourtTotalAvailable: finalRecords.length,
          singaporeCourtCompletedAt: new Date().toISOString(),
          singaporeCourtSelectedCourt: court || "All Courts",
          singaporeCourtSelectedHearingType: hearingType || "All Types",
          singaporeCourtStartDate: startDate || undefined,
          singaporeCourtEndDate: endDate || undefined,
          status: hasRecords ? "Needs Attention" : "Completed",
          notes: singaporeCourtSummary,
          reportDetails: singaporeCourtSummary,
        };

        const attemptLog = {
          date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
          verifier: "System (Singapore Judiciary Gateway)",
          status: hasRecords ? "Discrepancy" : "Verified",
          notes: `${singaporeCourtSummary} (Official Singapore Judiciary Gateway)`,
        };

        await db.collection("verifications").updateOne(
          { id: verificationId },
          {
            $set: updateDoc,
            $push: { attempts: attemptLog as any },
          }
        );

        console.log(`[SG-COURT] Verification ${verificationId} completed: ${records.length} records found`);

        return NextResponse.json({
          success: true,
          totalCount: finalRecords.length,
          recordsReturned: finalRecords.length,
          hasRecords,
          summary: singaporeCourtSummary,
          records: finalRecords,
        });
      } catch (err: any) {
        lastError = err;
        console.error(`[SG-COURT] Error on attempt ${attempt}:`, err.message);
      }
    }

    // All retries failed
    const failSummary = `Search gateway error connecting to Singapore Judiciary: ${lastError?.message || "Unknown error"}`;
    await db.collection("verifications").updateOne(
      { id: verificationId },
      {
        $set: {
          singaporeCourtStatus: "error",
          singaporeCourtSummary: failSummary,
          status: "Halted",
          notes: failSummary,
        },
        $push: {
          attempts: {
            date: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
            verifier: "System (Singapore Judiciary Gateway)",
            status: "Halted",
            notes: failSummary,
          } as any,
        },
      }
    );

    return NextResponse.json(
      {
        success: false,
        error: lastError?.message || "Failed to query Singapore Judiciary after retries",
        summary: failSummary,
      },
      { status: 502 }
    );
  } catch (err: any) {
    console.error("[SG-COURT] Fatal error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
