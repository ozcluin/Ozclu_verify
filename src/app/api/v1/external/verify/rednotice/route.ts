/**
 * External API: Red Notice Worldwide Check
 * POST /api/v1/external/verify/rednotice
 */

import { NextRequest } from "next/server";
import { processExternalApiRequest, generateVerificationId, formatDateForVerification } from "src/lib/externalApiHelpers";

export async function POST(req: NextRequest) {
  return processExternalApiRequest(req, "rednotice_worldwide", async (db, auth, body) => {
    const { candidateName, candidateDob, birthCity, requestingOrgName } = body;

    if (!candidateName?.trim() || !candidateDob?.trim()) {
      return { data: { error: "candidateName and candidateDob are required" }, statusCode: 400 };
    }

    const orgName = auth.org.name;
    const finalId = await generateVerificationId(db, "RNW");

    const dobMatch = candidateDob.toString().match(/\b(19\d\d|20\d\d)\b/);
    const dobYear = dobMatch ? parseInt(dobMatch[0], 10) : null;

    const normalizeName = (str: string) => str ? str.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim() : "";
    const searchNormalized = normalizeName(candidateName);

    const query: any = {};
    if (dobYear) query.$or = [{ dobYear }, { dobYear: null }];

    const potentialMatches = await db.collection("rednotices_worldwide").find(query).toArray();
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

    const sanitizedMatches = matchedNotices.map((m: any) => ({
      name: m.name || `${m.forename || ""} ${m.surname || ""}`.trim(),
      forename: m.forename || "",
      surname: m.surname || "",
      dateOfBirth: m.dateOfBirth || "",
      placeOfBirth: m.placeOfBirth || "",
      nationalities: m.nationalities || [],
      noticeId: m.noticeId || "",
      entityId: m.entityId || "",
      arrestWarrants: (m.arrestWarrants || []).map((w: any) => ({
        charge: typeof w.charge === "string" ? w.charge : JSON.stringify(w.charge || ""),
        issuing_country_id: w.issuing_country_id || "",
      })),
    }));

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
        ? `Potential match(es) found in Interpol Worldwide Red Notice database: ${sanitizedMatches.length} record(s).`
        : "No matches found in Interpol Worldwide Red Notice database. Clean global record verified.",
      type: "rednotice_worldwide",
      candidateDob,
      birthCity: birthCity?.trim() || "",
      rednoticeWorldwideHasRecords: hasRecords,
      rednoticeWorldwideMatches: sanitizedMatches,
      rednoticeWorldwideCompletedAt: new Date().toISOString(),
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
      },
    };
  });
}
