import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  requireRole,
  getOrgName,
  isErrorResponse,
  sanitizeVerification,
  sanitizeInvoice,
  sanitizeVerifier,
} from "src/lib/apiAuth";
import { connectToDatabase } from "src/lib/mongodb";
import { ObjectId } from "mongodb";
import { getClientIp, getUserAgent, logAuditEvent } from "shared/audit";

export async function GET(req: NextRequest) {
  try {
    // ── Auth: require authenticated client session ──
    const authResult = await requireAuth();
    if (isErrorResponse(authResult)) return authResult;
    const { user } = authResult;

    const roleError = requireRole(user, ["client", "org_owner"]);
    if (roleError) return roleError;

    const orgName = getOrgName(user);
    if (!orgName) {
      console.warn(`[DATA] Client user ${user.email} has no orgName in session`);
      return NextResponse.json({ error: "No organisation associated with your account" }, { status: 403 });
    }

    const { db } = await connectToDatabase();

    // ── Tenant-scoped queries — NEVER return all records ──
    // Settings: find by orgName (companyName field) 
    const settings = await db.collection("settings").findOne(
      { companyName: orgName },
      { projection: { password: 0 } }
    );

    // Verifications: only records belonging to this client's organisation and not soft-deleted
    const verifications = await db.collection("verifications").find(
      { orgName, isDeleted: { $ne: true } },
      { projection: { password: 0 } }
    ).toArray();

    // Invoices: only invoices for this client's organisation and not soft-deleted
    const invoices = await db.collection("invoices").find(
      { orgName, isDeleted: { $ne: true } },
      { projection: { password: 0 } }
    ).toArray();

    // Verifiers: return only verifiers belonging to this client's organisation and not soft-deleted
    const verifiers = await db.collection("verifiers").find(
      { org: orgName, isDeleted: { $ne: true } },
      { projection: { password: 0 } }
    ).toArray();

    // Organisation: only this client's own organisation and not soft-deleted
    const organisation = await db.collection("organisations").findOne(
      {
        name: { $regex: new RegExp("^" + orgName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") },
        isDeleted: { $ne: true }
      },
      { projection: { password: 0 } }
    );

    // ── Sanitize responses ──
    const ozcluSettings = await db.collection("settings").findOne(
      { id: "acme" },
      { projection: { password: 0 } }
    );

    const cleanSettings = settings
      ? { ...settings, _id: settings._id.toString() }
      : {
          id: orgName.replace(/\s+/g, "").toLowerCase(),
          companyName: orgName,
          address: "",
          city: "",
          postalCode: "",
          contactFirstName: "",
          contactLastName: "",
          contactEmail: user.email || "",
          billingOption: "invoice",
          cin: "",
          lut: "",
          tin: ""
        };

    const cleanVerifications = verifications.map(sanitizeVerification);
    const cleanInvoices = invoices.map(sanitizeInvoice);
    const cleanVerifiers = verifiers.map(v => {
      const clean = sanitizeVerifier(v);
      return {
        ...clean,
        ratePerVerification: organisation ? (organisation.monthlyRate || 0) : (clean.ratePerVerification || 0) // Display rate (identity); billing uses per-service org rates
      };
    });

    return NextResponse.json({
      settings: cleanSettings,
      ozcluSettings: ozcluSettings ? { ...ozcluSettings, _id: ozcluSettings._id.toString() } : null,
      verifications: cleanVerifications,
      invoices: cleanInvoices,
      verifiers: cleanVerifiers,
      organisation: organisation ? { ...organisation, _id: organisation._id.toString() } : null
    });
  } catch (error: any) {
    console.error("[DATA] Client portal GET error:", error.message);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth: require authenticated client session ──
    const authResult = await requireAuth();
    if (isErrorResponse(authResult)) return authResult;
    const { user } = authResult;

    const roleError = requireRole(user, ["client", "org_owner"]);
    if (roleError) return roleError;

    const sessionOrgName = getOrgName(user);

    const body = await req.json();
    const { action, payload } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);

    switch (action) {
      case "addVerification": {
        const { name, email, orgName, requestingOrgName, date, status, verifier, notes } = payload;

        // Security: force orgName to the session user's org (prevent cross-tenant creation),
        // unless it's an administrator session (Ozclu/Admin).
        const isAdminSession = sessionOrgName?.toLowerCase() === "ozclu" || sessionOrgName?.toLowerCase() === "admin";
        const safeOrgName = isAdminSession ? orgName : (sessionOrgName || orgName);
        
        const cleanOrg = safeOrgName.replace(/[^a-zA-Z]/g, "").slice(0, 3).padEnd(3, "X").toUpperCase();
        
        const nowTime = new Date();
        const dd = String(nowTime.getDate()).padStart(2, "0");
        const mm = String(nowTime.getMonth() + 1).padStart(2, "0");
        const yy = String(nowTime.getFullYear()).slice(-2);
        const dateStr = `${dd}${mm}${yy}`;
        const prefix = `${cleanOrg}${dateStr}-`;
        
        const count = await db.collection("verifications").countDocuments({
          id: { $regex: `^${prefix}` }
        });
        const finalId = `${prefix}${String(count + 1).padStart(4, "0")}`;

        const { randomBytes } = await import("crypto");
        const bcrypt = await import("bcryptjs");

        // Generate a temporary password matching Ozclu@<random8chars>
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let randStr = "";
        const randomBytesArr = randomBytes(8);
        for (let i = 0; i < 8; i++) {
          randStr += charset.charAt(randomBytesArr[i] % charset.length);
        }
        const tempPassword = `Ozclu@${randStr}`;
        const hashedTempPassword = bcrypt.hashSync(tempPassword, 10);
        
        const existingUser = await db.collection("users").findOne({ email: email.toLowerCase().trim() });
        if (!existingUser) {
          await db.collection("users").insertOne({
            email: email.toLowerCase().trim(),
            password: hashedTempPassword,
            fullName: name,
            role: "candidate",
            orgName: safeOrgName,
            createdAt: new Date()
          });
        } else {
          await db.collection("users").updateOne(
            { email: email.toLowerCase().trim() },
            { $set: { password: hashedTempPassword, role: "candidate", fullName: name } }
          );
        }
 
        const initialAttempt = {
          date: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }).replace(/\u202f/g, " ").toLowerCase(),
          verifier: verifier || "Client Init",
          status: status || "Processing",
          notes: notes || "Verification request created by client."
        };
 
        // Build the direct login URL (with email and password query parameters)
        const candidatePortalUrl = process.env.CANDIDATE_PORTAL_URL || "https://candidate.verify.ozclu.in";
        const setupUrl = `${candidatePortalUrl}/?email=${encodeURIComponent(email.toLowerCase().trim())}&password=${encodeURIComponent(tempPassword)}`;
 
        await db.collection("verifications").insertOne({
          id: finalId,
          name,
          email: email.toLowerCase().trim(),
          orgName: safeOrgName,
          requestingOrgName: requestingOrgName || safeOrgName,
          date,
          status,
          verifier,
          notes,
          onboardingStatus: "active",
          tempPassword,
          attempts: [initialAttempt],
          setupUrl,
          createdAt: new Date().toISOString()
        });
 
        if (requestingOrgName && requestingOrgName.trim()) {
          const trimmedOrg = requestingOrgName.trim();
          await db.collection("settings").updateOne(
            { companyName: safeOrgName },
            { $addToSet: { recentRequestingOrgs: trimmedOrg } },
            { upsert: true }
          );
        }

        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "verification_created",
          targetType: "verification",
          targetId: finalId,
          ip,
          userAgent,
          outcome: "success"
        });
 
        return NextResponse.json({ success: true, id: finalId, setupUrl });
      }
      case "removeRecentRequestingOrg": {
        const { requestingOrgName } = payload;
        await db.collection("settings").updateOne(
          { companyName: sessionOrgName },
          { $pull: { recentRequestingOrgs: requestingOrgName } }
        );
        return NextResponse.json({ success: true });
      }
      case "updateSettings": {
        const { companyName, address, city, postalCode, contactFirstName, contactLastName, contactEmail, billingOption, cin, lut, tin, gstin, invoiceEmail, billingSameAsCompany, billingAddress, logo } = payload;
        // Security: always scope settings update to the session user's org
        await db.collection("settings").updateOne(
          { companyName: sessionOrgName },
          {
            $set: {
              companyName: sessionOrgName,
              address, city, postalCode, contactFirstName, contactLastName, contactEmail, billingOption, cin, lut, tin, gstin, invoiceEmail, billingSameAsCompany, billingAddress, logo
            }
          },
          { upsert: true }
        );
        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "settings_updated",
          targetType: "settings",
          targetId: sessionOrgName,
          ip,
          userAgent,
          outcome: "success"
        });
        break;
      }
      case "inviteVerifier": {
        if (user.role !== "org_owner") {
          return NextResponse.json({ error: "Access denied. Only organisation owners can invite verifiers." }, { status: 403 });
        }

        const { id, name, email, org, status, password } = payload;
        
        // Force organization to session organisation for security
        const targetOrgName = sessionOrgName || org;

        // Count verifiers and check limit
        const organisation = await db.collection("organisations").findOne({
          name: targetOrgName,
          isDeleted: { $ne: true }
        });
        const maxV = organisation?.maxVerifiers ?? 5;
        const activeCount = await db.collection("verifiers").countDocuments({
          org: targetOrgName,
          status: "Active",
          isDeleted: { $ne: true }
        });

        if (activeCount >= maxV) {
          return NextResponse.json({ error: `Cannot invite verifier. Maximum active verifier limit of ${maxV} reached. Deactivate an existing verifier to free up a slot.` }, { status: 400 });
        }

        // ratePerVerification is display-only (identity rate); billing uses per-service org rates
        await db.collection("verifiers").insertOne({
          id, name, email, org: targetOrgName, status, createdBy: user.email, ratePerVerification: organisation?.monthlyRate || 0
        });
        
        if (password) {
          const bcrypt = await import("bcryptjs");
          const hashedPassword = bcrypt.hashSync(password, 10);
          
          const existingUser = await db.collection("users").findOne({ email: email.toLowerCase().trim() });
          if (!existingUser) {
            await db.collection("users").insertOne({
              email: email.toLowerCase().trim(),
              password: hashedPassword,
              fullName: name,
              role: "client",
              orgName: targetOrgName,
              createdAt: new Date()
            });
          }
        }
        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "verifier_invited",
          targetType: "verifier",
          targetId: id,
          ip,
          userAgent,
          outcome: "success"
        });
        break;
      }
      case "updateVerifierStatus": {
        if (user.role !== "org_owner") {
          return NextResponse.json({ error: "Access denied. Only organisation owners can update verifier status." }, { status: 403 });
        }
        const { verifierId, status: newStatus } = payload;
        // Security: only update verifiers belonging to this org
        const verifierDoc = await db.collection("verifiers").findOne({ id: verifierId, org: sessionOrgName, isDeleted: { $ne: true } });
        if (!verifierDoc) {
          return NextResponse.json({ error: "Verifier not found or does not belong to your organisation." }, { status: 404 });
        }
        // Prevent deactivating yourself (the owner)
        if (verifierDoc.isOwner && newStatus === "Inactive") {
          return NextResponse.json({ error: "Cannot deactivate the organisation owner account." }, { status: 400 });
        }
        await db.collection("verifiers").updateOne(
          { id: verifierId },
          { $set: { status: newStatus } }
        );
        break;
      }
      case "updateInvoiceStatus": {
        const { id, _id, status, paymentProof, paymentProofDate } = payload;
        // Security: only update invoice if it belongs to this org
        const query: any = { orgName: sessionOrgName };
        if (_id) {
          query._id = new ObjectId(String(_id));
        } else {
          query.id = id;
        }

        const existingInvoice = await db.collection("invoices").findOne(query);
        if (!existingInvoice) {
          console.warn(`[AUTH] Client ${user.email} attempted to update invoice ${id || _id} not belonging to org ${sessionOrgName}`);
          return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        }
        const updateFields: any = { status };
        if (paymentProof !== undefined) updateFields.paymentProof = paymentProof;
        if (paymentProofDate !== undefined) updateFields.paymentProofDate = paymentProofDate;
        await db.collection("invoices").updateOne(
          { _id: existingInvoice._id },
          { $set: updateFields }
        );
        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "invoice_updated",
          targetType: "invoice",
          targetId: existingInvoice.id,
          ip,
          userAgent,
          outcome: "success",
          metadata: { status }
        });
        break;
      }
      case "submitPaymentProof": {
        const { id, _id, paymentProof, paymentProofDate, clientNote, activityLog } = payload;
        // Security: only update invoice if it belongs to this org
        const query: any = { orgName: sessionOrgName };
        if (_id) {
          query._id = new ObjectId(String(_id));
        } else {
          query.id = id;
        }

        const existingInvoice = await db.collection("invoices").findOne(query);
        if (!existingInvoice) {
          console.warn(`[AUTH] Client ${user.email} attempted to submit proof for invoice ${id || _id} not belonging to org ${sessionOrgName}`);
          return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
        }

        const updateDoc: any = {
          status: "Pending",
          paymentProof,
          paymentProofDate,
          clientNote: clientNote || "",
          rejectionReason: ""
        };
        if (activityLog) {
          updateDoc.activityLog = activityLog;
        }

        await db.collection("invoices").updateOne(
          { _id: existingInvoice._id },
          { $set: updateDoc }
        );
        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "payment_proof_submitted",
          targetType: "invoice",
          targetId: existingInvoice.id,
          ip,
          userAgent,
          outcome: "success"
        });
        break;
      }
      case "addInvoice": {
        const { id, orgName, date, dueDate, amount, status, generationType, activityLog } = payload;
        // Security: force orgName to session org
        await db.collection("invoices").insertOne({
          id, orgName: sessionOrgName || orgName, date, dueDate, amount, status, generationType: generationType || "Manual", activityLog: activityLog || []
        });
        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "invoice_created",
          targetType: "invoice",
          targetId: id,
          ip,
          userAgent,
          outcome: "success"
        });
        break;
      }
      case "assignVerifier": {
        const { verificationId, verifierName } = payload;
        // Security: only update verification if it belongs to this org
        const existingVerification = await db.collection("verifications").findOne({ id: verificationId, orgName: sessionOrgName });
        if (!existingVerification) {
          console.warn(`[AUTH] Client ${user.email} attempted to assign verifier to ${verificationId} not belonging to org ${sessionOrgName}`);
          return NextResponse.json({ error: "Verification not found" }, { status: 404 });
        }
        await db.collection("verifications").updateOne(
          { id: verificationId, orgName: sessionOrgName },
          { $set: { verifier: verifierName } }
        );
        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "verifier_assigned",
          targetType: "verification",
          targetId: verificationId,
          ip,
          userAgent,
          outcome: "success",
          metadata: { verifierName }
        });
        break;
      }
      case "updateVerificationStatus": {
        const { verificationId, status, notes, reportDetails } = payload;
        // Security: only update verification if it belongs to this org
        const existingVerification = await db.collection("verifications").findOne({ id: verificationId, orgName: sessionOrgName });
        if (!existingVerification) {
          console.warn(`[AUTH] Client ${user.email} attempted to update status of ${verificationId} not belonging to org ${sessionOrgName}`);
          return NextResponse.json({ error: "Verification not found" }, { status: 404 });
        }
        const updateDoc: any = { status };
        if (notes !== undefined) {
          updateDoc.notes = notes;
        }
        if (reportDetails !== undefined) {
          updateDoc.reportDetails = reportDetails;
        }
        await db.collection("verifications").updateOne(
          { id: verificationId, orgName: sessionOrgName },
          { $set: updateDoc }
        );
        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "verification_status_changed",
          targetType: "verification",
          targetId: verificationId,
          ip,
          userAgent,
          outcome: "success",
          metadata: { status }
        });
        break;
      }
      case "addEmploymentVerification": {
        const { name, mobile, email, orgName, requestingOrgName: empReqOrgName, skipCandidateLogin, employments } = payload;

        if (!name?.trim()) {
          return NextResponse.json({ error: "Candidate name is required" }, { status: 400 });
        }
        if (!skipCandidateLogin && !email?.trim()) {
          return NextResponse.json({ error: "Candidate email is required" }, { status: 400 });
        }

        const validEmployments = Array.isArray(employments) ? employments.filter(e => e?.companyName?.trim()) : [];
        const itemCount = validEmployments.length > 0 ? validEmployments.length : 1;

        const isAdminSession = sessionOrgName?.toLowerCase() === "ozclu" || sessionOrgName?.toLowerCase() === "admin";
        const safeOrgName = isAdminSession ? (orgName || sessionOrgName) : (sessionOrgName || orgName);

        const defaultCountryRates: Record<string, number> = { Singapore: 15, Malaysia: 12, Philippines: 10, UAE: 20, India: 5 };
        const orgDoc = await db.collection("organisations").findOne({
          name: { $regex: new RegExp("^" + (safeOrgName || "").replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") }
        });

        // Calculate per-item country-specific pricing
        const employmentsWithCountry = validEmployments.map(e => ({
          ...e,
          country: e.country || "India"
        }));
        const serviceCharge = employmentsWithCountry.length > 0
          ? employmentsWithCountry.reduce((sum: number, e: any) => {
              const itemCountry = e.country || "India";
              const rate = orgDoc?.employmentRates?.[itemCountry] ?? (defaultCountryRates[itemCountry] || 5);
              return sum + rate;
            }, 0)
          : (orgDoc?.employmentRates?.["India"] ?? (defaultCountryRates["India"] || 5));

        // Derive countries list for the verification document
        const countriesList = [...new Set(employmentsWithCountry.map(e => e.country))];
        const country = countriesList.join(", ");

        const cleanOrg = (safeOrgName || "XXX").replace(/[^a-zA-Z]/g, "").slice(0, 3).padEnd(3, "X").toUpperCase();
        const nowTime = new Date();
        const dd = String(nowTime.getDate()).padStart(2, "0");
        const mm = String(nowTime.getMonth() + 1).padStart(2, "0");
        const yy = String(nowTime.getFullYear()).slice(-2);
        const dateStr = `${dd}${mm}${yy}`;
        const prefix = `${cleanOrg}${dateStr}-`;

        const count = await db.collection("verifications").countDocuments({
          id: { $regex: `^${prefix}` }
        });
        const finalId = `${prefix}${String(count + 1).padStart(4, "0")}`;

        let tempPassword: string | null = null;
        let setupUrl: string | null = null;

        if (!skipCandidateLogin && email?.trim()) {
          const { randomBytes } = await import("crypto");
          const bcrypt = await import("bcryptjs");

          const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
          let randStr = "";
          const randomBytesArr = randomBytes(8);
          for (let i = 0; i < 8; i++) {
            randStr += charset.charAt(randomBytesArr[i] % charset.length);
          }
          tempPassword = `Ozclu@${randStr}`;
          const hashedTempPassword = bcrypt.hashSync(tempPassword, 10);

          const existingUser = await db.collection("users").findOne({ email: email.toLowerCase().trim() });
          if (!existingUser) {
            await db.collection("users").insertOne({
              email: email.toLowerCase().trim(),
              password: hashedTempPassword,
              fullName: name,
              role: "candidate",
              orgName: safeOrgName,
              createdAt: new Date()
            });
          } else {
            await db.collection("users").updateOne(
              { email: email.toLowerCase().trim() },
              { $set: { password: hashedTempPassword, role: "candidate", fullName: name } }
            );
          }

          const candidatePortalUrl = process.env.CANDIDATE_PORTAL_URL || "https://candidate.verify.ozclu.in";
          setupUrl = `${candidatePortalUrl}/?email=${encodeURIComponent(email.toLowerCase().trim())}&password=${encodeURIComponent(tempPassword)}`;
        }

        const dateFormatted = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

        const initialAttempt = {
          date: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }).replace(/\u202f/g, " ").toLowerCase(),
          verifier: "Client Init",
          status: "Processing",
          notes: skipCandidateLogin ? `Employment verification created directly by client (${itemCount} check(s), candidate login skipped).` : `Employment verification request created by client (${itemCount} check(s)).`
        };

        await db.collection("verifications").insertOne({
          id: finalId,
          name,
          email: (email || "").toLowerCase().trim(),
          orgName: safeOrgName,
          requestingOrgName: empReqOrgName || safeOrgName,
          date: dateFormatted,
          status: "Processing",
          verifier: null,
          notes: skipCandidateLogin ? `Direct client submission (${itemCount} check(s)).` : "Awaiting candidate employment data submission.",
          type: "employment",
          candidateMobile: mobile || "",
          onboardingStatus: "active",
          tempPassword,
          skipCandidateLogin: !!skipCandidateLogin,
          employments: employmentsWithCountry,
          itemCount,
          serviceCharge,
          country,
          attempts: [initialAttempt],
          setupUrl,
          createdAt: new Date().toISOString()
        });

        if (empReqOrgName && empReqOrgName.trim()) {
          await db.collection("settings").updateOne(
            { companyName: safeOrgName },
            { $addToSet: { recentRequestingOrgs: empReqOrgName.trim() } },
            { upsert: true }
          );
        }

        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "employment_verification_created",
          targetType: "verification",
          targetId: finalId,
          ip,
          userAgent,
          outcome: "success"
        });

        return NextResponse.json({ success: true, id: finalId, setupUrl, skipCandidateLogin: !!skipCandidateLogin });
      }
      case "addEducationVerification": {
        const { name, mobile, email, orgName, requestingOrgName: eduReqOrgName, skipCandidateLogin, educationList } = payload;

        if (!name?.trim()) {
          return NextResponse.json({ error: "Candidate name is required" }, { status: 400 });
        }
        if (!skipCandidateLogin && !email?.trim()) {
          return NextResponse.json({ error: "Candidate email is required" }, { status: 400 });
        }

        const validEducation = Array.isArray(educationList) ? educationList.filter(e => e?.boardUniversity?.trim()) : [];
        const itemCount = validEducation.length > 0 ? validEducation.length : 1;

        const isAdminSession = sessionOrgName?.toLowerCase() === "ozclu" || sessionOrgName?.toLowerCase() === "admin";
        const safeOrgName = isAdminSession ? (orgName || sessionOrgName) : (sessionOrgName || orgName);

        const defaultCountryRates: Record<string, number> = { Singapore: 15, Malaysia: 12, Philippines: 10, UAE: 20, India: 5 };
        const orgDoc = await db.collection("organisations").findOne({
          name: { $regex: new RegExp("^" + (safeOrgName || "").replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") }
        });

        // Calculate per-item country-specific pricing
        const educationWithCountry = validEducation.map(e => ({
          ...e,
          country: e.country || "India"
        }));
        const serviceCharge = educationWithCountry.length > 0
          ? educationWithCountry.reduce((sum: number, e: any) => {
              const itemCountry = e.country || "India";
              const rate = orgDoc?.educationRates?.[itemCountry] ?? (defaultCountryRates[itemCountry] || 5);
              return sum + rate;
            }, 0)
          : (orgDoc?.educationRates?.["India"] ?? (defaultCountryRates["India"] || 5));

        // Derive countries list for the verification document
        const countriesList = [...new Set(educationWithCountry.map(e => e.country))];
        const country = countriesList.join(", ");

        const cleanOrg = (safeOrgName || "XXX").replace(/[^a-zA-Z]/g, "").slice(0, 3).padEnd(3, "X").toUpperCase();
        const nowTime = new Date();
        const dd = String(nowTime.getDate()).padStart(2, "0");
        const mm = String(nowTime.getMonth() + 1).padStart(2, "0");
        const yy = String(nowTime.getFullYear()).slice(-2);
        const dateStr = `${dd}${mm}${yy}`;
        const prefix = `${cleanOrg}${dateStr}-`;

        const count = await db.collection("verifications").countDocuments({
          id: { $regex: `^${prefix}` }
        });
        const finalId = `${prefix}${String(count + 1).padStart(4, "0")}`;

        let tempPassword: string | null = null;
        let setupUrl: string | null = null;

        if (!skipCandidateLogin && email?.trim()) {
          const { randomBytes } = await import("crypto");
          const bcrypt = await import("bcryptjs");

          const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
          let randStr = "";
          const randomBytesArr = randomBytes(8);
          for (let i = 0; i < 8; i++) {
            randStr += charset.charAt(randomBytesArr[i] % charset.length);
          }
          tempPassword = `Ozclu@${randStr}`;
          const hashedTempPassword = bcrypt.hashSync(tempPassword, 10);

          const existingUser = await db.collection("users").findOne({ email: email.toLowerCase().trim() });
          if (!existingUser) {
            await db.collection("users").insertOne({
              email: email.toLowerCase().trim(),
              password: hashedTempPassword,
              fullName: name,
              role: "candidate",
              orgName: safeOrgName,
              createdAt: new Date()
            });
          } else {
            await db.collection("users").updateOne(
              { email: email.toLowerCase().trim() },
              { $set: { password: hashedTempPassword, role: "candidate", fullName: name } }
            );
          }

          const candidatePortalUrl = process.env.CANDIDATE_PORTAL_URL || "https://candidate.verify.ozclu.in";
          setupUrl = `${candidatePortalUrl}/?email=${encodeURIComponent(email.toLowerCase().trim())}&password=${encodeURIComponent(tempPassword)}`;
        }

        const dateFormatted = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

        const initialAttempt = {
          date: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }).replace(/\u202f/g, " ").toLowerCase(),
          verifier: "Client Init",
          status: "Processing",
          notes: skipCandidateLogin ? `Education verification created directly by client (${itemCount} check(s), candidate login skipped).` : `Education verification request created by client (${itemCount} check(s)).`
        };

        await db.collection("verifications").insertOne({
          id: finalId,
          name,
          email: (email || "").toLowerCase().trim(),
          orgName: safeOrgName,
          requestingOrgName: eduReqOrgName || safeOrgName,
          date: dateFormatted,
          status: "Processing",
          verifier: null,
          notes: skipCandidateLogin ? `Direct client submission (${itemCount} check(s)).` : "Awaiting candidate education data submission.",
          type: "education",
          candidateMobile: mobile || "",
          onboardingStatus: "active",
          tempPassword,
          skipCandidateLogin: !!skipCandidateLogin,
          educationList: educationWithCountry,
          itemCount,
          serviceCharge,
          country,
          attempts: [initialAttempt],
          setupUrl,
          createdAt: new Date().toISOString()
        });

        if (eduReqOrgName && eduReqOrgName.trim()) {
          await db.collection("settings").updateOne(
            { companyName: safeOrgName },
            { $addToSet: { recentRequestingOrgs: eduReqOrgName.trim() } },
            { upsert: true }
          );
        }

        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "education_verification_created",
          targetType: "verification",
          targetId: finalId,
          ip,
          userAgent,
          outcome: "success"
        });

        return NextResponse.json({ success: true, id: finalId, setupUrl, skipCandidateLogin: !!skipCandidateLogin });
      }
      case "submitEmploymentData": {
        const { verificationId, employmentData } = payload;
        if (!verificationId || !employmentData) {
          return NextResponse.json({ error: "Verification ID and employment data are required" }, { status: 400 });
        }

        const existingVer = await db.collection("verifications").findOne({ id: verificationId });
        if (!existingVer) {
          return NextResponse.json({ error: "Verification request not found" }, { status: 404 });
        }

        const submittedEmployments = Array.isArray(employmentData.employments) && employmentData.employments.length > 0
          ? employmentData.employments
          : (Array.isArray(employmentData.pastOrganisations) && employmentData.pastOrganisations.length > 0
              ? employmentData.pastOrganisations
              : [employmentData]);

        const validEmps = submittedEmployments.filter((e: any) => e?.companyName?.trim() || e?.position?.trim());
        const itemCount = validEmps.length > 0 ? validEmps.length : 1;

        const defaultCountryRates: Record<string, number> = { Singapore: 15, Malaysia: 12, Philippines: 10, UAE: 20, India: 5 };
        const safeOrgName = existingVer.orgName;
        const orgDoc = await db.collection("organisations").findOne({
          name: { $regex: new RegExp("^" + (safeOrgName || "").replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") }
        });

        const serviceCharge = (validEmps.length > 0 ? validEmps : [employmentData]).reduce((sum: number, e: any) => {
          const itemCountry = e.country || "India";
          const rate = orgDoc?.employmentRates?.[itemCountry] ?? (defaultCountryRates[itemCountry] || 5);
          return sum + rate;
        }, 0);

        const countriesList = [...new Set((validEmps.length > 0 ? validEmps : [employmentData]).map((e: any) => e.country || "India"))];
        const country = countriesList.join(", ");

        const result = await db.collection("verifications").updateOne(
          { id: verificationId },
          {
            $set: {
              employmentData: {
                country: employmentData.country || "",
                state: employmentData.state || "",
                city: employmentData.city || "",
                companyName: employmentData.companyName || "",
                addressLine1: employmentData.addressLine1 || "",
                addressLine2: employmentData.addressLine2 || "",
                companyTelephoneCode: employmentData.companyTelephoneCode || "+91",
                companyTelephone: employmentData.companyTelephone || "",
                department: employmentData.department || "",
                position: employmentData.position || "",
                employmentPeriodFrom: employmentData.employmentPeriodFrom || "",
                employmentPeriodTo: employmentData.employmentPeriodTo || "",
                employeeCode: employmentData.employeeCode || "",
                reportingManagerName: employmentData.reportingManagerName || "",
                reportingManagerDepartment: employmentData.reportingManagerDepartment || "",
                reportingManagerContactCode: employmentData.reportingManagerContactCode || "+91",
                reportingManagerContact: employmentData.reportingManagerContact || "",
                reportingManagerEmail: employmentData.reportingManagerEmail || "",
                annualCTC: employmentData.annualCTC || "",
                employmentType: employmentData.employmentType || "",
                agencyDetails: employmentData.agencyDetails || "",
                reasonForLeaving: employmentData.reasonForLeaving || "",
                remarks: employmentData.remarks || "",
              },
              ...(Array.isArray(employmentData.pastOrganisations) ? { pastOrganisations: employmentData.pastOrganisations } : {}),
              ...(Array.isArray(employmentData.employments) ? { employments: employmentData.employments } : {}),
              itemCount,
              serviceCharge,
              country,
              employmentDataSubmitted: true,
              employmentDataSubmittedAt: new Date().toISOString(),
              updatedAt: new Date()
            }
          }
        );
        return NextResponse.json({ success: true });
      }
      case "submitEducationData": {
        const { verificationId, educationData } = payload;
        if (!verificationId || !educationData) {
          return NextResponse.json({ error: "Verification ID and education data are required" }, { status: 400 });
        }

        const existingVer = await db.collection("verifications").findOne({ id: verificationId });
        if (!existingVer) {
          return NextResponse.json({ error: "Verification request not found" }, { status: 404 });
        }

        const defaultCountryRates: Record<string, number> = { Singapore: 15, Malaysia: 12, Philippines: 10, UAE: 20, India: 5 };
        const safeOrgName = existingVer.orgName;
        const orgDoc = await db.collection("organisations").findOne({
          name: { $regex: new RegExp("^" + (safeOrgName || "").replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") }
        });

        const itemCountry = educationData.country || "India";
        const serviceCharge = orgDoc?.educationRates?.[itemCountry] ?? (defaultCountryRates[itemCountry] || 5);
        const country = itemCountry;

        const result = await db.collection("verifications").updateOne(
          { id: verificationId },
          {
            $set: {
              educationData: {
                country: educationData.country || "",
                degreeType: educationData.degreeType || "",
                courseName: educationData.courseName || "",
                boardUniversity: educationData.boardUniversity || "",
                institutionName: educationData.institutionName || "",
                rollNumber: educationData.rollNumber || "",
                passingYear: educationData.passingYear || "",
                certificateFile: educationData.certificateFile || "",
                certificateFileName: educationData.certificateFileName || "",
              },
              serviceCharge,
              country,
              educationDataSubmitted: true,
              educationDataSubmittedAt: new Date().toISOString(),
              updatedAt: new Date()
            }
          }
        );
        return NextResponse.json({ success: true });
      }
      case "addCourtRecordVerification": {
        const { candidateName, candidateDob, candidateFatherName, candidateMotherName, candidateIsMarried, candidateHusbandName, gender, idProofType, idProofNumber, idProofFile, addresses, orgName, requestingOrgName: reqOrgName } = payload;

        if (!candidateName?.trim() || !addresses || !Array.isArray(addresses) || addresses.length === 0) {
          return NextResponse.json({ error: "Candidate name and at least one address are required" }, { status: 400 });
        }

        const isAdminSession = sessionOrgName?.toLowerCase() === "ozclu" || sessionOrgName?.toLowerCase() === "admin";
        const safeOrgName = isAdminSession ? (orgName || sessionOrgName) : (sessionOrgName || orgName);

        const cleanOrg = (safeOrgName || "XXX").replace(/[^a-zA-Z]/g, "").slice(0, 3).padEnd(3, "X").toUpperCase();
        const nowTime = new Date();
        const dd = String(nowTime.getDate()).padStart(2, "0");
        const mm = String(nowTime.getMonth() + 1).padStart(2, "0");
        const yy = String(nowTime.getFullYear()).slice(-2);
        const dateStr = `${dd}${mm}${yy}`;
        const prefix = `${cleanOrg}${dateStr}-`;

        const count = await db.collection("verifications").countDocuments({
          id: { $regex: `^${prefix}` }
        });
        const finalId = `${prefix}${String(count + 1).padStart(4, "0")}`;

        const dateFormatted = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

        const initialAttempt = {
          date: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }).replace(/\u202f/g, " ").toLowerCase(),
          verifier: "System",
          status: "Processing",
          notes: "Court record verification request created. eCourts search initiated."
        };

        await db.collection("verifications").insertOne({
          id: finalId,
          name: candidateName.trim(),
          email: "",
          orgName: safeOrgName,
          requestingOrgName: reqOrgName || safeOrgName,
          date: dateFormatted,
          status: "Processing",
          verifier: null,
          notes: "Court record search in progress...",
          type: "court_record",
          candidateDob: candidateDob || "",
          candidateFatherName: candidateFatherName?.trim() || "",
          candidateMotherName: candidateMotherName?.trim() || "",
          candidateIsMarried: !!candidateIsMarried,
          candidateHusbandName: candidateIsMarried ? (candidateHusbandName?.trim() || "") : "",
          gender: gender || "",
          idProofType: idProofType || "",
          idProofNumber: idProofNumber?.trim() || "",
          idProofFile: idProofFile || "",
          addresses,
          courtRecordStatus: "pending",
          courtRecordSummary: "Search in progress...",
          attempts: [initialAttempt],
          createdAt: new Date().toISOString()
        });

        if (reqOrgName && reqOrgName.trim()) {
          await db.collection("settings").updateOne(
            { companyName: safeOrgName },
            { $addToSet: { recentRequestingOrgs: reqOrgName.trim() } },
            { upsert: true }
          );
        }

        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "court_record_verification_created",
          targetType: "verification",
          targetId: finalId,
          ip,
          userAgent,
          outcome: "success"
        });

        // Fire and forget the eCourts search (it runs in the background)
        const baseUrl = req.headers.get("origin") || req.headers.get("host") || "";
        const searchUrl = baseUrl.startsWith("http") ? `${baseUrl}/api/ecourts-search` : `http://${baseUrl}/api/ecourts-search`;

        // Get the cookie header to forward auth
        const cookieHeader = req.headers.get("cookie") || "";

        fetch(searchUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cookie": cookieHeader,
          },
          body: JSON.stringify({
            verificationId: finalId,
            candidateName: candidateName.trim(),
            addresses,
          }),
        }).catch((err) => {
          console.error(`[ECOURTS] Failed to trigger search for ${finalId}:`, err.message);
        });

        return NextResponse.json({ success: true, id: finalId });
      }
      case "addInterpolVerification": {
        const { candidateName, candidateDob, birthCity, orgName, requestingOrgName: reqOrgName } = payload;

        if (!candidateName?.trim() || !candidateDob?.trim()) {
          return NextResponse.json({ error: "Candidate name and date of birth are required" }, { status: 400 });
        }

        const isAdminSession = sessionOrgName?.toLowerCase() === "ozclu" || sessionOrgName?.toLowerCase() === "admin";
        const safeOrgName = isAdminSession ? (orgName || sessionOrgName) : (sessionOrgName || orgName);

        const cleanOrg = (safeOrgName || "XXX").replace(/[^a-zA-Z]/g, "").slice(0, 3).padEnd(3, "X").toUpperCase();
        const nowTime = new Date();
        const dd = String(nowTime.getDate()).padStart(2, "0");
        const mm = String(nowTime.getMonth() + 1).padStart(2, "0");
        const yy = String(nowTime.getFullYear()).slice(-2);
        const dateStr = `${dd}${mm}${yy}`;
        const prefix = `INT${dateStr}-`;

        const count = await db.collection("verifications").countDocuments({
          id: { $regex: `^${prefix}` }
        });
        const finalId = `${prefix}${String(count + 1).padStart(4, "0")}`;

        const extractBirthYear = (dobStr: string) => {
          if (!dobStr) return null;
          const match = dobStr.toString().match(/\b(19\d\d|20\d\d)\b/);
          return match ? parseInt(match[0], 10) : null;
        };
        const dobYear = extractBirthYear(candidateDob);

        const normalizeName = (str: string) => {
          if (!str) return "";
          return str
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .replace(/\s+/g, " ")
            .trim();
        };
        const searchNormalized = normalizeName(candidateName);

        let query: any = {};
        if (dobYear) {
          query.dobYear = dobYear;
        }

        const potentialMatches = await db.collection("interpol_notices").find(query).toArray();

        const inputWords = searchNormalized.split(" ").filter(w => w.length > 2);
        const matchedNotices = potentialMatches.filter((notice: any) => {
          const noticeNormalized = notice.normalizedName || "";
          
          // 1. Exact match
          if (searchNormalized === noticeNormalized) return true;
          
          // 2. Substring match
          if (searchNormalized.includes(noticeNormalized) || noticeNormalized.includes(searchNormalized)) return true;
          
          // 3. Word overlap
          const noticeWords = noticeNormalized.split(" ").filter((w: any) => w.length > 2);
          const commonWords = inputWords.filter(w => noticeWords.includes(w));
          
          if (commonWords.length >= 2) return true;
          if (inputWords.length > 0 && noticeWords.every((w: any) => inputWords.includes(w))) return true;
          if (noticeWords.length > 0 && inputWords.every((w: any) => noticeWords.includes(w))) return true;
          
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
              arrest_warrants: arrestWarrants.map((w: any) => ({
                charge: typeof w.charge === "string" ? w.charge : JSON.stringify(w.charge || ""),
                issuing_country_id: w.issuing_country_id || "",
              })),
              details: typeof rawDetails.details === "string" ? rawDetails.details : (rawDetails.case_details || ""),
              sex: rawDetails.sex_id || "",
              nationalities: Array.isArray(rawDetails.nationalities) ? rawDetails.nationalities.join(", ") : "",
              distinguishing_marks: typeof rawDetails.distinguishing_marks === "string" ? rawDetails.distinguishing_marks : "",
            },
          };
        });

        const hasRecords = sanitizedMatches.length > 0;
        const status = hasRecords ? "Needs Attention" : "Completed";
        const notes = hasRecords
          ? `Potential similarity match(es) found in Interpol database: ${sanitizedMatches.length} record(s).`
          : "No records found in Interpol database. Clean record verified.";

        const dateFormatted = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

        await db.collection("verifications").insertOne({
          id: finalId,
          name: candidateName.trim(),
          email: "",
          orgName: safeOrgName,
          requestingOrgName: reqOrgName || safeOrgName,
          date: dateFormatted,
          status: status,
          verifier: "System",
          notes: notes,
          type: "interpol",
          candidateDob: candidateDob,
          birthCity: birthCity?.trim() || "",
          interpolHasRecords: hasRecords,
          interpolMatches: sanitizedMatches,
          interpolCompletedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });

        if (reqOrgName && reqOrgName.trim()) {
          await db.collection("settings").updateOne(
            { companyName: safeOrgName },
            { $addToSet: { recentRequestingOrgs: reqOrgName.trim() } },
            { upsert: true }
          );
        }

        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "interpol_verification_created",
          targetType: "verification",
          targetId: finalId,
          ip,
          userAgent,
          outcome: "success"
        });

        return NextResponse.json({ success: true, id: finalId });
      }
      case "addPassportVerification": {
        const { fileNumber, dateOfBirth, orgName, requestingOrgName: reqOrgName } = payload;

        if (!fileNumber?.trim() || !dateOfBirth?.trim()) {
          return NextResponse.json({ error: "File number and date of birth are required" }, { status: 400 });
        }

        const isAdminSession = sessionOrgName?.toLowerCase() === "ozclu" || sessionOrgName?.toLowerCase() === "admin";
        const safeOrgName = isAdminSession ? (orgName || sessionOrgName) : (sessionOrgName || orgName);

        const cleanOrg = (safeOrgName || "XXX").replace(/[^a-zA-Z]/g, "").slice(0, 3).padEnd(3, "X").toUpperCase();
        const nowTime = new Date();
        const dd = String(nowTime.getDate()).padStart(2, "0");
        const mm = String(nowTime.getMonth() + 1).padStart(2, "0");
        const yy = String(nowTime.getFullYear()).slice(-2);
        const dateStr = `${dd}${mm}${yy}`;
        const prefix = `PAS${dateStr}-`;

        const count = await db.collection("verifications").countDocuments({
          id: { $regex: `^${prefix}` }
        });
        const finalId = `${prefix}${String(count + 1).padStart(4, "0")}`;

        let formattedDob = dateOfBirth.trim();
        if (formattedDob.includes('-')) {
          const parts = formattedDob.split('-');
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              formattedDob = `${parts[2]}/${parts[1]}/${parts[0]}`;
            } else {
              formattedDob = `${parts[0]}/${parts[1]}/${parts[2]}`;
            }
          }
        }

        // ── API1: Passport Seva (primary) ──
        const api1Headers = {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin': 'https://www.passportindia.gov.in',
          'Referer': 'https://www.passportindia.gov.in/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        };

        const api1Url = 'https://api1.passportindia.gov.in/v1/online/trackStatusForFileNo';
        const api1Payload = {
          requestResponseMap: {
            fileNo: fileNumber.trim().toUpperCase(),
            applDob: formattedDob,
            optStatus: 'Application_Status'
          }
        };

        let passportResult: any = null;
        let api1Error: string | null = null;
        let dataSource: string = 'api1';

        try {
          const apiRes = await fetch(api1Url, {
            method: 'POST',
            headers: api1Headers,
            body: JSON.stringify(api1Payload)
          });

          if (!apiRes.ok) {
            const errText = await apiRes.text();
            api1Error = `Passport India portal returned status ${apiRes.status}.`;
          } else {
            const data = await apiRes.json();
            if (data.strReturnString === 'error' || (data.fieldErrors && Object.keys(data.fieldErrors).length > 0)) {
              const fieldMsg = data.fieldErrors ? Object.values(data.fieldErrors).flat().join(', ') : '';
              api1Error = fieldMsg || 'Invalid File Number or Date of Birth.';
            } else {
              passportResult = data;
            }
          }
        } catch (err: any) {
          api1Error = err?.message || 'Failed to connect to Passport India server.';
        }

        // ── API2: Mission Portal (fallback) — only if API1 failed ──
        if (api1Error || !passportResult) {
          let api2Error: string | null = null;

          const api2Headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://mportal.passportindia.gov.in',
            'Referer': 'https://mportal.passportindia.gov.in/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
          };

          const api2Url = 'https://api2.passportindia.gov.in/v1/mproddc/online/gpsp/trackApplicationStatus';
          const api2Payload = {
            requestResponseMap: {
              refNo: fileNumber.trim().toUpperCase(),
              applDob: formattedDob,
              optStatus: 'Application_Status'
            }
          };

          try {
            const api2Res = await fetch(api2Url, {
              method: 'POST',
              headers: api2Headers,
              body: JSON.stringify(api2Payload)
            });

            if (!api2Res.ok) {
              const errText = await api2Res.text();
              api2Error = `Mission Portal returned status ${api2Res.status}.`;
            } else {
              const data2 = await api2Res.json();
              if (data2.strReturnString === 'error') {
                const errMsg2 = data2.actionErrors?.join(', ') || 'Invalid ARN / File Number or Date of Birth.';
                api2Error = errMsg2;
              } else {
                passportResult = data2;
                dataSource = 'api2_mportal';
              }
            }
          } catch (err2: any) {
            api2Error = err2?.message || 'Failed to connect to Mission Portal server.';
          }

          // If both APIs failed, return error
          if (api2Error || !passportResult) {
            return NextResponse.json({ error: api2Error || api1Error || 'Passport verification query failed on both portals.' }, { status: 400 });
          }
        }

        const map = passportResult.requestResponseMap || {};
        const appStatusObj = Array.isArray(map.applicationStatus) && map.applicationStatus.length > 0
          ? map.applicationStatus[0]
          : {};

        const passportData = {
          fileNumber: appStatusObj.FILE_NO || map.fileNo || map.refNo || fileNumber.trim().toUpperCase(),
          dateOfBirth: appStatusObj.DATE_OF_BIRTH || map.applDob || formattedDob,
          givenName: appStatusObj.APPL_GIVEN_NAME || '—',
          surname: appStatusObj.APPL_SURNAME || '—',
          applicantName: appStatusObj.APPL_GIVEN_NAME && appStatusObj.APPL_SURNAME
            ? `${appStatusObj.APPL_GIVEN_NAME} ${appStatusObj.APPL_SURNAME}`
            : appStatusObj.APPL_GIVEN_NAME || appStatusObj.APPL_SURNAME || '—',
          typeOfApplication: appStatusObj.PARAM_VALUE || 'Normal',
          applicationReceivedDate: appStatusObj.APP_SUB_DATE || '—',
          applicationRefNo: appStatusObj.APP_REF_NO_FK || '—',
          statusMessage: map.statusMessage || appStatusObj.STATUS_MESSAGE || 'Status Retrieved Successfully',
          dataSource,
          rawResponse: passportResult
        };

        const candidateDisplayName = passportData.givenName && passportData.givenName !== '—'
          ? `${passportData.givenName} ${passportData.surname !== '—' ? passportData.surname : ''}`.trim()
          : passportData.fileNumber;

        const dateFormatted = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

        await db.collection("verifications").insertOne({
          id: finalId,
          name: candidateDisplayName,
          email: "",
          orgName: safeOrgName,
          requestingOrgName: reqOrgName || safeOrgName,
          date: dateFormatted,
          status: "Completed",
          verifier: "System",
          notes: `Passport status tracked successfully: ${passportData.statusMessage}`,
          type: "passport",
          passportData,
          price: 15,
          createdAt: new Date().toISOString()
        });

        if (reqOrgName && reqOrgName.trim()) {
          await db.collection("settings").updateOne(
            { companyName: safeOrgName },
            { $addToSet: { recentRequestingOrgs: reqOrgName.trim() } },
            { upsert: true }
          );
        }

        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "passport_verification_created",
          targetType: "verification",
          targetId: finalId,
          ip,
          userAgent,
          outcome: "success"
        });

        return NextResponse.json({ success: true, id: finalId, passportData });
      }
      case "addDigitalAddressVerification": {
        const { candidateName, candidateEmail, candidateAddress, orgName, requestingOrgName: reqOrgName } = payload;

        if (!candidateName?.trim() || !candidateEmail?.trim() || !candidateAddress?.trim()) {
          return NextResponse.json({ error: "Candidate name, email, and address are required" }, { status: 400 });
        }

        const isAdminSession = sessionOrgName?.toLowerCase() === "ozclu" || sessionOrgName?.toLowerCase() === "admin";
        const safeOrgName = isAdminSession ? (orgName || sessionOrgName) : (sessionOrgName || orgName);

        const cleanOrg = (safeOrgName || "XXX").replace(/[^a-zA-Z]/g, "").slice(0, 3).padEnd(3, "X").toUpperCase();
        const nowTime = new Date();
        const dd = String(nowTime.getDate()).padStart(2, "0");
        const mm = String(nowTime.getMonth() + 1).padStart(2, "0");
        const yy = String(nowTime.getFullYear()).slice(-2);
        const dateStr = `${dd}${mm}${yy}`;
        const prefix = `DAV${dateStr}-`;

        const count = await db.collection("verifications").countDocuments({
          id: { $regex: `^${prefix}` }
        });
        const finalId = `${prefix}${String(count + 1).padStart(4, "0")}`;

        // Generate temporary password and create/update candidate user
        const { randomBytes } = await import("crypto");
        const bcrypt = await import("bcryptjs");

        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let randStr = "";
        const randomBytesArr = randomBytes(8);
        for (let i = 0; i < 8; i++) {
          randStr += charset.charAt(randomBytesArr[i] % charset.length);
        }
        const tempPassword = `Ozclu@${randStr}`;
        const hashedTempPassword = bcrypt.hashSync(tempPassword, 10);

        const emailLower = candidateEmail.toLowerCase().trim();
        const existingUser = await db.collection("users").findOne({ email: emailLower });
        if (!existingUser) {
          await db.collection("users").insertOne({
            email: emailLower,
            password: hashedTempPassword,
            fullName: candidateName.trim(),
            role: "candidate",
            orgName: safeOrgName,
            createdAt: new Date()
          });
        } else {
          await db.collection("users").updateOne(
            { email: emailLower },
            { $set: { password: hashedTempPassword, role: "candidate", fullName: candidateName.trim() } }
          );
        }

        const candidatePortalUrl = process.env.CANDIDATE_PORTAL_URL || "https://candidate.verify.ozclu.in";
        const setupUrl = `${candidatePortalUrl}/?email=${encodeURIComponent(emailLower)}&password=${encodeURIComponent(tempPassword)}`;

        const initialAttempt = {
          date: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true }).replace(/\u202f/g, " ").toLowerCase(),
          verifier: "Client Init",
          status: "Processing",
          notes: "Digital address verification request created by client. Awaiting candidate photo submission."
        };

        const dateFormatted = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

        await db.collection("verifications").insertOne({
          id: finalId,
          name: candidateName.trim(),
          email: emailLower,
          orgName: safeOrgName,
          requestingOrgName: reqOrgName || safeOrgName,
          candidateAddress: candidateAddress.trim(),
          date: dateFormatted,
          status: "Processing",
          verifier: null,
          notes: "Digital address verification request created. Awaiting candidate submission.",
          type: "digital_address",
          onboardingStatus: "active",
          tempPassword,
          attempts: [initialAttempt],
          setupUrl,
          digitalAddressSubmitted: false,
          createdAt: new Date().toISOString()
        });

        if (reqOrgName && reqOrgName.trim()) {
          await db.collection("settings").updateOne(
            { companyName: safeOrgName },
            { $addToSet: { recentRequestingOrgs: reqOrgName.trim() } },
            { upsert: true }
          );
        }

        await logAuditEvent(db, {
          actorUserId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          portal: "client",
          action: "digital_address_verification_created",
          targetType: "verification",
          targetId: finalId,
          ip,
          userAgent,
          outcome: "success"
        });

        return NextResponse.json({ success: true, id: finalId, setupUrl });
      }
      default:

        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DATA] Client portal POST error:", error.message);
    return NextResponse.json({ error: "Mutation failed" }, { status: 500 });
  }
}
