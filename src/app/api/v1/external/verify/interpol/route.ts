/**
 * External API: Interpol Check
 * POST /api/v1/external/verify/interpol
 */

import { NextRequest } from "next/server";
import { processExternalApiRequest, generateVerificationId, formatDateForVerification } from "src/lib/externalApiHelpers";

export async function POST(req: NextRequest) {
  return processExternalApiRequest(req, "interpol", async (db, auth, body) => {
    const { candidateName, candidateDob, birthCity, requestingOrgName } = body;

    if (!candidateName?.trim() || !candidateDob?.trim()) {
      return { data: { error: "candidateName and candidateDob are required" }, statusCode: 400 };
    }

    const orgName = auth.org.name;
    const finalId = await generateVerificationId(db, "INT");

    // Extract birth year for DB search
    const dobMatch = candidateDob.toString().match(/\b(19\d\d|20\d\d)\b/);
    const dobYear = dobMatch ? parseInt(dobMatch[0], 10) : null;

    const normalizeName = (str: string) => str ? str.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim() : "";
    const searchNormalized = normalizeName(candidateName);

    const query: any = {};
    if (dobYear) query.dobYear = dobYear;

    const potentialMatches = await db.collection("interpol_notices").find(query).toArray();
    const inputWords = searchNormalized.split(" ").filter(w => w.length > 2);

    const matchedNotices = potentialMatches.filter((notice: any) => {
      const nn = notice.normalizedName || "";
      if (searchNormalized === nn) return true;
      if (searchNormalized.includes(nn) || nn.includes(searchNormalized)) return true;
      const nw = nn.split(" ").filter((w: string) => w.length > 2);
      const common = inputWords.filter(w => nw.includes(w));
      if (common.length >= 2) return true;
      if (inputWords.length > 0 && nw.every((w: string) => inputWords.includes(w))) return true;
      if (nw.length > 0 && inputWords.every((w: string) => nw.includes(w))) return true;
      return false;
    });

    const sanitizedMatches = matchedNotices.map((m: any) => {
      const rawDetails = m.details?.details || m.details || {};
      const arrestWarrants = rawDetails.arrest_warrants || m.details?.arrest_warrants || [];
      return {
        name: m.name || rawDetails.forename || "",
        dateOfBirth: m.dateOfBirth || String(rawDetails.date_of_birth || ""),
        placeOfBirth: m.placeOfBirth || rawDetails.place_of_birth || "",
        noticeType: m.noticeType || "",
        noticeId: m.noticeId || rawDetails.entity_id || "",
        link: m.link || "",
        details: {
          arrest_warrants: arrestWarrants.map((w: any) => ({ charge: typeof w.charge === "string" ? w.charge : JSON.stringify(w.charge || ""), issuing_country_id: w.issuing_country_id || "" })),
          sex: rawDetails.sex_id || "",
          nationalities: Array.isArray(rawDetails.nationalities) ? rawDetails.nationalities.join(", ") : "",
        },
      };
    });

    const hasRecords = sanitizedMatches.length > 0;
    const status = hasRecords ? "Needs Attention" : "Completed";

    await db.collection("verifications").insertOne({
      id: finalId,
      name: candidateName.trim(),
      email: "",
      orgName,
      requestingOrgName: requestingOrgName?.trim() || orgName,
      date: formatDateForVerification(),
      status,
      verifier: "System",
      notes: hasRecords
        ? `Potential similarity match(es) found in Interpol database: ${sanitizedMatches.length} record(s).`
        : "No records found in Interpol database. Clean record verified.",
      type: "interpol",
      candidateDob,
      birthCity: birthCity?.trim() || "",
      interpolHasRecords: hasRecords,
      interpolMatches: sanitizedMatches,
      interpolCompletedAt: new Date().toISOString(),
      source: "api",
      createdAt: new Date().toISOString(),
    });

    return {
      data: {
        success: true,
        requestId: finalId,
        status: status.toLowerCase().replace(/ /g, "_"),
        hasRecords,
        matchCount: sanitizedMatches.length,
        message: hasRecords
          ? `${sanitizedMatches.length} potential match(es) found in Interpol database.`
          : "No records found. Clean record.",
      },
    };
  });
}
