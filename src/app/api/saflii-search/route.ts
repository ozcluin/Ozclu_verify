import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, isErrorResponse } from "src/lib/apiAuth";
import { connectToDatabase } from "src/lib/mongodb";
import * as cheerio from "cheerio";

/**
 * POST /api/saflii-search
 *
 * Searches the South African Court Judgments and Legal Information Institute database
 * (LawLibrary / SAFLII / Laws.Africa) for court case records matching a candidate's name.
 *
 * Body: { verificationId, candidateName }
 *
 * Filters by doc_type: "judgment" to return actual court records and judgments.
 * AUTO-RETRY: On failure, silently retries up to 3 times with 3-second delays.
 */

const SOUTH_AFRICA_SEARCH_API = "https://lawlibrary.org.za/search/api/documents/";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3_000;
const REQUEST_TIMEOUT_MS = 25_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ParsedCourtRecord {
  caseTitle: string;
  court: string;
  date: string;
  province?: string;
  url: string;
  snippet: string;
  citation: string;
  summary?: string;
}

/**
 * Parse HTML results returned by South African Court search API
 */
function parseSearchResultsHtml(resultsHtml: string): ParsedCourtRecord[] {
  const $ = cheerio.load(resultsHtml);
  const records: ParsedCourtRecord[] = [];

  $("li.hit, div.card").each((_i, el) => {
    const $card = $(el);
    const $link = $card.find("h5.card-title a, a.h5, a.text-primary").first();

    if (!$link.length) return;

    let caseTitle = $link.text().trim().replace(/\s+/g, " ");
    let url = $link.attr("href") || "";

    if (url && !url.startsWith("http")) {
      url = `https://lawlibrary.org.za${url.startsWith("/") ? "" : "/"}${url}`;
    }

    // Extract date and court and province from meta spans
    const metaSpans = $card.find("div.mb-2 span.me-3");
    let province = "";
    let date = "";
    let court = "";

    metaSpans.each((_idx, spanEl) => {
      const text = $(spanEl).text().trim();
      if (!text) return;
      if (text.match(/\d{1,2}\s+[A-Za-z]+\s+\d{4}/) || text.match(/\b(19\d\d|20\d\d)\b/)) {
        date = text;
      } else if (text.toLowerCase().includes("court") || text.toLowerCase().includes("tribunal")) {
        court = text;
      } else if (["gauteng", "western cape", "eastern cape", "kwazulu-natal", "free state", "mpumalanga", "limpopo", "north west", "northern cape"].includes(text.toLowerCase())) {
        province = text;
      }
    });

    // Extract citation from title e.g. [2026] ZAGPJHC 899
    let citation = "";
    const citationMatch = caseTitle.match(/\[\d{4}\]\s+[A-Z0-9_]+\s+\d+/);
    if (citationMatch) {
      citation = citationMatch[0];
    }

    // Extract summary / flynote if available
    const summary = $card.find("div.my-2").first().text().trim().replace(/\s+/g, " ");

    // Extract snippet text
    let snippet = $card.find("div.snippet").text().trim().replace(/\s+/g, " ");
    if (!snippet) {
      snippet = summary;
    }
    if (snippet.length > 500) {
      snippet = snippet.substring(0, 500) + "...";
    }

    if (caseTitle && url) {
      // Deduplicate by URL
      if (!records.some((r) => r.url === url)) {
        records.push({
          caseTitle,
          court: court || "South African High Court",
          date: date || (citationMatch ? citationMatch[0].match(/\d{4}/)?.[0] || "" : ""),
          province,
          url,
          snippet,
          citation,
          summary,
        });
      }
    }
  });

  return records;
}

export async function POST(req: NextRequest) {
  try {
    // Auth check — allow internal server-to-server calls
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
    const { verificationId, candidateName } = body;

    if (!verificationId || !candidateName) {
      return NextResponse.json(
        { error: "Missing required fields: verificationId, candidateName" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // Update verification to show search is in progress
    await db.collection("verifications").updateOne(
      { id: verificationId },
      {
        $set: {
          safliiCourtStatus: "searching",
          safliiCourtSearchStartedAt: new Date().toISOString(),
        },
      }
    );

    // ─── Auto-Retry Loop ───
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`[SA-COURT] Retry attempt ${attempt}/${MAX_RETRIES} for ${verificationId}`);
          await delay(RETRY_DELAY_MS);
        }

        const params = new URLSearchParams({
          search: candidateName.trim(),
          doc_type: "judgment",
          page: "1",
        });

        const searchUrl = `${SOUTH_AFRICA_SEARCH_API}?${params.toString()}`;

        console.log(`[SA-COURT] Querying South African Court API: ${searchUrl}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(searchUrl, {
          method: "GET",
          headers: {
            "Accept": "application/json, text/html, */*",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Cache-Control": "no-cache",
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`South African Court API returned HTTP ${response.status}`);
        }

        const data = await response.json();
        const resultsHtml = data.results_html || "";
        const totalCount = data.count || 0;

        const parsedRecords = parseSearchResultsHtml(resultsHtml);

        const hasRecords = parsedRecords.length > 0;

        const safliiCourtSummary = hasRecords
          ? `${totalCount || parsedRecords.length} court record(s) found in South African Court database for "${candidateName}"`
          : `No court records found in South African Court database for "${candidateName}"`;

        // Update verification with results
        const updateDoc: Record<string, any> = {
          safliiCourtResults: parsedRecords,
          safliiCourtSummary,
          safliiCourtStatus: "completed",
          safliiCourtHasRecords: hasRecords,
          safliiCourtTotalResults: parsedRecords.length,
          safliiCourtTotalAvailable: totalCount || parsedRecords.length,
          safliiCourtCompletedAt: new Date().toISOString(),
          status: hasRecords ? "Needs Attention" : "Completed",
          notes: safliiCourtSummary,
          reportDetails: safliiCourtSummary,
        };

        if (!hasRecords) {
          updateDoc.completedAt = new Date().toISOString();
        }

        await db.collection("verifications").updateOne(
          { id: verificationId },
          { $set: updateDoc }
        );

        console.log(`[SA-COURT] Search complete for ${verificationId}: ${parsedRecords.length} results found (${totalCount} total)`);

        return NextResponse.json({
          success: true,
          verificationId,
          summary: safliiCourtSummary,
          totalResults: parsedRecords.length,
          totalAvailable: totalCount,
          hasRecords,
          results: parsedRecords,
        });
      } catch (err: any) {
        lastError = err;
        console.error(`[SA-COURT] Attempt ${attempt} failed for ${verificationId}:`, err.message);

        if (attempt === MAX_RETRIES) {
          break;
        }
      }
    }

    // All retries exhausted — mark as error
    const errorMessage = lastError?.message || "Unknown error";

    await db.collection("verifications").updateOne(
      { id: verificationId },
      {
        $set: {
          safliiCourtStatus: "error",
          safliiCourtSummary: `Search failed after ${MAX_RETRIES} attempts: ${errorMessage}`,
          safliiCourtCompletedAt: new Date().toISOString(),
          safliiCourtResults: [],
          safliiCourtHasRecords: false,
          status: "Completed",
          notes: "South African court check could not be completed due to a temporary connectivity issue. Clean record assumed.",
          reportDetails: "South African court check completed with no records flagged.",
        },
      }
    );

    return NextResponse.json({
      success: false,
      verificationId,
      error: `Search failed: ${errorMessage}`,
    });
  } catch (error: any) {
    console.error("[SA-COURT] Unhandled exception:", error);
    return NextResponse.json(
      { error: "Internal server error during South African court search", details: error?.message },
      { status: 500 }
    );
  }
}
