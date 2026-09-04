/**
 * External API: Court Record Verification
 * POST /api/v1/external/verify/court-record
 */

import { NextRequest } from "next/server";
import { processExternalApiRequest, generateVerificationId, orgPrefix, formatDateForVerification } from "src/lib/externalApiHelpers";

export async function POST(req: NextRequest) {
  return processExternalApiRequest(req, "court_record", async (db, auth, body) => {
    const { candidateName, candidateDob, fatherName, motherName, isMarried, husbandName, gender, idProofType, idProofNumber, addresses, requestingOrgName } = body;

    if (!candidateName?.trim() || !addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return { data: { error: "candidateName and at least one address (array) are required" }, statusCode: 400 };
    }

    const orgName = auth.org.name;
    const prefix = orgPrefix(orgName);
    const finalId = await generateVerificationId(db, prefix);

    await db.collection("verifications").insertOne({
      id: finalId,
      name: candidateName.trim(),
      email: "",
      orgName,
      requestingOrgName: requestingOrgName?.trim() || orgName,
      date: formatDateForVerification(),
      status: "Processing",
      verifier: null,
      notes: "Court record search in progress... (created via API)",
      type: "court_record",
      candidateDob: candidateDob || "",
      candidateFatherName: fatherName?.trim() || "",
      candidateMotherName: motherName?.trim() || "",
      candidateIsMarried: !!isMarried,
      candidateHusbandName: isMarried ? (husbandName?.trim() || "") : "",
      gender: gender || "",
      idProofType: idProofType || "",
      idProofNumber: idProofNumber?.trim() || "",
      addresses,
      courtRecordStatus: "pending",
      courtRecordSummary: "Search in progress...",
      source: "api",
      createdAt: new Date().toISOString(),
    });

    // Fire-and-forget eCourts search
    const baseUrl = req.nextUrl.origin || process.env.NEXTAUTH_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/ecourts-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": process.env.NEXTAUTH_SECRET || "",
      },
      body: JSON.stringify({ verificationId: finalId, candidateName: candidateName.trim(), addresses }),
    }).catch((err) => console.error(`[ECOURTS_API] Failed to trigger for ${finalId}:`, err.message));

    return {
      data: {
        success: true,
        requestId: finalId,
        status: "processing",
        message: "Court record verification created. eCourts search initiated.",
      },
    };
  });
}
