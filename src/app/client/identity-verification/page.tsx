"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { usePortal } from "src/context/PortalContext";
import { useAuth } from "src/context/AuthContext";
import {
  CheckCircle,
  AlertCircle,
  Send,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  UserPlus,
  X,
  Scale,
  Plus,
  Trash2,
  MapPin,
  Calendar,
  Building,
  ChevronDown,
} from "lucide-react";
import { INDIAN_STATES } from "src/lib/courts-mapping";

type ServiceType = "identity" | "court_record";

export default function IdentityVerification() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { addVerification, addCourtRecordVerification, settings, removeRecentRequestingOrg, organisation } = usePortal();

  // Service active switches based on admin config
  const identityEnabled = organisation?.identityEnabled !== false;
  const courtRecordEnabled = organisation?.courtRecordEnabled !== false;

  // Service selector state
  const [activeService, setActiveService] = useState<ServiceType>("identity");

  React.useEffect(() => {
    if (!identityEnabled && activeService === "identity" && courtRecordEnabled) {
      setActiveService("court_record");
    } else if (!courtRecordEnabled && activeService === "court_record" && identityEnabled) {
      setActiveService("identity");
    }
  }, [identityEnabled, courtRecordEnabled, activeService]);

  // ─── Identity Check States (existing) ───
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [requestingOrgName, setRequestingOrgName] = useState("");
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);

  const isAdmin = profile?.role === "admin" || profile?.org_name?.toLowerCase() === "ozclu" || profile?.org_name?.toLowerCase() === "admin";

  React.useEffect(() => {
    if (!isAdmin && profile?.org_name) {
      setOrgName(profile.org_name);
    }
  }, [profile, isAdmin]);

  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    email: string;
    setupUrl?: string;
  } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const recentOrgs = settings?.recentRequestingOrgs || [];
  const filteredOrgs = recentOrgs.filter(org =>
    org.toLowerCase().includes(requestingOrgName.toLowerCase())
  );

  // ─── Court Record Check States ───
  const currentYear = new Date().getFullYear();
  const [crCandidateName, setCrCandidateName] = useState("");
  const [crCandidateDob, setCrCandidateDob] = useState("");
  const [crRequestingOrgName, setCrRequestingOrgName] = useState("");
  const [crShowOrgDropdown, setCrShowOrgDropdown] = useState(false);
  const [crAddresses, setCrAddresses] = useState<
    Array<{ address: string; city: string; state: string; stateCode: string; districtCode: string; country: string; fromYear: number; toYear: number }>
  >([{ address: "", city: "", state: "", stateCode: "", districtCode: "", country: "India", fromYear: currentYear - 2, toYear: currentYear }]);
  const [crSuccessMsg, setCrSuccessMsg] = useState("");
  const [crErrorMsg, setCrErrorMsg] = useState("");
  const [crCreatedId, setCrCreatedId] = useState<string | null>(null);
  const [crSubmitting, setCrSubmitting] = useState(false);

  // District dropdowns state: stateCode -> { loading, districts[] }
  const [districtsCache, setDistrictsCache] = useState<
    Record<string, { loading: boolean; districts: Array<{ value: string; name: string }> }>
  >({});

  const crFilteredOrgs = recentOrgs.filter(org =>
    org.toLowerCase().includes(crRequestingOrgName.toLowerCase())
  );

  // Sorted states for dropdown
  const sortedStates = [...INDIAN_STATES].sort((a, b) => a.name.localeCompare(b.name));

  // Fetch districts for a state code
  const fetchDistrictsForState = async (stateCode: string) => {
    if (!stateCode) return;
    // Skip if already loaded or loading
    if (districtsCache[stateCode]?.districts?.length > 0 || districtsCache[stateCode]?.loading) return;

    setDistrictsCache((prev) => ({
      ...prev,
      [stateCode]: { loading: true, districts: [] },
    }));

    try {
      const res = await fetch(`/api/ecourts-districts?state_code=${stateCode}`);
      const data = await res.json();
      if (data.success && data.districts) {
        setDistrictsCache((prev) => ({
          ...prev,
          [stateCode]: { loading: false, districts: data.districts },
        }));
      } else {
        setDistrictsCache((prev) => ({
          ...prev,
          [stateCode]: { loading: false, districts: [] },
        }));
      }
    } catch (err) {
      console.error("Failed to fetch districts:", err);
      setDistrictsCache((prev) => ({
        ...prev,
        [stateCode]: { loading: false, districts: [] },
      }));
    }
  };

  // ─── Identity Check Handlers (existing) ───
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const isSettingsIncomplete = !settings ||
      !settings.contactFirstName?.trim() ||
      !settings.contactLastName?.trim() ||
      !settings.address?.trim() ||
      !settings.city?.trim() ||
      !settings.postalCode?.trim();

    if (isSettingsIncomplete) {
      setErrorMsg("Please complete your profile settings (First Name, Last Name, Address, City, and Postal Code) before creating requests.");
      return;
    }

    if (!candidateName.trim()) {
      setErrorMsg("Candidate Name is required");
      return;
    }
    if (!candidateEmail.trim()) {
      setErrorMsg("Candidate Email is required");
      return;
    }
    if (!orgName.trim()) {
      setErrorMsg("Organisation Name is required");
      return;
    }
    if (!requestingOrgName.trim()) {
      setErrorMsg("Requesting ORG Name is required");
      return;
    }

    try {
      const res = await addVerification(candidateName, candidateEmail, orgName, requestingOrgName);
      if (res && res.success) {
        setSuccessMsg("Verification request initiated successfully!");
        setCreatedCredentials({
          name: candidateName,
          email: candidateEmail.toLowerCase().trim(),
          setupUrl: res.setupUrl
        });
        setCandidateName("");
        setCandidateEmail("");
        setRequestingOrgName("");
      } else {
        setErrorMsg("Failed to initiate verification request");
      }
    } catch (err: any) {
      setErrorMsg("Failed to initiate verification request");
    }
  };

  const getUrlParams = (urlStr?: string) => {
    if (!urlStr) return { email: "", password: "" };
    try {
      const url = new URL(urlStr);
      return {
        email: url.searchParams.get("email") || "",
        password: url.searchParams.get("password") || ""
      };
    } catch (e) {
      return { email: "", password: "" };
    }
  };

  const handleCancel = () => {
    setCandidateName("");
    setCandidateEmail("");
    setOrgName(isAdmin ? "" : (profile?.org_name || ""));
    setRequestingOrgName("");
  };

  // ─── Court Record Check Handlers ───
  const addAddress = () => {
    setCrAddresses((prev) => [...prev, { address: "", city: "", state: "", stateCode: "", districtCode: "", country: "India", fromYear: currentYear - 2, toYear: currentYear }]);
  };

  const removeAddress = (index: number) => {
    if (crAddresses.length <= 1) return;
    setCrAddresses((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAddress = (index: number, field: keyof typeof crAddresses[0], value: string) => {
    setCrAddresses((prev) =>
      prev.map((addr, i) => (i === index ? { ...addr, [field]: value } : addr))
    );
  };

  const handleCourtRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCrErrorMsg("");
    setCrSuccessMsg("");
    setCrCreatedId(null);

    const isSettingsIncomplete = !settings ||
      !settings.contactFirstName?.trim() ||
      !settings.contactLastName?.trim() ||
      !settings.address?.trim() ||
      !settings.city?.trim() ||
      !settings.postalCode?.trim();

    if (isSettingsIncomplete) {
      setCrErrorMsg("Please complete your profile settings before creating requests.");
      return;
    }

    if (!crCandidateName.trim()) {
      setCrErrorMsg("Candidate Full Name is required");
      return;
    }
    if (!crCandidateDob) {
      setCrErrorMsg("Candidate Date of Birth is required");
      return;
    }

    // Validate addresses
    for (let i = 0; i < crAddresses.length; i++) {
      if (!crAddresses[i].state) {
        setCrErrorMsg(`Address ${i + 1}: State is required`);
        return;
      }
      if (!crAddresses[i].city.trim()) {
        setCrErrorMsg(`Address ${i + 1}: District is required`);
        return;
      }
      if (crAddresses[i].fromYear > crAddresses[i].toYear) {
        setCrErrorMsg(`Address ${i + 1}: "From Year" must be before or equal to "To Year"`);
        return;
      }
      if (crAddresses[i].toYear - crAddresses[i].fromYear + 1 > 3) {
        setCrErrorMsg(`Address ${i + 1}: Maximum 3-year search span allowed per address`);
        return;
      }
    }

    if (!crRequestingOrgName.trim()) {
      setCrErrorMsg("Requesting ORG Name is required");
      return;
    }

    setCrSubmitting(true);

    try {
      const effectiveOrgName = isAdmin ? (orgName || profile?.org_name || "Ozclu") : (profile?.org_name || orgName);

      const res = await addCourtRecordVerification({
        candidateName: crCandidateName.trim(),
        candidateDob: crCandidateDob,
        addresses: crAddresses,
        orgName: effectiveOrgName,
        requestingOrgName: crRequestingOrgName.trim(),
      });

      if (res && res.success) {
        setCrSuccessMsg("Court record verification initiated! Search is running in the background.");
        setCrCreatedId(res.id);
        setCrCandidateName("");
        setCrCandidateDob("");
        setCrAddresses([{ address: "", city: "", state: "", stateCode: "", districtCode: "", country: "India", fromYear: currentYear - 2, toYear: currentYear }]);
        setCrRequestingOrgName("");
      } else {
        setCrErrorMsg("Failed to initiate court record verification");
      }
    } catch (err: any) {
      setCrErrorMsg("Failed to initiate court record verification");
    } finally {
      setCrSubmitting(false);
    }
  };

  const handleCourtRecordCancel = () => {
    setCrCandidateName("");
    setCrCandidateDob("");
    setCrAddresses([{ address: "", city: "", state: "", stateCode: "", districtCode: "", country: "India", fromYear: currentYear - 2, toYear: currentYear }]);
    setCrRequestingOrgName("");
    setCrErrorMsg("");
    setCrSuccessMsg("");
    setCrCreatedId(null);
  };

  const isSettingsIncomplete = !settings ||
    !settings.contactFirstName?.trim() ||
    !settings.contactLastName?.trim() ||
    !settings.address?.trim() ||
    !settings.city?.trim() ||
    !settings.postalCode?.trim();

  return (
    <div className="flex flex-col gap-6 pt-4 animate-fade-in pb-12">
      <div className="flex flex-col gap-1 border-b border-[#f0f5ea] pb-5 mb-2">
        <div className="flex items-center gap-2 text-[10px] font-bold text-[#00450e] bg-[#f0f5ea]/60 px-2.5 py-1 rounded-full w-fit uppercase tracking-wider font-label-caps border border-[#eaf0e4]/60">
          <Sparkles className="w-3.5 h-3.5 text-[#181d16]" />
          <span>Quick verification</span>
        </div>
        <h2 className="font-display-lg text-primary font-bold tracking-tight text-3xl mt-2 text-[#181d16]">Candidate Verification</h2>
        <p className="text-secondary mt-1 text-sm">Select a verification service and initiate a new request.</p>
      </div>

      {/* Service Selector Tabs */}
      <div className="flex gap-3 max-w-2xl">
        {identityEnabled && (
          <button
            type="button"
            onClick={() => setActiveService("identity")}
            className={`flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer group ${
              activeService === "identity"
                ? "border-[#181d16] bg-white shadow-md"
                : "border-[#eaf0e4] bg-[#f6fbf0]/50 hover:border-[#d0dbc6] hover:bg-white/80"
            }`}
          >
            <div className={`p-2.5 rounded-xl transition-all ${
              activeService === "identity"
                ? "bg-[#181d16] text-white"
                : "bg-[#f0f5ea]/60 text-[#00450e] group-hover:bg-[#e0e8d8]"
            }`}>
              <UserPlus className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className={`font-semibold text-sm ${activeService === "identity" ? "text-[#181d16]" : "text-[#475569]"}`}>
                Identity Check
              </div>
              <div className="text-[11px] text-[#64748B] mt-0.5">DigiLocker verified identity</div>
            </div>
          </button>
        )}

        {courtRecordEnabled && (
          <button
            type="button"
            onClick={() => setActiveService("court_record")}
            className={`flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-300 cursor-pointer group ${
              activeService === "court_record"
                ? "border-[#181d16] bg-white shadow-md"
                : "border-[#eaf0e4] bg-[#f6fbf0]/50 hover:border-[#d0dbc6] hover:bg-white/80"
            }`}
          >
            <div className={`p-2.5 rounded-xl transition-all ${
              activeService === "court_record"
                ? "bg-[#181d16] text-white"
                : "bg-[#f0f5ea]/60 text-[#00450e] group-hover:bg-[#e0e8d8]"
            }`}>
              <Scale className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className={`font-semibold text-sm ${activeService === "court_record" ? "text-[#181d16]" : "text-[#475569]"}`}>
                Court Record Check
              </div>
              <div className="text-[11px] text-[#64748B] mt-0.5">eCourts India search</div>
            </div>
          </button>
        )}

        {!identityEnabled && !courtRecordEnabled && (
          <div className="flex-1 bg-rose-50 border border-rose-100 rounded-2xl p-4 text-center">
            <p className="text-xs font-bold text-rose-800">All verification services are currently deactivated by the administrator.</p>
          </div>
        )}
      </div>

      {/* Settings incomplete warning banner */}
      {isSettingsIncomplete && (
        <div className="bg-[#FFF8E6] text-[#8A5E00] border border-[#FFE7A3] rounded-xl p-4 font-body-sm flex items-start gap-3 max-w-2xl animate-fade-in shadow-2xs">
          <AlertCircle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-bold">Missing Required Profile Information</span>
            <p className="text-xs text-[#92400E] font-semibold leading-relaxed">
              You must set your First Name, Last Name, Address, City, and Postal Code (Zipcode) in Settings before you can create verification requests.
            </p>
            <button
              onClick={() => router.push("/client/settings")}
              className="mt-2 text-xs font-bold text-[#181d16] hover:underline flex items-center gap-1 w-fit"
            >
              Go to Settings <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* IDENTITY CHECK FORM (existing functionality) */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeService === "identity" && identityEnabled && (
        <>
          {/* Form Alerts */}
          {successMsg && !createdCredentials && (
            <div className="bg-[#E6F8F3] text-[#00684A] border border-[#A3EAD6] rounded-xl p-4 font-body-sm flex items-center gap-3 max-w-2xl animate-fade-in shadow-2xs">
              <CheckCircle className="w-5 h-5 text-[#00a877] shrink-0" />
              <span className="font-semibold">{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 text-red-800 border border-red-200 rounded-xl p-4 font-body-sm flex items-center gap-3 max-w-2xl animate-fade-in shadow-2xs">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          {/* Form Card */}
          <div className="bg-white border border-[#eaf0e4] rounded-3xl p-8 max-w-2xl shadow-sm relative overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1">
            {/* Top gradient line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#eaf0e4] via-[#FFF4CC] to-[#f0f5ea]"></div>

            {/* Subtle decorative background shapes */}
            <div className="absolute -right-12 -bottom-12 w-32 h-32 bg-[#f0f5ea]/35 rounded-full blur-2xl pointer-events-none"></div>
            <div className="absolute -left-12 -top-12 w-32 h-32 bg-[#FFF4CC]/20 rounded-full blur-2xl pointer-events-none"></div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6 mt-2 relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-[#f0f5ea]/40 rounded-xl border border-[#eaf0e4]/60">
                  <UserPlus className="w-5 h-5 text-[#00450e]" />
                </div>
                <h3 className="font-semibold text-[#181d16] text-lg">Identity Check</h3>
              </div>

              {/* Candidate Name Field */}
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[#475569] text-xs font-semibold uppercase tracking-wider" htmlFor="candidate-name">
                  Candidate Name
                </label>
                <input
                  id="candidate-name"
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  autoComplete="off"
                  disabled={isSettingsIncomplete}
                  className={`border border-[#eaf0e4] rounded-xl p-3.5 font-body-sm text-primary focus:outline-none focus:ring-2 focus:ring-[#eaf0e4] focus:border-[#181d16] transition-all bg-[#f6fbf0]/50 placeholder-slate-400 font-semibold ${
                    isSettingsIncomplete ? "bg-slate-100/60 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
                  }`}
                  placeholder="Enter the candidate name"
                />
              </div>

              {/* Candidate Email ID Field */}
              <div className="flex flex-col gap-2">
                <label className="font-label-caps text-[#475569] text-xs font-semibold uppercase tracking-wider" htmlFor="candidate-email">
                  Candidate Email ID
                </label>
                <input
                  id="candidate-email"
                  type="email"
                  value={candidateEmail}
                  onChange={(e) => setCandidateEmail(e.target.value)}
                  autoComplete="off"
                  disabled={isSettingsIncomplete}
                  className={`border border-[#eaf0e4] rounded-xl p-3.5 font-body-sm text-primary focus:outline-none focus:ring-2 focus:ring-[#eaf0e4] focus:border-[#181d16] transition-all bg-[#f6fbf0]/50 placeholder-slate-400 font-semibold ${
                    isSettingsIncomplete ? "bg-slate-100/60 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
                  }`}
                  placeholder="Enter the candidate email ID"
                />
              </div>

              {/* Requesting ORG Name Field */}
              <div className="flex flex-col gap-2 relative">
                <label className="font-label-caps text-[#475569] text-xs font-semibold uppercase tracking-wider" htmlFor="org-name">
                  {isAdmin ? "Target Client ORG Name" : "Requesting ORG Name"}
                </label>
                <div className="relative">
                  <input
                    id="org-name"
                    type="text"
                    value={requestingOrgName}
                    onChange={(e) => {
                      setRequestingOrgName(e.target.value);
                      setShowOrgDropdown(true);
                    }}
                    onFocus={() => setShowOrgDropdown(true)}
                    onBlur={() => {
                      setTimeout(() => setShowOrgDropdown(false), 200);
                    }}
                    autoComplete="off"
                    disabled={isSettingsIncomplete}
                    className={`w-full border border-[#eaf0e4] rounded-xl p-3.5 font-body-sm text-primary focus:outline-none focus:ring-2 focus:ring-[#eaf0e4] focus:border-[#181d16] transition-all bg-[#f6fbf0]/50 placeholder-slate-400 font-semibold ${
                      isSettingsIncomplete ? "bg-slate-100/60 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
                    }`}
                    placeholder={isAdmin ? "Enter target client organization name (e.g., TCS)" : "Enter the organization name requiring the verification"}
                  />

                  {showOrgDropdown && filteredOrgs.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-[#eaf0e4] rounded-xl shadow-lg z-30 overflow-hidden max-h-48 overflow-y-auto animate-fade-in">
                      <div className="p-1 flex flex-col gap-1 font-body-sm">
                        {filteredOrgs.map((org) => (
                          <div
                            key={org}
                            className="flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-[#f0f5ea]/35 text-[#181d16] font-semibold cursor-pointer group/item"
                            onMouseDown={() => {
                              setRequestingOrgName(org);
                              setShowOrgDropdown(false);
                            }}
                          >
                            <span className="flex-1 text-left">{org}</span>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (typeof removeRecentRequestingOrg === 'function') removeRecentRequestingOrg(org);
                              }}
                              title="Remove from history"
                              className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-650 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 mt-6 justify-end">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isSettingsIncomplete}
                  className={`px-6 py-3 border border-[#eaf0e4] rounded-xl font-semibold text-sm text-[#334155] hover:bg-[#f6fbf0] hover:text-[#181d16] transition-all bg-white ${
                    isSettingsIncomplete ? "opacity-50 cursor-not-allowed hover:bg-white hover:text-[#334155]" : "cursor-pointer"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSettingsIncomplete}
                  className={`px-6 py-3 bg-[#181d16] text-white hover:bg-[#1E293B] active:scale-95 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 shadow-sm group ${
                    isSettingsIncomplete ? "opacity-50 cursor-not-allowed hover:bg-[#181d16] active:scale-100" : "cursor-pointer"
                  }`}
                >
                  <span>Create Request</span>
                  <Send className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>
            </form>
          </div>

          {/* Credentials Modal */}
          {createdCredentials && (
            <div className="fixed inset-0 bg-slate-400/10 backdrop-blur-md flex items-center justify-center p-4 z-[99999] animate-fade-in">
              <div className="bg-white border border-[#eaf0e4] rounded-3xl p-8 max-w-lg w-full shadow-2xl relative animate-scale-up">
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="w-16 h-16 bg-[#E6F8F3] border border-[#A3EAD6] rounded-full flex items-center justify-center text-[#00684A] mb-2 animate-bounce-subtle">
                    <CheckCircle className="w-8 h-8 text-[#00a877]" />
                  </div>
                  <h3 className="font-headline-md text-[#181d16] font-bold text-xl">Request Initiated!</h3>
                  <p className="font-body-sm text-[#475569] leading-relaxed">
                    A verification request has been successfully created for <strong className="text-[#181d16] font-bold">{createdCredentials.name}</strong>.
                  </p>

                  {/* Credentials Box */}
                  <div className="w-full mt-4 p-5 bg-[#f0f5ea]/25 border border-[#eaf0e4] rounded-2xl text-left flex flex-col gap-3 relative overflow-hidden shadow-2xs">
                    <div className="absolute right-3 top-3">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-[#181d16] bg-white border border-[#eaf0e4] px-2 py-0.5 rounded">
                        Direct Login Link
                      </span>
                    </div>

                    {createdCredentials.setupUrl ? (
                      <div className="flex flex-col gap-1 pt-3">
                        <span className="font-label-caps text-[#334155] text-[10px] uppercase font-semibold tracking-wider">Candidate Direct Login Link</span>
                        <p className="text-[11px] text-[#475569] leading-relaxed mb-2">
                          Share this direct login link with the candidate. Credentials are embedded and will pre-fill automatically.
                        </p>
                        <div className="flex items-center justify-between bg-white px-3 py-2.5 rounded-xl border border-[#eaf0e4]/60 gap-3 mt-1 shadow-2xs">
                          <span className="font-mono text-xs text-[#181d16] truncate max-w-[65%]" title={createdCredentials.setupUrl}>
                            {createdCredentials.setupUrl}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(createdCredentials.setupUrl || "");
                                setCopiedUrl(true);
                                setTimeout(() => setCopiedUrl(false), 2000);
                              }}
                              className="text-xs px-3 py-1.5 bg-[#181d16] text-white rounded-lg font-semibold hover:bg-[#1E293B] transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedUrl ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                        </div>

                        {/* Pre-filled credentials detail */}
                        {(() => {
                          const params = getUrlParams(createdCredentials.setupUrl);
                          return (
                            <div className="mt-3 p-4 bg-white/70 border border-[#eaf0e4]/40 rounded-2xl text-xs flex flex-col gap-2.5 shadow-2xs">
                              <div className="flex justify-between items-center">
                                <span className="text-[#475569] font-semibold uppercase tracking-wider text-[10px] font-label-caps">Candidate Email ID</span>
                                <span className="font-mono text-[#181d16] font-bold text-xs select-all">{params.email}</span>
                              </div>
                              <div className="flex justify-between items-center border-t border-[#f0f5ea]/30 pt-2">
                                <span className="text-[#475569] font-semibold uppercase tracking-wider text-[10px] font-label-caps">Temporary Password</span>
                                <span className="font-mono text-[#181d16] font-bold text-xs select-all">{params.password}</span>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-[#64748B]">
                          <Sparkles className="w-3 h-3 text-[#00450e]" />
                          <span>The candidate can log in directly using this link without setting a password.</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-[#475569] pt-3">Login link generation failed. Please try again.</div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 mt-6 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedCredentials(null);
                        setSuccessMsg("");
                      }}
                      className="flex-1 py-3 border border-[#eaf0e4] rounded-xl font-semibold text-xs text-[#334155] hover:bg-[#f6fbf0] transition-colors cursor-pointer bg-white"
                    >
                      Create Another
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedCredentials(null);
                        router.push("/client/summary");
                      }}
                      className="flex-1 py-3 bg-[#181d16] text-white rounded-xl font-semibold text-xs hover:bg-[#1E293B] transition-all cursor-pointer shadow-sm"
                    >
                      Go to Summary
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* COURT RECORD CHECK FORM (new) */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeService === "court_record" && courtRecordEnabled && (
        <>
          {/* Form Alerts */}
          {crSuccessMsg && !crCreatedId && (
            <div className="bg-[#E6F8F3] text-[#00684A] border border-[#A3EAD6] rounded-xl p-4 font-body-sm flex items-center gap-3 max-w-2xl animate-fade-in shadow-2xs">
              <CheckCircle className="w-5 h-5 text-[#00a877] shrink-0" />
              <span className="font-semibold">{crSuccessMsg}</span>
            </div>
          )}

          {crErrorMsg && (
            <div className="bg-red-50 text-red-800 border border-red-200 rounded-xl p-4 font-body-sm flex items-center gap-3 max-w-2xl animate-fade-in shadow-2xs">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span className="font-semibold">{crErrorMsg}</span>
            </div>
          )}

          {/* Court Record Form Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-2xl shadow-lg relative overflow-hidden transition-all duration-300 hover:shadow-xl">
            {/* Top gradient line */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-600 via-teal-500 to-green-500"></div>

            {/* Subtle decorative background shapes */}
            <div className="absolute -right-12 -bottom-12 w-32 h-32 bg-[#f0f5ea]/20 rounded-full blur-2xl pointer-events-none"></div>
            <div className="absolute -left-12 -top-12 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>

            <form onSubmit={handleCourtRecordSubmit} className="flex flex-col gap-6 mt-2 relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-xl shadow-md shadow-emerald-600/10 text-white">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg leading-tight">Court Record Check</h3>
                  <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">eCourts India Database Search</p>
                </div>
              </div>

              {/* Candidate Full Name */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5" htmlFor="cr-candidate-name">
                  Candidate Full Name
                </label>
                <input
                  id="cr-candidate-name"
                  type="text"
                  value={crCandidateName}
                  onChange={(e) => setCrCandidateName(e.target.value)}
                  autoComplete="off"
                  disabled={isSettingsIncomplete}
                  className={`border border-slate-300 rounded-xl p-3.5 font-body-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-650 transition-all bg-white placeholder-slate-400 font-semibold shadow-2xs ${
                    isSettingsIncomplete ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
                  }`}
                  placeholder="Enter candidate's full legal name"
                />
              </div>

              {/* Candidate DOB */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5" htmlFor="cr-candidate-dob">
                  Candidate Date of Birth
                </label>
                <div className="relative">
                  <input
                    id="cr-candidate-dob"
                    type="date"
                    value={crCandidateDob}
                    onChange={(e) => setCrCandidateDob(e.target.value)}
                    onFocus={() => {
                      if (!crCandidateDob) {
                        setCrCandidateDob("2000-01-01");
                      }
                    }}
                    onClick={() => {
                      if (!crCandidateDob) {
                        setCrCandidateDob("2000-01-01");
                      }
                    }}
                    disabled={isSettingsIncomplete}
                    className={`w-full border border-slate-300 rounded-xl p-3.5 font-body-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-650 transition-all bg-white placeholder-slate-400 font-semibold shadow-2xs ${
                      isSettingsIncomplete ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
                    }`}
                  />
                </div>
              </div>

              {/* Addresses Section */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    Addresses
                  </label>
                  <button
                    type="button"
                    onClick={addAddress}
                    disabled={isSettingsIncomplete}
                    className={`px-3 py-1.5 border border-slate-300 text-xs font-bold text-slate-800 hover:text-emerald-800 hover:border-emerald-500 hover:bg-emerald-50/30 rounded-lg flex items-center gap-1 transition-all shadow-2xs ${
                      isSettingsIncomplete ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-95"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-700" />
                    Add Address
                  </button>
                </div>

                {crAddresses.map((addr, index) => (
                  <div
                    key={index}
                    className="border border-slate-200 rounded-2xl p-5 bg-gradient-to-br from-slate-50/70 via-white to-emerald-50/10 relative group transition-all hover:border-emerald-300 hover:shadow-xs shadow-2xs"
                  >
                    {crAddresses.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAddress(index)}
                        className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-55 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Remove address"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/50 px-2 py-0.5 rounded-full uppercase tracking-wider border border-emerald-200/50">
                        Address {index + 1}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {/* Address Line */}
                      <input
                        type="text"
                        value={addr.address}
                        onChange={(e) => updateAddress(index, "address", e.target.value)}
                        disabled={isSettingsIncomplete}
                        className={`border border-slate-300 rounded-xl p-3 font-body-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-650 transition-all bg-white placeholder-slate-400 font-semibold text-sm shadow-2xs ${
                          isSettingsIncomplete ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
                        }`}
                        placeholder="Street address (optional)"
                      />

                      {/* State + District Row (cascading dropdowns) */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                            State *
                          </label>
                          <div className="relative">
                            <select
                              value={addr.stateCode}
                              onChange={(e) => {
                                const selectedCode = e.target.value;
                                const selectedState = INDIAN_STATES.find((s) => s.code === selectedCode);
                                setCrAddresses((prev) =>
                                  prev.map((a, i) =>
                                    i === index
                                      ? { ...a, state: selectedState?.name || "", stateCode: selectedCode, city: "", districtCode: "" }
                                      : a
                                  )
                                );
                                if (selectedCode) {
                                  fetchDistrictsForState(selectedCode);
                                }
                              }}
                              disabled={isSettingsIncomplete}
                              className={`w-full border border-slate-300 rounded-xl p-3 pr-8 font-body-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-650 transition-all bg-white font-semibold text-sm appearance-none ${
                                isSettingsIncomplete ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : "cursor-pointer"
                              } ${!addr.stateCode ? "text-slate-400" : ""}`}
                            >
                              <option value="">Select state</option>
                              {sortedStates.map((state) => (
                                <option key={state.code} value={state.code}>
                                  {state.name}
                                </option>
                              ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            District *
                            {addr.stateCode && districtsCache[addr.stateCode]?.loading && (
                              <span className="inline-block w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                            )}
                          </label>
                          <div className="relative">
                            <select
                              value={addr.districtCode}
                              onChange={(e) => {
                                const selectedDistCode = e.target.value;
                                const distEntry = districtsCache[addr.stateCode]?.districts?.find((d) => d.value === selectedDistCode);
                                setCrAddresses((prev) =>
                                  prev.map((a, i) =>
                                    i === index
                                      ? { ...a, city: distEntry?.name || "", districtCode: selectedDistCode }
                                      : a
                                  )
                                );
                              }}
                              disabled={isSettingsIncomplete || !addr.stateCode || districtsCache[addr.stateCode]?.loading}
                              className={`w-full border border-slate-300 rounded-xl p-3 pr-8 font-body-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-650 transition-all bg-white font-semibold text-sm appearance-none ${
                                isSettingsIncomplete || !addr.stateCode
                                  ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80"
                                  : "cursor-pointer"
                              } ${!addr.districtCode ? "text-slate-400" : ""}`}
                            >
                              <option value="">
                                {!addr.stateCode
                                  ? "Select state first"
                                  : districtsCache[addr.stateCode]?.loading
                                    ? "Loading districts..."
                                    : districtsCache[addr.stateCode]?.districts?.length === 0
                                      ? "No districts found"
                                      : "Select district"}
                              </option>
                              {(districtsCache[addr.stateCode]?.districts || []).map((dist) => (
                                <option key={dist.value} value={dist.value}>
                                  {dist.name}
                                </option>
                              ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Country (auto-filled) */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                          Country
                        </label>
                        <input
                          type="text"
                          value="India"
                          disabled
                          className="border border-slate-300 rounded-xl p-3 font-body-sm bg-slate-50 text-slate-500 font-semibold text-sm cursor-not-allowed shadow-2xs"
                        />
                      </div>

                      {/* Year Range (FROM → TO) */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                            From Year *
                          </label>
                          <div className="relative">
                            <select
                              value={addr.fromYear}
                              onChange={(e) => {
                                const newFrom = Number(e.target.value);
                                setCrAddresses((prev) =>
                                  prev.map((a, i) => {
                                    if (i !== index) return a;
                                    // Auto-adjust toYear if span would exceed 3 years
                                    const maxTo = Math.min(newFrom + 2, currentYear);
                                    return { ...a, fromYear: newFrom, toYear: a.toYear > maxTo ? maxTo : (a.toYear < newFrom ? newFrom : a.toYear) };
                                  })
                                );
                              }}
                              disabled={isSettingsIncomplete}
                              className={`w-full border border-slate-300 rounded-xl p-3 pr-8 font-body-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-650 transition-all bg-white font-semibold text-sm appearance-none ${
                                isSettingsIncomplete ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : "cursor-pointer"
                              }`}
                            >
                              {Array.from({ length: currentYear - 2015 + 1 }, (_, idx) => currentYear - idx).map((yr) => (
                                <option key={yr} value={yr}>{yr}</option>
                              ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                            To Year *
                          </label>
                          <div className="relative">
                            <select
                              value={addr.toYear}
                              onChange={(e) => {
                                const newTo = Number(e.target.value);
                                setCrAddresses((prev) =>
                                  prev.map((a, i) => {
                                    if (i !== index) return a;
                                    // Auto-adjust fromYear if span would exceed 3 years
                                    const minFrom = Math.max(newTo - 2, 2015);
                                    return { ...a, toYear: newTo, fromYear: a.fromYear < minFrom ? minFrom : (a.fromYear > newTo ? newTo : a.fromYear) };
                                  })
                                );
                              }}
                              disabled={isSettingsIncomplete}
                              className={`w-full border border-slate-300 rounded-xl p-3 pr-8 font-body-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-650 transition-all bg-white font-semibold text-sm appearance-none ${
                                isSettingsIncomplete ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : "cursor-pointer"
                              }`}
                            >
                              {Array.from({ length: Math.min(3, currentYear - addr.fromYear + 1) }, (_, idx) => addr.fromYear + idx).map((yr) => (
                                <option key={yr} value={yr}>{yr}</option>
                              ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                              <ChevronDown className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Year range hint */}
                      <p className="text-[9px] text-[#94a3b8] font-medium -mt-1">
                        Max 3-year span per address · Searching {addr.fromYear} → {addr.toYear} ({addr.toYear - addr.fromYear + 1} year{addr.toYear - addr.fromYear + 1 !== 1 ? "s" : ""})
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Requesting ORG Name */}
              <div className="flex flex-col gap-2 relative">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="cr-org-name">
                  {isAdmin ? "Target Client ORG Name" : "Requesting ORG Name"}
                </label>
                <div className="relative">
                  <input
                    id="cr-org-name"
                    type="text"
                    value={crRequestingOrgName}
                    onChange={(e) => {
                      setCrRequestingOrgName(e.target.value);
                      setCrShowOrgDropdown(true);
                    }}
                    onFocus={() => setCrShowOrgDropdown(true)}
                    onBlur={() => {
                      setTimeout(() => setCrShowOrgDropdown(false), 200);
                    }}
                    autoComplete="off"
                    disabled={isSettingsIncomplete}
                    className={`w-full border border-slate-300 rounded-xl p-3.5 font-body-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-650 transition-all bg-white placeholder-slate-400 font-semibold shadow-2xs ${
                      isSettingsIncomplete ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
                    }`}
                    placeholder="Enter the organization name requiring the verification"
                  />

                  {crShowOrgDropdown && crFilteredOrgs.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-[#eaf0e4] rounded-xl shadow-lg z-30 overflow-hidden max-h-48 overflow-y-auto animate-fade-in">
                      <div className="p-1 flex flex-col gap-1 font-body-sm">
                        {crFilteredOrgs.map((org) => (
                          <div
                            key={org}
                            className="flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-[#f0f5ea]/35 text-[#181d16] font-semibold cursor-pointer group/item"
                            onMouseDown={() => {
                              setCrRequestingOrgName(org);
                              setCrShowOrgDropdown(false);
                            }}
                          >
                            <span className="flex-1 text-left">{org}</span>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (typeof removeRecentRequestingOrg === 'function') removeRecentRequestingOrg(org);
                              }}
                              title="Remove from history"
                              className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-650 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Info Note */}
              <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-4 flex items-start gap-3 shadow-2xs">
                <Scale className="w-4.5 h-4.5 text-emerald-800 shrink-0 mt-0.5" />
                <div className="text-[11px] text-slate-650 leading-relaxed font-semibold">
                  <strong className="text-slate-800">How it works:</strong> The system searches eCourts India for court records matching the candidate&apos;s name across all court complexes in each specified district. This process runs in the background and typically takes 1-3 minutes.
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 mt-6 justify-end border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={handleCourtRecordCancel}
                  disabled={isSettingsIncomplete || crSubmitting}
                  className={`px-6 py-3 border border-slate-200 rounded-xl font-bold text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all bg-white shadow-2xs ${
                    isSettingsIncomplete || crSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-95"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSettingsIncomplete || crSubmitting}
                  className={`px-6 py-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 text-white hover:brightness-110 active:scale-95 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-md shadow-slate-950/10 group ${
                    isSettingsIncomplete || crSubmitting ? "opacity-50 cursor-not-allowed hover:brightness-100 active:scale-100 shadow-none" : "cursor-pointer"
                  }`}
                >
                  {crSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                      <span>Initiating Search...</span>
                    </>
                  ) : (
                    <>
                      <span>Start Verification</span>
                      <Send className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Success Modal for Court Record */}
          {crCreatedId && (
            <div className="fixed inset-0 bg-slate-400/10 backdrop-blur-md flex items-center justify-center p-4 z-[99999] animate-fade-in">
              <div className="bg-white border border-[#eaf0e4] rounded-3xl p-8 max-w-lg w-full shadow-2xl relative animate-scale-up">
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="w-16 h-16 bg-[#E6F8F3] border border-[#A3EAD6] rounded-full flex items-center justify-center text-[#00684A] mb-2 animate-bounce-subtle">
                    <Scale className="w-8 h-8 text-[#00a877]" />
                  </div>
                  <h3 className="font-headline-md text-[#181d16] font-bold text-xl">Search Initiated!</h3>
                  <p className="font-body-sm text-[#475569] leading-relaxed">
                    Court record search has been started for <strong className="text-[#181d16] font-bold">{crCandidateName || "the candidate"}</strong>.
                    The search is running in the background and will complete in 1-3 minutes.
                  </p>

                  <div className="w-full mt-2 p-4 bg-[#f0f5ea]/25 border border-[#eaf0e4] rounded-2xl text-left flex flex-col gap-2 shadow-2xs">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#475569] font-semibold">Verification ID</span>
                      <span className="font-mono text-[#181d16] font-bold">{crCreatedId}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#475569] font-semibold">Status</span>
                      <span className="text-amber-600 font-bold flex items-center gap-1">
                        <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                        Processing
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-[#64748B]">
                    <Sparkles className="w-3 h-3 text-[#00450e]" />
                    <span>You can check the results in Order Summary once the search completes.</span>
                  </div>

                  <div className="flex gap-3 mt-4 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        setCrCreatedId(null);
                        setCrSuccessMsg("");
                      }}
                      className="flex-1 py-3 border border-[#eaf0e4] rounded-xl font-semibold text-xs text-[#334155] hover:bg-[#f6fbf0] transition-colors cursor-pointer bg-white"
                    >
                      Create Another
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCrCreatedId(null);
                        router.push("/client/summary");
                      }}
                      className="flex-1 py-3 bg-[#181d16] text-white rounded-xl font-semibold text-xs hover:bg-[#1E293B] transition-all cursor-pointer shadow-sm"
                    >
                      Go to Summary
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
