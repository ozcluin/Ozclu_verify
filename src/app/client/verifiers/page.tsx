"use client";

import React, { useState, useEffect } from "react";
import { usePortal, ApiKey } from "src/context/PortalContext";
import { useAuth } from "src/context/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Users, 
  UserPlus, 
  Key, 
  CheckCircle, 
  AlertCircle, 
  ShieldAlert,
  Power,
  PowerOff,
  Code,
  Copy,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  Activity,
  DollarSign,
  Terminal,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Globe,
  Layers,
  Sparkles,
  Lock
} from "lucide-react";

export default function ManageVerifiersPage() {
  const { 
    verifiers, 
    organisation, 
    inviteVerifier, 
    updateVerifierStatus,
    apiKeys,
    apiUsage,
    generateApiKey,
    revokeApiKey,
    fetchApiUsage
  } = usePortal();
  
  const { profile, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Tab state: "human" vs "api"
  const [activeTab, setActiveTab] = useState<"human" | "api">("human");

  // Human Verifier Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [designation, setDesignation] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [inviting, setInviting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // API Integration states
  const [isGenerating, setIsGenerating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  // Sync tab from URL query param (?tab=api)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "api") {
        setActiveTab("api");
      }
    }
  }, []);

  const handleTabChange = (tab: "human" | "api") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  };

  // Auto-redirect if not org_owner
  useEffect(() => {
    if (!isLoading && isAuthenticated && profile?.role !== "org_owner") {
      router.push("/client/identity-verification");
    }
  }, [isLoading, isAuthenticated, profile, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#134074] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-semibold text-slate-500 animate-pulse">Loading settings...</span>
        </div>
      </div>
    );
  }

  if (profile?.role !== "org_owner") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 bg-white border border-slate-100 rounded-3xl max-w-lg mx-auto mt-10">
        <ShieldAlert className="w-12 h-12 text-rose-500 mb-4" />
        <h2 className="text-lg font-bold text-slate-900">Access Denied</h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Only organisation owners have permissions to manage verifiers and API keys for this account.
        </p>
      </div>
    );
  }

  // Currency helper
  const currency = organisation?.currency || "USD";
  const currencySymbol = currency === "INR" ? "₹" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";

  // Human Verifiers stats
  const maxVerifiers = organisation?.maxVerifiers ?? 5;
  const activeCount = verifiers.filter(v => v.status === "Active").length;
  const slotsRemaining = Math.max(0, maxVerifiers - activeCount);

  // API Key stats
  const activeApiKeys = (apiKeys || []).filter(k => k.status === "active");

  const handleToggleStatus = async (v: any) => {
    setTogglingId(v.id);
    const newStatus = v.status === "Active" ? "Inactive" : "Active";
    try {
      await updateVerifierStatus(v.id, newStatus);
    } catch (err) {
      console.error("Failed toggling verifier:", err);
    }
    setTogglingId(null);
  };

  const handleGeneratePassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#%^&*";
    let pw = "";
    for (let i = 0; i < 16; i++) {
      pw += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setPassword(pw);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!name.trim()) return setFormError("Verifier full name is required");
    if (!email.trim() || !email.includes("@")) return setFormError("Please enter a valid email address");
    if (!password.trim() || password.length < 6) return setFormError("Temporary password must be at least 6 characters");

    setInviting(true);
    try {
      await inviteVerifier(name.trim(), email.toLowerCase().trim(), profile.org_name, password, designation.trim());
      setFormSuccess(`Successfully created verifier login for ${name}!`);
      setName("");
      setEmail("");
      setDesignation("");
      setPassword("");
    } catch (err: any) {
      setFormError(err.message || "Failed to invite verifier. Limit may have been reached.");
    } finally {
      setInviting(false);
    }
  };

  const handleGenerateKey = async () => {
    setIsGenerating(true);
    try {
      const res = await generateApiKey();
      if (res?.fullKey) {
        setNewlyCreatedKey(res.fullKey);
        setShowNewKeyModal(true);
      }
    } catch (err: any) {
      alert(err?.message || "Failed to generate API key");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevokeKey = async (apiKeyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? Any applications using it will immediately stop working.")) {
      return;
    }
    setRevokingId(apiKeyId);
    try {
      await revokeApiKey(apiKeyId);
    } catch (err: any) {
      alert(err?.message || "Failed to revoke API key");
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopyKey = () => {
    if (newlyCreatedKey) {
      navigator.clipboard.writeText(newlyCreatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const sampleCurl = `curl -X POST https://verify.ozclu.in/api/v1/external/verify/identity \\
  -H "Authorization: Bearer sk_live_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "candidateName": "Jane Doe",
    "candidateEmail": "jane.doe@example.com"
  }'`;

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(sampleCurl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2500);
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEndpoint(id);
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto flex flex-col gap-8">
      {/* Header section with switch */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200/80 pb-6 text-left">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            {activeTab === "human" ? (
              <>
                <Users className="w-7 h-7 text-[#134074]" />
                <span>Manage Team Logins</span>
              </>
            ) : (
              <>
                <Code className="w-7 h-7 text-emerald-700" />
                <span>API & Automated Integration</span>
              </>
            )}
          </h1>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-1">
            {activeTab === "human"
              ? `Configure verifiers and compliance analyst accounts assigned to work under ${profile.org_name}.`
              : `Connect your external website, ATS, or HRMS directly to Ozclu Verify via secure API keys.`}
          </p>
        </div>

        {/* Segmented Switch: Human vs API */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner shrink-0">
          <button
            type="button"
            onClick={() => handleTabChange("human")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              activeTab === "human"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="w-4 h-4 text-[#134074]" />
            <span>Human Verifiers</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
              {activeCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("api")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              activeTab === "api"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Key className="w-4 h-4 text-emerald-700" />
            <span>API Integration</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
              REST v1
            </span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: HUMAN VERIFIERS
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "human" && (
        <div className="animate-fade-in flex flex-col gap-8">
          {/* Slots details banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-slate-50/70 border border-slate-200/50 rounded-2xl p-5 text-left shadow-xs">
              <span className="text-[10px] text-slate-450 uppercase tracking-wider font-extrabold block mb-1">Max Verifiers Limit</span>
              <span className="text-2xl font-black text-slate-800">{maxVerifiers}</span>
            </div>
            <div className="bg-slate-50/70 border border-slate-200/50 rounded-2xl p-5 text-left shadow-xs">
              <span className="text-[10px] text-slate-450 uppercase tracking-wider font-extrabold block mb-1">Active Accounts</span>
              <span className="text-2xl font-black text-slate-800">{activeCount}</span>
            </div>
            <div className={`border rounded-2xl p-5 text-left transition-all duration-300 shadow-xs ${
              slotsRemaining === 0 
                ? "bg-rose-500/5 border-rose-500/15" 
                : "bg-[#eaf0e4]/10 border-[#eaf0e4]/20"
            }`}>
              <span className="text-[10px] text-slate-450 uppercase tracking-wider font-extrabold block mb-1">Slots Remaining</span>
              <span className={`text-2xl font-black ${slotsRemaining === 0 ? "text-rose-600" : "text-[#134074]"}`}>
                {slotsRemaining}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
            {/* Left Column: List of verifiers */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              <div className="bg-white border border-[#eaf0e4]/30 rounded-3xl p-6 shadow-sm">
                <h3 className="font-extrabold text-sm text-[#134074] border-b border-slate-100 pb-3 mb-4 flex items-center gap-2 text-left">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>Team Accounts</span>
                </h3>

                {verifiers.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-2">
                    <Users className="w-10 h-10 opacity-30 stroke-1" />
                    <p className="text-xs font-semibold">No verifier accounts created yet.</p>
                    <p className="text-[10px] text-slate-400">Use the form to create logins for your analysts.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {verifiers.map((v, idx) => (
                      <div key={v.id || idx} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-9 h-9 bg-slate-100 text-[#134074] font-extrabold text-sm rounded-full flex items-center justify-center shrink-0">
                            {v.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="font-bold text-sm text-slate-900 leading-tight truncate">{v.name}</p>
                            <p className="text-xs text-slate-450 font-medium truncate mt-0.5">{v.designation || "Compliance Analyst"}</p>
                            <p className="font-mono text-[10px] text-slate-400 mt-1 truncate">{v.email}</p>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {!v.isOwner && (
                            <button
                              onClick={() => handleToggleStatus(v)}
                              disabled={togglingId === v.id}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border cursor-pointer transition-all duration-200 disabled:opacity-50 ${
                                v.status === "Active"
                                  ? "bg-rose-500/5 text-rose-600 border-rose-500/15 hover:bg-rose-500/10"
                                  : "bg-emerald-500/5 text-emerald-600 border-emerald-500/15 hover:bg-emerald-500/10"
                              }`}
                              title={v.status === "Active" ? "Deactivate this verifier" : "Activate this verifier"}
                            >
                              {togglingId === v.id ? (
                                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : v.status === "Active" ? (
                                <PowerOff className="w-3 h-3" />
                              ) : (
                                <Power className="w-3 h-3" />
                              )}
                              <span>{v.status === "Active" ? "Deactivate" : "Activate"}</span>
                            </button>
                          )}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${
                            v.status === "Active" 
                              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/15" 
                              : "bg-amber-500/10 text-amber-700 border-amber-500/15"
                          }`}>
                            {v.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Invite Form */}
            <div className="lg:col-span-2">
              <div className="bg-white border border-[#eaf0e4]/30 rounded-3xl p-6 shadow-sm">
                <h3 className="font-extrabold text-sm text-[#134074] border-b border-slate-100 pb-3 mb-4 flex items-center gap-2 text-left">
                  <UserPlus className="w-4 h-4 text-slate-400" />
                  <span>Create Verifier login</span>
                </h3>

                {formSuccess && (
                  <div className="bg-emerald-500/5 text-emerald-600 border border-emerald-500/15 rounded-xl p-3.5 text-xs font-semibold flex items-center gap-2 mb-4">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>{formSuccess}</span>
                  </div>
                )}

                {formError && (
                  <div className="bg-rose-500/5 text-rose-600 border border-rose-500/15 rounded-xl p-3.5 text-xs font-semibold flex items-center gap-2 mb-4">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {slotsRemaining === 0 ? (
                  <div className="p-4 bg-amber-500/5 border border-amber-500/15 rounded-2xl flex flex-col gap-2 text-left">
                    <h4 className="font-bold text-xs text-amber-850 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Active Limit Reached</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                      Your organisation has reached the maximum of <strong className="text-slate-800 font-extrabold">{maxVerifiers} active verifiers</strong>. Deactivate an existing verifier to free up a slot, or contact your account manager at Ozclu to increase capacity.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleInvite} className="flex flex-col gap-4 text-left">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-label-caps text-slate-500 uppercase tracking-wider text-[9px] font-bold">Verifier Full Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Jane Smith" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-3 font-body-sm text-slate-800 bg-white focus:outline-none focus:ring-4 focus:ring-[#eaf0e4]/30 focus:border-[#134074] transition-all placeholder-slate-400 text-xs"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="font-label-caps text-slate-500 uppercase tracking-wider text-[9px] font-bold">Login Email Address</label>
                      <input 
                        type="email" 
                        placeholder="e.g. jane@company.com" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-3 font-body-sm text-slate-800 bg-white focus:outline-none focus:ring-4 focus:ring-[#eaf0e4]/30 focus:border-[#134074] transition-all placeholder-slate-400 text-xs"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="font-label-caps text-slate-500 uppercase tracking-wider text-[9px] font-bold">Job Title / Designation</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Verification Lead" 
                        value={designation} 
                        onChange={(e) => setDesignation(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-3 font-body-sm text-slate-800 bg-white focus:outline-none focus:ring-4 focus:ring-[#eaf0e4]/30 focus:border-[#134074] transition-all placeholder-slate-400 text-xs"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="font-label-caps text-slate-500 uppercase tracking-wider text-[9px] font-bold">Password</label>
                        <button 
                          type="button" 
                          onClick={handleGeneratePassword} 
                          className="text-[10px] text-[#0ea5e9] hover:underline font-bold cursor-pointer"
                        >
                          Generate password
                        </button>
                      </div>
                      <input 
                        type="text" 
                        placeholder="Set temporary password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl p-3 font-body-sm text-slate-800 bg-white focus:outline-none focus:ring-4 focus:ring-[#eaf0e4]/30 focus:border-[#134074] transition-all placeholder-slate-400 text-xs"
                        required
                        minLength={6}
                      />
                    </div>

                    <button 
                      type="submit" 
                      disabled={inviting}
                      className="mt-2 w-full py-3 bg-[#134074] text-white hover:bg-[#181d16] font-bold text-xs rounded-xl shadow-xs transition-colors flex justify-center items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {inviting ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      <span>Create Verifier login</span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: API & AUTOMATED INTEGRATION
      ───────────────────────────────────────────────────────────── */}
      {activeTab === "api" && (
        <div className="animate-fade-in flex flex-col gap-8 text-left">
          {/* Quick Actions & Header Card */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-3xl p-6 sm:p-8 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold tracking-wide">
                <Sparkles className="w-3.5 h-3.5" />
                <span>REST API Integration Gateway</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Programmatic Verification For Your Other Websites
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                Submit candidate details from your careers website or ATS with a single button press. Verification reports and statuses flow directly back into your systems via API.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                href="/api-docs"
                target="_blank"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all shadow-sm"
              >
                <Code className="w-4 h-4 text-emerald-400" />
                <span>Interactive Docs</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
              </Link>
              <button
                onClick={handleGenerateKey}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md hover:shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {isGenerating ? "Generating..." : "Generate New API Key"}
              </button>
            </div>
          </div>

          {/* Step-by-Step Connection Instructions */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
            <h3 className="font-extrabold text-sm text-slate-900 border-b border-slate-100 pb-3 mb-6 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-700" />
              <span>4-Step API Connection Workflow</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Step 1 */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/60 flex flex-col justify-between gap-3">
                <div>
                  <div className="w-7 h-7 rounded-xl bg-[#134074] text-white flex items-center justify-center font-black text-xs mb-2">
                    1
                  </div>
                  <h4 className="font-bold text-xs text-slate-900">Generate Secret Key</h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Click "Generate New API Key". Copy the <code className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">sk_live_...</code> token immediately.
                  </p>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">Store securely on your backend</span>
              </div>

              {/* Step 2 */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/60 flex flex-col justify-between gap-3">
                <div>
                  <div className="w-7 h-7 rounded-xl bg-[#134074] text-white flex items-center justify-center font-black text-xs mb-2">
                    2
                  </div>
                  <h4 className="font-bold text-xs text-slate-900">Set Auth Header</h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Pass your bearer token in all HTTP requests to authenticate requests from your server:
                  </p>
                  <code className="block mt-2 font-mono text-[9px] bg-slate-200/70 text-slate-800 p-1.5 rounded-lg break-all">
                    Authorization: Bearer sk_live_...
                  </code>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">TLS / HTTPS mandatory</span>
              </div>

              {/* Step 3 */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/60 flex flex-col justify-between gap-3">
                <div>
                  <div className="w-7 h-7 rounded-xl bg-[#134074] text-white flex items-center justify-center font-black text-xs mb-2">
                    3
                  </div>
                  <h4 className="font-bold text-xs text-slate-900">Submit Verifications</h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Send candidate data via POST JSON to the desired check endpoint:
                  </p>
                  <code className="block mt-2 font-mono text-[9px] bg-slate-200/70 text-slate-800 p-1.5 rounded-lg break-all">
                    /api/v1/external/verify/identity
                  </code>
                </div>
                <span className="text-[10px] text-emerald-700 font-semibold">Returns requestId instantly</span>
              </div>

              {/* Step 4 */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/60 flex flex-col justify-between gap-3">
                <div>
                  <div className="w-7 h-7 rounded-xl bg-[#134074] text-white flex items-center justify-center font-black text-xs mb-2">
                    4
                  </div>
                  <h4 className="font-bold text-xs text-slate-900">Fetch Completed Report</h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Query the status or fetch the finalized report to display on your portal:
                  </p>
                  <code className="block mt-2 font-mono text-[9px] bg-slate-200/70 text-slate-800 p-1.5 rounded-lg break-all">
                    /api/v1/external/report/&#123;requestId&#125;
                  </code>
                </div>
                <span className="text-[10px] text-blue-700 font-semibold">Live JSON report payload</span>
              </div>
            </div>
          </div>

          {/* Usage KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Calls This Month</span>
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{apiUsage?.totalCalls || 0}</span>
                <span className="text-xs text-slate-400">requests</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                <span className="text-emerald-600 font-bold">{apiUsage?.successfulCalls || 0} passed</span>
                <span>•</span>
                <span className="text-rose-500 font-bold">{apiUsage?.failedCalls || 0} failed</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estimated API Charges</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-900">
                  {currencySymbol}{(apiUsage?.totalCost || 0).toFixed(2)}
                </span>
                <span className="text-xs text-slate-400 font-mono font-semibold">{currency}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Billed on monthly invoice
              </div>
            </div>

            <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active API Keys</span>
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{activeApiKeys.length}</span>
                <span className="text-xs text-slate-400">active tokens</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                {(apiKeys || []).length} total generated
              </div>
            </div>

            <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Base URL</span>
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Globe className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="font-mono text-xs font-bold text-slate-800 truncate block">
                  https://verify.ozclu.in
                </span>
              </div>
              <div className="mt-1 text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Production API Ready</span>
              </div>
            </div>
          </div>

          {/* API Keys Table */}
          <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                  <Key className="w-4 h-4 text-emerald-700" />
                  <span>Issued API Secret Keys</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Secret keys authenticate programmatic API requests sent from your external backend systems.
                </p>
              </div>
              <button
                onClick={handleGenerateKey}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-[#134074] text-white hover:bg-slate-800 transition-all shadow-xs cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isGenerating ? "Generating..." : "New API Key"}</span>
              </button>
            </div>

            {(apiKeys || []).length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Key className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">No API keys created yet</h4>
                <p className="text-xs text-slate-450 mt-1 max-w-sm mx-auto">
                  Click the button below to generate your first secret API key and connect your external website or application.
                </p>
                <button
                  onClick={handleGenerateKey}
                  disabled={isGenerating}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-600 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Generate First Key</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3">Key Token</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Rate Limit</th>
                      <th className="px-5 py-3">Created</th>
                      <th className="px-5 py-3">Last Used</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {(apiKeys || []).map((k: ApiKey) => {
                      const isActive = k.status === "active";
                      return (
                        <tr key={k._id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-5 py-3.5 font-mono text-xs">
                            <span className="font-bold text-slate-900">
                              {k.keyPrefix || "sk_live_"}••••••••••••••••••••••••••••{k.keySuffix}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                <XCircle className="w-3 h-3 text-slate-400" />
                                Revoked
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-500 font-mono">
                            {k.rateLimit || 100} req/min
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-500">
                            {k.createdAt ? new Date(k.createdAt).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—"}
                          </td>
                          <td className="px-5 py-3.5 text-xs text-slate-500">
                            {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Never"}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {isActive ? (
                              <button
                                onClick={() => handleRevokeKey(k._id)}
                                disabled={revokingId === k._id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>{revokingId === k._id ? "Revoking..." : "Revoke"}</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Revoked</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Start & cURL Example */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* cURL Snippet */}
            <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Example Request (cURL)</h4>
                </div>
                <button
                  onClick={handleCopyCurl}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-bold transition-colors cursor-pointer"
                >
                  {copiedCurl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy cURL</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto text-emerald-300 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                {sampleCurl}
              </pre>

              <p className="text-[11px] text-slate-400">
                Replace <code className="text-emerald-400 font-mono">sk_live_YOUR_KEY_HERE</code> with an active secret key issued above.
              </p>
            </div>

            {/* Endpoints Reference Grid */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#134074]" />
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Primary API Endpoints</h4>
                </div>
                <Link
                  href="/api-docs"
                  target="_blank"
                  className="text-xs text-emerald-700 hover:underline font-bold flex items-center gap-1"
                >
                  <span>All 15 Endpoints</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="space-y-2">
                {[
                  { method: "POST", path: "/api/v1/external/verify/identity", label: "Identity Check" },
                  { method: "POST", path: "/api/v1/external/verify/court-record", label: "Court Record (eCourts)" },
                  { method: "POST", path: "/api/v1/external/verify/passport", label: "Passport Verification" },
                  { method: "POST", path: "/api/v1/external/verify/digital-address", label: "Digital Address Check" },
                  { method: "GET", path: "/api/v1/external/status/{requestId}", label: "Check Request Status" },
                  { method: "GET", path: "/api/v1/external/report/{requestId}", label: "Fetch Final Report" },
                ].map((ep) => (
                  <div 
                    key={ep.path} 
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/60 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black font-mono ${
                        ep.method === "POST" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                      }`}>
                        {ep.method}
                      </span>
                      <span className="font-mono text-[11px] text-slate-800 truncate">{ep.path}</span>
                    </div>
                    <button
                      onClick={() => handleCopyText(`https://verify.ozclu.in${ep.path}`, ep.path)}
                      className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                      title="Copy URL"
                    >
                      {copiedEndpoint === ep.path ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          NEW API KEY MODAL (SHOWN ONCE)
      ───────────────────────────────────────────────────────────── */}
      {showNewKeyModal && newlyCreatedKey && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">API Key Created Successfully</h3>
                <p className="text-xs text-slate-450">Save this key now — it cannot be shown again.</p>
              </div>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed font-medium">
                For security reasons, this secret key will <strong>never be shown again</strong>. Copy it immediately and store it in your backend environment variables or secrets manager.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Secret API Key Token</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newlyCreatedKey}
                  className="flex-1 font-mono text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 select-all focus:outline-none"
                />
                <button
                  onClick={handleCopyKey}
                  className="px-4 py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-xs"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowNewKeyModal(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                I have safely stored my key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
