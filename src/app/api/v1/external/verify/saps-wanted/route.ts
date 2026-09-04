/**
 * External API: SAPS Wanted Persons Check
 * POST /api/v1/external/verify/saps-wanted
 */

import { NextRequest } from "next/server";
import { processExternalApiRequest, generateVerificationId, formatDateForVerification } from "src/lib/externalApiHelpers";

export async function POST(req: NextRequest) {
  return processExternalApiRequest(req, "saps_wanted", async (db, auth, body) => {
    const { candidateName, candidateForename, candidateSurname, candidateDob, candidateIdNumber, provinceCity, requestingOrgName } = body;

    if (!candidateName?.trim() && (!candidateForename?.trim() || !candidateSurname?.trim())) {
      return { data: { error: "candidateName or both candidateForename and candidateSurname are required" }, statusCode: 400 };
    }

    const orgName = auth.org.name;
    const finalId = await generateVerificationId(db, "SAPS");

    const normalizeText = (str: string) => str ? str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() : "";

    let forename = (candidateForename || "").trim();
    let surname = (candidateSurname || "").trim();
    const rawFullName = (candidateName || `${forename} ${surname}`).trim();

    if (!forename || !surname) {
      const parts = rawFullName.split(/\s+/).filter(Boolean);
      if (parts.length === 1) { surname = parts[0]; forename = parts[0]; }
      else { surname = parts[parts.length - 1]; forename = parts.slice(0, -1).join(" "); }
    }

    const normForename = normalizeText(forename);
    const normSurname = normalizeText(surname);
    const normFullName = normalizeText(rawFullName);

    const candidates = await db.collection("saps_wanted").find({
      $or: [
        { normalizedSurname: normSurname },
        { normalizedName: normFullName },
        { normalizedSurname: { $regex: `^${normSurname}$`, $options: "i" } },
      ],
    }).toArray();

    const matched = candidates.filter((s: any) => {
      const sSurname = s.normalizedSurname || normalizeText(s.surname);
      const sForename = s.normalizedForename || normalizeText(s.forename);
      const sFullName = s.normalizedName || normalizeText(s.name);
      if (normFullName === sFullName) return true;
      const surnameMatch = sSurname === normSurname || (sSurname.length > 2 && normSurname.length > 2 && (sSurname.includes(normSurname) || normSurname.includes(sSurname)));
      if (!surnameMatch) return false;
      if (sForename === normForename) return true;
      const iw = normForename.split(" ").filter((w: string) => w.length > 2);
      const sw = sForename.split(" ").filter((w: string) => w.length > 2);
      return iw.some((w: string) => sw.includes(w));
    });

    const sanitized = matched.map((s: any) => ({
      bid: s.sapsBid || s.bid,
      name: s.name || `${s.forename || ""} ${s.surname || ""}`.trim(),
      forename: s.forename || "", surname: s.surname || "",
      crime: s.crime || "", circumstances: s.circumstances || "",
      station: s.station || "", caseNumber: s.caseNumber || "",
    }));

    const hasMatch = sanitized.length > 0;
    const status = hasMatch ? "Halted" : "Completed";

    await db.collection("verifications").insertOne({
      id: finalId, name: rawFullName, candidateForename: forename, candidateSurname: surname,
      candidateDob: candidateDob || "", candidateIdNumber: candidateIdNumber || "",
      provinceCity: provinceCity || "", email: "", orgName,
      requestingOrgName: requestingOrgName?.trim() || orgName,
      date: formatDateForVerification(), status,
      sapsWantedStatus: hasMatch ? "verifying_with_attorney" : "completed",
      verifier: "System",
      notes: hasMatch
        ? `Potential match on SAPS Wanted registry: ${sanitized.length} record(s). Verification halted pending attorney review.`
        : "No matches found in SAPS Wanted Persons registry. Clean record verified.",
      type: "saps_wanted", sendToCustomer: !hasMatch,
      sapsWantedHasRecords: hasMatch, sapsWantedMatches: sanitized,
      sapsWantedCompletedAt: hasMatch ? null : new Date().toISOString(),
      source: "api", createdAt: new Date().toISOString(),
    });

    return {
      data: {
        success: true, requestId: finalId,
        status: status.toLowerCase(), hasRecords: hasMatch, matchCount: sanitized.length,
      },
    };
  });
}
