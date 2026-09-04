/**
 * External API: Passport Status Check
 * POST /api/v1/external/verify/passport
 */

import { NextRequest } from "next/server";
import { processExternalApiRequest, generateVerificationId, formatDateForVerification } from "src/lib/externalApiHelpers";

export async function POST(req: NextRequest) {
  return processExternalApiRequest(req, "passport", async (db, auth, body) => {
    const { fileNumber, dateOfBirth, requestingOrgName } = body;

    if (!fileNumber?.trim() || !dateOfBirth?.trim()) {
      return { data: { error: "fileNumber and dateOfBirth are required" }, statusCode: 400 };
    }

    const orgName = auth.org.name;
    const finalId = await generateVerificationId(db, "PSP");

    // Query passport status via passport-track API
    const baseUrl = req.nextUrl.origin || process.env.NEXTAUTH_URL || "http://localhost:3000";
    let trackJson: any = null;
    try {
      const trackRes = await fetch(`${baseUrl}/api/passport-track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileNumber: fileNumber.trim(), dateOfBirth: dateOfBirth.trim() }),
      });
      trackJson = await trackRes.json();
      if (!trackRes.ok || !trackJson.success) {
        return {
          data: { error: trackJson?.error || "Passport verification query failed on government servers." },
          statusCode: 400,
        };
      }
    } catch (err: any) {
      return {
        data: { error: "Failed to connect to passport tracking service: " + (err?.message || String(err)) },
        statusCode: 502,
      };
    }

    const applicantDisplayName = trackJson.applicantName && trackJson.applicantName !== "—"
      ? trackJson.applicantName
      : `Passport: ${fileNumber.trim().toUpperCase()}`;

    const passportData = {
      fileNumber: trackJson.fileNumber || fileNumber.trim().toUpperCase(),
      dateOfBirth: trackJson.dateOfBirth || dateOfBirth.trim(),
      givenName: trackJson.givenName || "—",
      surname: trackJson.surname || "—",
      applicantName: trackJson.applicantName || "—",
      typeOfApplication: trackJson.typeOfApplication || "Normal",
      applicationReceivedDate: trackJson.applicationReceivedDate || "—",
      applicationRefNo: trackJson.applicationRefNo || "—",
      statusMessage: trackJson.status || "Status Retrieved Successfully",
      dataSource: trackJson.source || "api1",
      rawResponse: trackJson.rawResponse,
    };

    await db.collection("verifications").insertOne({
      id: finalId,
      name: applicantDisplayName,
      email: "",
      orgName,
      requestingOrgName: requestingOrgName?.trim() || orgName,
      date: formatDateForVerification(),
      status: "Completed",
      passportStatus: "completed",
      passportCompletedAt: new Date().toISOString(),
      verifier: "System",
      notes: `Passport status tracked successfully: ${passportData.statusMessage}`,
      type: "passport",
      passportFileNumber: fileNumber.trim().toUpperCase(),
      passportDob: dateOfBirth.trim(),
      passportData,
      source: "api",
      createdAt: new Date().toISOString(),
    });

    return {
      data: {
        success: true,
        requestId: finalId,
        status: "completed",
        candidateName: applicantDisplayName,
        fileNumber: passportData.fileNumber,
        passportStatus: passportData.statusMessage,
        details: passportData,
      },
    };
  });
}
