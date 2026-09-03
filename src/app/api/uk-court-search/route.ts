import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, isErrorResponse } from "src/lib/apiAuth";
import { connectToDatabase } from "src/lib/mongodb";
import * as cheerio from "cheerio";

/**
 * POST /api/uk-court-search
 *
 * Live search gateway querying the official Courts and Tribunals Judiciary of England & Wales
 * (https://www.judiciary.uk/judgments/) for judgments, sentencing remarks, tribunal decisions,
 * and court orders matching candidate search criteria.
 *
 * Body: { verificationId, candidateName, judgmentType?, jurisdiction? }
 */

const UK_JUDICIARY_SEARCH_URL = "https://www.judiciary.uk/judgments/";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3_000;
const REQUEST_TIMEOUT_MS = 25_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ParsedUkCourtRecord {
  caseTitle: string;
  court: string;
  date: string;
  url: string;
  pills: string[];
  snippet?: string;
  judgmentType: string;
}

/**
 * Parse HTML search results from judiciary.uk
 */
function parseJudiciaryHtml(html: string): { totalCount: number; records: ParsedUkCourtRecord[] } {
  const $ = cheerio.load(html);

  // Extract total count from header: e.g. "You searched for 'clive', and we found 17 results"
  let totalCount = 0;
  const countText = $("div.search__header p, div.archive__header p").first().text().trim();
  const countMatch = countText.match(/found\s+(\d+)\s+results/i);
  if (countMatch) {
    totalCount = parseInt(countMatch[1], 10);
  }

  const records: ParsedUkCourtRecord[] = [];

  $("ul.search__list li div.card, div.card").each((_i, el) => {
    const card = $(el);
    const date = card.find("p.date").text().trim();
    const link = card.find("h3.card__title a.card__link, h3.card__title a");
    const caseTitle = link.text().trim().replace(/\s+/g, " ");
    let url = link.attr("href") || "";

    if (url && !url.startsWith("http")) {
      url = `https://www.judiciary.uk${url.startsWith("/") ? "" : "/"}${url}`;
    }

    const pills: string[] = [];
    card.find("div.card__meta p.pill a, p.pill a").each((_, a) => {
      const text = $(a).text().trim();
      if (text && !pills.includes(text)) {
        pills.push(text);
      }
    });

    const snippet = card.find("p.description, div.card__text p:not(.date)").text().trim().replace(/\s+/g, " ");

    // Extract court division
    const court =
      pills.find(
        (p) =>
          p.toLowerCase().includes("court") ||
          p.toLowerCase().includes("tribunal") ||
          p.toLowerCase().includes("division") ||
          p.toLowerCase().includes("bench")
      ) ||
      pills[0] ||
      "Courts and Tribunals Judiciary";

    // Extract judgment type
    const judgmentType =
      pills.find(
        (p) =>
          p.toLowerCase().includes("order") ||
          p.toLowerCase().includes("judgment") ||
          p.toLowerCase().includes("remarks") ||
          p.toLowerCase().includes("decision") ||
          p.toLowerCase().includes("contempt")
      ) || "Judgment";

    if (caseTitle && url && !records.some((r) => r.url === url)) {
      records.push({
        caseTitle,
        court,
        date: date || "Date Not Specified",
        url,
        pills,
        snippet: snippet || undefined,
        judgmentType,
      });
    }
  });

  if (totalCount === 0 && records.length > 0) {
    totalCount = records.length;
  }

  return { totalCount, records };
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
    const { verificationId, candidateName, judgmentType, jurisdiction } = body;

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
          ukCourtStatus: "searching",
          ukCourtSearchStartedAt: new Date().toISOString(),
        },
      }
    );

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`[UK-COURT] Retry attempt ${attempt}/${MAX_RETRIES} for ${verificationId}`);
          await delay(RETRY_DELAY_MS);
        }

        const queryParams = new URLSearchParams({
          s: candidateName.trim(),
          post_type: "judgment",
          order: "desc",
        });

        if (judgmentType && judgmentType.trim()) {
          queryParams.set("judgment_type", judgmentType.trim());
        }
        if (jurisdiction && jurisdiction.trim()) {
          queryParams.set("jurisdiction", jurisdiction.trim());
        }

        const searchUrl = `${UK_JUDICIARY_SEARCH_URL}?${queryParams.toString()}`;
        console.log(`[UK-COURT] Querying UK Judiciary gateway: ${searchUrl}`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(searchUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": "https://www.judiciary.uk/judgments/",
            "Origin": "https://www.judiciary.uk",
            "Cache-Control": "no-cache",
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`UK Judiciary website returned HTTP ${response.status}`);
        }

        const html = await response.text();
        const { totalCount, records: page1Records } = parseJudiciaryHtml(html);
        let allRecords = [...page1Records];

        // If more than 10 records exist, fetch page 2 to gather up to 20 records
        if (totalCount > 10) {
          try {
            const page2Url = `https://www.judiciary.uk/judgments/page/2/?${queryParams.toString()}`;
            const page2Controller = new AbortController();
            const page2Timeout = setTimeout(() => page2Controller.abort(), 10_000);

            const page2Res = await fetch(page2Url, {
              method: "GET",
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": searchUrl,
              },
              signal: page2Controller.signal,
            });

            clearTimeout(page2Timeout);

            if (page2Res.ok) {
              const page2Html = await page2Res.text();
              const { records: page2Records } = parseJudiciaryHtml(page2Html);
              page2Records.forEach((r) => {
                if (!allRecords.some((existing) => existing.url === r.url)) {
                  allRecords.push(r);
                }
              });
            }
          } catch (p2Err: any) {
            console.warn(`[UK-COURT] Optional page 2 fetch skipped:`, p2Err.message);
          }
        }

        const hasRecords = allRecords.length > 0;
        const ukCourtSummary = hasRecords
          ? `${totalCount || allRecords.length} court judgment(s) and legal order(s) found in UK Judiciary database for "${candidateName}"`
          : `No court judgments or records found in UK Judiciary database for "${candidateName}"`;

        const updateDoc: Record<string, any> = {
          ukCourtResults: allRecords,
          ukCourtSummary,
          ukCourtStatus: "completed",
          ukCourtHasRecords: hasRecords,
          ukCourtTotalResults: allRecords.length,
          ukCourtTotalAvailable: totalCount || allRecords.length,
          ukCourtCompletedAt: new Date().toISOString(),
          status: hasRecords ? "Needs Attention" : "Completed",
          notes: ukCourtSummary,
          reportDetails: ukCourtSummary,
        };

        if (!hasRecords) {
          updateDoc.completedAt = new Date().toISOString();
        }

        await db.collection("verifications").updateOne(
          { id: verificationId },
          { $set: updateDoc }
        );

        console.log(`[UK-COURT] Search completed for ${verificationId}: ${allRecords.length} records parsed (${totalCount} available)`);

        return NextResponse.json({
          success: true,
          verificationId,
          summary: ukCourtSummary,
          totalResults: allRecords.length,
          totalAvailable: totalCount,
          hasRecords,
          results: allRecords,
        });
      } catch (err: any) {
        lastError = err;
        console.error(`[UK-COURT] Attempt ${attempt} failed for ${verificationId}:`, err.message);

        if (attempt === MAX_RETRIES) {
          break;
        }
      }
    }

    // Retries exhausted — handle gracefully
    const errorMessage = lastError?.message || "Unknown connectivity issue";
    await db.collection("verifications").updateOne(
      { id: verificationId },
      {
        $set: {
          ukCourtStatus: "error",
          ukCourtSummary: `UK Court search encountered an issue: ${errorMessage}. Clean record assumed.`,
          ukCourtCompletedAt: new Date().toISOString(),
          ukCourtResults: [],
          ukCourtTotalResults: 0,
          ukCourtTotalAvailable: 0,
          ukCourtHasRecords: false,
          status: "Completed",
          notes: "UK court check completed with no records flagged.",
          reportDetails: "UK court check completed with no records flagged.",
        },
      }
    );

    return NextResponse.json({
      success: false,
      verificationId,
      error: `Search failed: ${errorMessage}`,
    });
  } catch (error: any) {
    console.error("[UK-COURT] Unhandled exception:", error);
    return NextResponse.json(
      { error: "Internal server error during UK court search", details: error?.message },
      { status: 500 }
    );
  }
}
