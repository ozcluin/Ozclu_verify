"use client";

import React, { useState } from "react";
import { useAuth } from "src/context/AuthContext";
import { usePortal, ApiKey } from "src/context/PortalContext";
import {
  Key,
  Copy,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Activity,
  DollarSign,
  Lock,
  AlertCircle,
  Code,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
} from "lucide-react";
import Link from "next/link";

export default function ApiSettingsPage() {
  const { profile } = useAuth();
  const { apiKeys, apiUsage, generateApiKey, revokeApiKey, fetchApiUsage, organisation } = usePortal();

  const [isGenerating, setIsGenerating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const isOrgOwner = profile?.role === "org_owner";

  // Currency symbol
  const currency = organisation?.currency || "USD";
  const currencySymbol = currency === "INR" ? "₹" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";

  const handleGenerate = async () => {
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

  const handleRevoke = async (apiKeyId: string) => {
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

  const handleRefreshUsage = async () => {
    setIsRefreshing(true);
    await fetchApiUsage();
    setIsRefreshing(false);
  };

  const sampleCurl = `curl -X POST https://verify.ozclu.in/api/v1/external/verify/identity \\
  -H "Authorization: Bearer sk_live_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "candidateName": "John Doe",
    "candidateEmail": "john.doe@example.com"
  }'`;

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(sampleCurl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2500);
  };

  if (!isOrgOwner) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-amber-500/20 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Access Restricted</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            API key management and integration settings are restricted to Organisation Owners. Please contact your account administrator if you need API access.
          </p>
        </div>
      </div>
    );
  }

  const activeKeys = apiKeys.filter((k) => k.status === "active");

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">API & Integrations</h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary border border-primary/20">
              REST v1
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your systems directly to Ozclu Verify using secure API keys. Integrate background checks into your own workflows.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/api-docs"
            target="_blank"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-border bg-card hover:bg-accent text-foreground transition-all shadow-sm"
          >
            <Code className="w-4 h-4 text-primary" />
            <span>API Docs</span>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
          </Link>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md hover:shadow-primary/20 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {isGenerating ? "Generating..." : "Generate New Key"}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-card border border-border/70 rounded-2xl p-5 shadow-sm hover:border-primary/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Calls This Month</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">{apiUsage?.totalCalls || 0}</span>
            <span className="text-xs text-muted-foreground">requests</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="text-emerald-500 font-medium">{apiUsage?.successfulCalls || 0} passed</span>
            <span>•</span>
            <span className="text-rose-500 font-medium">{apiUsage?.failedCalls || 0} failed</span>
          </div>
        </div>

        <div className="bg-card border border-border/70 rounded-2xl p-5 shadow-sm hover:border-primary/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estimated Charges</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-foreground">
              {currencySymbol}{(apiUsage?.totalCost || 0).toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{currency}</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Billed on your normal monthly invoice
          </div>
        </div>

        <div className="bg-card border border-border/70 rounded-2xl p-5 shadow-sm hover:border-primary/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active API Keys</span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">{activeKeys.length}</span>
            <span className="text-xs text-muted-foreground">of {apiKeys.length} total</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Standard limit: 100 req/min per key
          </div>
        </div>

        <div className="bg-card border border-border/70 rounded-2xl p-5 shadow-sm hover:border-primary/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Success Rate</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">
              {apiUsage?.totalCalls
                ? `${Math.round(((apiUsage.successfulCalls || 0) / apiUsage.totalCalls) * 100)}%`
                : "100%"}
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {apiUsage?.totalCalls ? `${apiUsage.successfulCalls} successful requests` : "No calls recorded yet"}
          </div>
        </div>
      </div>

      {/* API Keys Table */}
      <div className="bg-card border border-border/70 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Your API Keys</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Secret keys authenticate requests from your servers
          </span>
        </div>

        {apiKeys.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3 text-muted-foreground">
              <Key className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">No API keys yet</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Generate an API key to start connecting your website or HR portal to Ozclu Verify.
            </p>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Generate First Key
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs font-semibold uppercase text-muted-foreground tracking-wider border-b border-border/60">
                <tr>
                  <th className="px-5 py-3">Key Token</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Rate Limit</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Last Used</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {apiKeys.map((k: ApiKey) => {
                  const isActive = k.status === "active";
                  return (
                    <tr key={k._id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {k.keyPrefix || "sk_live_"}••••••••••••••••••••••••••••{k.keySuffix}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                            <XCircle className="w-3 h-3 text-muted-foreground" />
                            Revoked
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono">
                        {k.rateLimit || 100} req/min
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        {k.createdAt ? new Date(k.createdAt).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Never"}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {isActive ? (
                          <button
                            onClick={() => handleRevoke(k._id)}
                            disabled={revokingId === k._id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {revokingId === k._id ? "Revoking..." : "Revoke"}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Revoked</span>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* cURL Snippet */}
        <div className="bg-card border border-border/70 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Quick Start Example</h3>
            </div>
            <button
              onClick={handleCopyCurl}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              {copiedCurl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
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

          <div className="relative rounded-xl bg-zinc-950 p-4 font-mono text-xs text-zinc-100 overflow-x-auto border border-zinc-800">
            <pre className="whitespace-pre">{sampleCurl}</pre>
          </div>

          <div className="text-xs text-muted-foreground flex items-center justify-between pt-1">
            <span>Pass your secret key in the <code className="text-foreground bg-muted px-1.5 py-0.5 rounded font-mono">Authorization</code> header.</span>
            <Link href="/api-docs" className="text-primary hover:underline inline-flex items-center gap-1 font-medium">
              View All 12 Endpoints <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Usage Breakdown by Service */}
        <div className="bg-card border border-border/70 rounded-2xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">This Month's Breakdown</h3>
            </div>
            <button
              onClick={handleRefreshUsage}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>

          {!apiUsage?.breakdown || Object.keys(apiUsage.breakdown).length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No API verifications triggered this month yet.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {Object.entries(apiUsage.breakdown).map(([checkType, stat]) => (
                <div key={checkType} className="py-2.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground uppercase tracking-wide">
                    {checkType.replace(/_/g, " ")}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">{stat.count} calls</span>
                    <span className="font-mono font-semibold text-foreground">
                      {currencySymbol}{stat.cost.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Newly Created Key Modal */}
      {showNewKeyModal && newlyCreatedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-emerald-500">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">API Key Generated</h3>
                <p className="text-xs text-muted-foreground">Keep this key safe and confidential</p>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <strong>Important:</strong> Copy this secret key right now. For security reasons, we will never show it to you again. If you lose it, you must generate a new one.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Secret API Key</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newlyCreatedKey}
                  className="w-full font-mono text-xs bg-muted/60 border border-border rounded-xl px-3.5 py-2.5 text-foreground select-all focus:outline-none"
                />
                <button
                  onClick={handleCopyKey}
                  className="px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold rounded-xl flex items-center gap-1.5 shrink-0 transition-colors"
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
                onClick={() => {
                  setShowNewKeyModal(false);
                  setNewlyCreatedKey(null);
                }}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-muted hover:bg-accent text-foreground transition-colors"
              >
                I Have Saved My Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
