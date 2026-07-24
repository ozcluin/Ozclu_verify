"use client";

import React, { useState, useEffect } from "react";
import { X, Briefcase, GraduationCap, Send, CheckCircle, AlertCircle, Building2, Award } from "lucide-react";
import { usePortal } from "src/context/PortalContext";
import { INDIAN_STATES } from "src/lib/courts-mapping";
import { Country, State, City } from "country-state-city";

const ALLOWED_COUNTRIES = [
  "Singapore", "Malaysia", "Philippines", "UAE",
  "Saudi Arabia", "Qatar", "Kuwait", "Oman", "Bahrain", "India"
];

const SUPPORTED_COUNTRIES = [
  { code: "India", label: "India", iso: "IN", defaultRate: 5 },
  { code: "Singapore", label: "Singapore", iso: "SG", defaultRate: 15 },
  { code: "Malaysia", label: "Malaysia", iso: "MY", defaultRate: 12 },
  { code: "Philippines", label: "Philippines", iso: "PH", defaultRate: 10 },
  { code: "UAE", label: "UAE", iso: "AE", defaultRate: 15 }
];

const getStatesForCountry = (countryName: string) => {
  if (!countryName) return [];
  if (countryName === "India") {
    return INDIAN_STATES.map(s => ({ name: s.name, code: s.code })).sort((a, b) => a.name.localeCompare(b.name));
  }
  const countryObj = Country.getAllCountries().find(c => c.name.toLowerCase() === countryName.toLowerCase());
  if (countryObj) {
    const states = State.getStatesOfCountry(countryObj.isoCode);
    if (states.length > 0) {
      return states.map(s => ({ name: s.name, code: s.isoCode })).sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  if (countryName === "Singapore") {
    return [
      { name: "Central Singapore", code: "SG-01" },
      { name: "North East", code: "SG-02" },
      { name: "North West", code: "SG-03" },
      { name: "South East", code: "SG-04" },
      { name: "South West", code: "SG-05" }
    ];
  }
  return [];
};

const getCitiesForState = (countryName: string, stateName: string) => {
  if (!countryName || !stateName) return [];
  const countryObj = Country.getAllCountries().find(c => c.name.toLowerCase() === countryName.toLowerCase());
  if (!countryObj) return [];

  const countryStates = State.getStatesOfCountry(countryObj.isoCode);
  const cleanStateName = stateName.startsWith("Other:") ? stateName.substring(6) : stateName;
  const stateObj = countryStates.find(s => s.name.toLowerCase() === cleanStateName.toLowerCase() || s.isoCode.toLowerCase() === cleanStateName.toLowerCase());

  if (stateObj) {
    const cities = City.getCitiesOfState(countryObj.isoCode, stateObj.isoCode);
    if (cities.length > 0) {
      return cities.map(c => c.name).sort((a, b) => a.localeCompare(b));
    }
  }

  const allCountryCities = City.getCitiesOfCountry(countryObj.isoCode) || [];
  if (allCountryCities.length > 0) {
    return Array.from(new Set(allCountryCities.map(c => c.name))).sort((a, b) => a.localeCompare(b));
  }

  if (countryName === "Singapore") {
    return ["Singapore", "Bedok", "Jurong East", "Tampines", "Woodlands", "Yishun", "Ang Mo Kio", "Choa Chu Kang", "Hougang", "Sengkang"];
  }
  if (countryName === "UAE") {
    return ["Dubai", "Abu Dhabi", "Sharjah", "Al Ain", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];
  }
  return [];
};


interface CandidateFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  verificationId: string;
  verificationType: "employment" | "education";
  candidateName?: string;
  initialData?: any;
  onSuccess?: () => void;
}

export default function CandidateFillModal({
  isOpen,
  onClose,
  verificationId,
  verificationType,
  candidateName,
  initialData,
  onSuccess,
}: CandidateFillModalProps) {
  const { submitEmploymentData, submitEducationData } = usePortal();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Employment Form Multi-Organisation State
  const createEmptyEmployment = (idSuffix: number) => ({
    id: `emp-${Date.now()}-${idSuffix}`,
    country: "India",
    state: "",
    city: "",
    companyName: "",
    addressLine1: "",
    addressLine2: "",
    companyTelephoneCode: "+91",
    companyTelephone: "",
    department: "",
    position: "",
    employmentPeriodFrom: "",
    employmentPeriodTo: "",
    employeeCode: "",
    reportingManagerName: "",
    reportingManagerDepartment: "",
    reportingManagerContactCode: "+91",
    reportingManagerContact: "",
    reportingManagerEmail: "",
    annualCTC: "",
    employmentType: "",
    agencyDetails: "",
    reasonForLeaving: "",
    remarks: "",
    experienceLetterFile: "",
    experienceLetterFileName: "",
  });

  const [employments, setEmployments] = useState([createEmptyEmployment(1)]);

  const addEmploymentItem = () => {
    setEmployments((prev) => [...prev, createEmptyEmployment(prev.length + 1)]);
  };

  const removeEmploymentItem = (id: string) => {
    setEmployments((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  };

  const updateEmploymentItem = (id: string, field: string, val: string) => {
    setEmployments((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: val } : item)));
  };

  // Education Form State
  const [eduForm, setEduForm] = useState({
    country: "India",
    degreeType: "",
    courseName: "",
    boardUniversity: "",
    institutionName: "",
    rollNumber: "",
    passingYear: "",
    certificateFile: "",
  });

  useEffect(() => {
    if (initialData) {
      if (verificationType === "employment") {
        if (Array.isArray(initialData.employments) && initialData.employments.length > 0) {
          setEmployments(initialData.employments);
        } else if (Array.isArray(initialData.pastOrganisations) && initialData.pastOrganisations.length > 0) {
          setEmployments(initialData.pastOrganisations);
        } else if (initialData.companyName) {
          setEmployments([{ ...createEmptyEmployment(1), ...initialData }]);
        }
      } else if (verificationType === "education") {
        setEduForm((prev) => ({ ...prev, ...initialData }));
      }
    }
  }, [initialData, verificationType]);

  if (!isOpen) return null;

  const updateEdu = (field: string, val: string) => {
    setEduForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (verificationType === "employment") {
      for (let i = 0; i < employments.length; i++) {
        const emp = employments[i];
        if (!emp.companyName.trim()) {
          setErrorMsg(`Organisation / Company Name is required for Organisation #${i + 1}`);
          return;
        }
        if (!emp.employmentPeriodFrom) {
          setErrorMsg(`Employment Period From date is required for Organisation #${i + 1}`);
          return;
        }
      }
    } else if (verificationType === "education") {
      if (!eduForm.degreeType) {
        setErrorMsg("Degree Category is required");
        return;
      }
      if (!eduForm.courseName.trim()) {
        setErrorMsg("Course / Degree Name is required");
        return;
      }
      if (!eduForm.boardUniversity.trim()) {
        setErrorMsg("Board / University Name is required");
        return;
      }
      if (!eduForm.institutionName.trim()) {
        setErrorMsg("Institution Name is required");
        return;
      }
      if (!eduForm.rollNumber.trim()) {
        setErrorMsg("Roll / Registration Number is required");
        return;
      }
      if (!eduForm.passingYear.trim()) {
        setErrorMsg("Passing Year is required");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let res;
      if (verificationType === "employment") {
        const primaryEmp = employments[0] || {};
        const payloadData = {
          ...primaryEmp,
          employments,
          pastOrganisations: employments,
        };
        res = await submitEmploymentData(verificationId, payloadData);
      } else {
        res = await submitEducationData(verificationId, eduForm);
      }

      if (res && res.success) {
        setSuccessMsg("Candidate verification details submitted successfully!");
        if (onSuccess) onSuccess();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setErrorMsg(res?.error || "Failed to submit verification details");
      }
    } catch (err: any) {
      setErrorMsg("Failed to submit verification details");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[99999] animate-fade-in overflow-y-auto">
      <div className="bg-white border border-[#eaf0e4] rounded-3xl max-w-3xl w-full shadow-2xl relative my-8 overflow-hidden animate-scale-up flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-[#181d16] via-[#1E293B] to-[#181d16] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/20">
              {verificationType === "employment" ? (
                <Briefcase className="w-5 h-5 text-emerald-400" />
              ) : (
                <GraduationCap className="w-5 h-5 text-indigo-400" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">
                {verificationType === "employment" ? "Fill Employment Details" : "Fill Education Details"}
              </h3>
              <p className="text-xs text-slate-300 font-medium">
                {candidateName ? `Candidate: ${candidateName}` : `Request ID: ${verificationId}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-6 font-body-sm flex-1">
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {verificationType === "employment" ? (
            /* ═══════════════════════════════════════════════════ */
            /* EMPLOYMENT DETAILS FORM (MULTIPLE ORGANISATIONS)   */
            /* ═══════════════════════════════════════════════════ */
            <div className="flex flex-col gap-6">
              {employments.map((emp, idx) => (
                <div key={emp.id} className="bg-[#f6fbf0]/60 border border-[#eaf0e4] rounded-2xl p-5 flex flex-col gap-5 relative transition-all hover:border-[#d0dbc6]">
                  {/* Employer Header */}
                  <div className="flex items-center justify-between border-b border-[#eaf0e4] pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#00450e] text-white flex items-center justify-center font-bold text-xs">
                        {idx + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-xs uppercase text-[#181d16] tracking-wider">
                          {idx === 0 ? "Current / Most Recent Organisation *" : `Past Organisation #${idx + 1}`}
                        </h4>
                        <p className="text-[11px] text-[#64748B]">Provide employer details, position, and period.</p>
                      </div>
                    </div>

                    {employments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEmploymentItem(emp.id)}
                        className="px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                        title="Remove this organisation entry"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>

                  {/* Primary Company Info (Name & Title FIRST) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="text-[10px] font-bold text-[#00450e] uppercase tracking-wider">Organisation / Company Name *</label>
                      <input
                        type="text"
                        value={emp.companyName}
                        onChange={(e) => updateEmploymentItem(emp.id, "companyName", e.target.value)}
                        placeholder="e.g. Infosys, TCS, Google India..."
                        className="border border-[#eaf0e4] rounded-xl p-3 text-xs font-bold text-[#181d16] bg-white focus:outline-none focus:ring-2 focus:ring-[#00450e]/20"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Position / Job Title</label>
                      <input
                        type="text"
                        value={emp.position}
                        onChange={(e) => updateEmploymentItem(emp.id, "position", e.target.value)}
                        placeholder="e.g. Senior Software Engineer"
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Department</label>
                      <input
                        type="text"
                        value={emp.department}
                        onChange={(e) => updateEmploymentItem(emp.id, "department", e.target.value)}
                        placeholder="e.g. Engineering / Operations"
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                      />
                    </div>
                  </div>

                  {/* Verification Country Dropdown */}
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Country *</label>
                    <select
                      value={emp.country || "India"}
                      onChange={(e) => {
                        updateEmploymentItem(emp.id, "country", e.target.value);
                        updateEmploymentItem(emp.id, "state", "");
                        updateEmploymentItem(emp.id, "city", "");
                      }}
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:ring-2 focus:ring-[#00450e]/20"
                    >
                      {ALLOWED_COUNTRIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* State & City Location */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(() => {
                      const stateList = getStatesForCountry(emp.country);
                      return (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">State / Province *</label>
                          {stateList.length > 0 ? (
                            <select
                              value={emp.state.startsWith("Other:") ? "Other" : emp.state}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateEmploymentItem(emp.id, "state", val);
                                updateEmploymentItem(emp.id, "city", "");
                              }}
                              className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                            >
                              <option value="">Select State / Province</option>
                              {stateList.map((s) => (
                                <option key={s.code || s.name} value={s.name}>{s.name}</option>
                              ))}
                              <option value="Other">Other / Enter Manually</option>
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={emp.state}
                              onChange={(e) => updateEmploymentItem(emp.id, "state", e.target.value)}
                              placeholder="Enter state / province"
                              className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                            />
                          )}
                          {(emp.state === "Other" || emp.state?.startsWith("Other:")) && (
                            <input
                              type="text"
                              value={emp.state.startsWith("Other:") ? emp.state.substring(6) : ""}
                              onChange={(e) => updateEmploymentItem(emp.id, "state", "Other:" + e.target.value)}
                              placeholder="Enter custom state name"
                              className="border border-[#eaf0e4] rounded-xl p-2 text-xs font-semibold text-[#181d16] bg-white focus:outline-none mt-1"
                            />
                          )}
                        </div>
                      );
                    })()}

                    {(() => {
                      const cityList = getCitiesForState(emp.country, emp.state);
                      return (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">City *</label>
                          {cityList.length > 0 ? (
                            <select
                              value={emp.city.startsWith("Other:") ? "Other" : emp.city}
                              onChange={(e) => updateEmploymentItem(emp.id, "city", e.target.value)}
                              disabled={!emp.state}
                              className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none disabled:opacity-50"
                            >
                              <option value="">{!emp.state ? "Select State First" : "Select City"}</option>
                              {cityList.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                              <option value="Other">Other / Enter Manually</option>
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={emp.city}
                              onChange={(e) => updateEmploymentItem(emp.id, "city", e.target.value)}
                              placeholder="Enter city name"
                              className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                            />
                          )}
                          {(emp.city === "Other" || emp.city?.startsWith("Other:")) && (
                            <input
                              type="text"
                              value={emp.city.startsWith("Other:") ? emp.city.substring(6) : ""}
                              onChange={(e) => updateEmploymentItem(emp.id, "city", "Other:" + e.target.value)}
                              placeholder="Enter custom city name"
                              className="border border-[#eaf0e4] rounded-xl p-2 text-xs font-semibold text-[#181d16] bg-white focus:outline-none mt-1"
                            />
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Employment Period & Identifiers */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-[#eaf0e4]/80">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">From Date *</label>
                      <input
                        type="date"
                        value={emp.employmentPeriodFrom}
                        onChange={(e) => updateEmploymentItem(emp.id, "employmentPeriodFrom", e.target.value)}
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">To Date (Leave blank if Present)</label>
                      <input
                        type="date"
                        value={emp.employmentPeriodTo}
                        onChange={(e) => updateEmploymentItem(emp.id, "employmentPeriodTo", e.target.value)}
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Employee Code / ID</label>
                      <input
                        type="text"
                        value={emp.employeeCode}
                        onChange={(e) => updateEmploymentItem(emp.id, "employeeCode", e.target.value.toUpperCase())}
                        placeholder="EMP ID / Code"
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white uppercase focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Reporting Manager & Compensation */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-[#eaf0e4]/80">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Reporting Manager Name (Optional)</label>
                      <input
                        type="text"
                        value={emp.reportingManagerName}
                        onChange={(e) => updateEmploymentItem(emp.id, "reportingManagerName", e.target.value)}
                        placeholder="Manager full name"
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Manager Email (Optional)</label>
                      <input
                        type="email"
                        value={emp.reportingManagerEmail}
                        onChange={(e) => updateEmploymentItem(emp.id, "reportingManagerEmail", e.target.value)}
                        placeholder="manager@company.com"
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Annual CTC</label>
                      <input
                        type="text"
                        value={emp.annualCTC}
                        onChange={(e) => updateEmploymentItem(emp.id, "annualCTC", e.target.value)}
                        placeholder="e.g. ₹12,00,000"
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Type, Agency & Remarks */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#eaf0e4]/80">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Employment Type</label>
                      <select
                        value={emp.employmentType}
                        onChange={(e) => updateEmploymentItem(emp.id, "employmentType", e.target.value)}
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                      >
                        <option value="">Select Type</option>
                        <option value="Full-time Permanent">Full-time Permanent</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contractual / Staffing Agency">Contractual / Staffing Agency</option>
                        <option value="Internship / Trainee">Internship / Trainee</option>
                        <option value="Consultant">Consultant</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Staffing Agency Name (If Contractual)</label>
                      <input
                        type="text"
                        value={emp.agencyDetails}
                        onChange={(e) => updateEmploymentItem(emp.id, "agencyDetails", e.target.value)}
                        placeholder="Staffing agency name"
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Reason for Leaving &amp; Remarks</label>
                      <textarea
                        value={emp.reasonForLeaving}
                        onChange={(e) => updateEmploymentItem(emp.id, "reasonForLeaving", e.target.value)}
                        rows={2}
                        placeholder="Reason for leaving or additional remarks"
                        className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none resize-none"
                      />
                    </div>

                    {/* Relieving / Experience Letter Attachment (Max 1MB UI label, 2MB hard limit) */}
                    <div className="flex flex-col gap-1.5 md:col-span-2 pt-2 border-t border-[#eaf0e4]/80">
                      <label className="text-[10px] font-bold text-[#00450e] uppercase tracking-wider">
                        Relieving / Experience Letter Attachment (PDF / Image, Max 1MB)
                      </label>
                      {emp.experienceLetterFile ? (
                        <div className="border border-emerald-200 rounded-xl p-3 bg-emerald-50/50 flex items-center justify-between">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                              📄
                            </div>
                            <div className="flex flex-col truncate">
                              <span className="text-xs font-bold text-slate-800 truncate">{emp.experienceLetterFileName || "Relieving_Letter.pdf"}</span>
                              <span className="text-[10px] text-emerald-700 font-semibold">Attachment Ready (Will be shown in Report Appendix)</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              updateEmploymentItem(emp.id, "experienceLetterFile", "");
                              updateEmploymentItem(emp.id, "experienceLetterFileName", "");
                            }}
                            className="px-2.5 py-1 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 font-bold text-[10px] transition-colors cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <label className="border-2 border-dashed border-[#d0dbc6] hover:border-[#00450e] rounded-xl p-3 bg-white hover:bg-[#f6fbf0]/50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                          <span className="text-xs font-bold text-[#00450e]">📎 Upload Relieving / Experience Letter (Max 1MB)</span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) {
                                setErrorMsg(`File "${file.name}" exceeds 1MB limit. Please upload a file smaller than 1MB.`);
                                return;
                              }
                              const fileName = file.name;
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                updateEmploymentItem(emp.id, "experienceLetterFile", reader.result as string);
                                updateEmploymentItem(emp.id, "experienceLetterFileName", fileName);
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Another Organisation Button */}
              <button
                type="button"
                onClick={addEmploymentItem}
                className="w-full py-3 border-2 border-dashed border-[#00450e]/30 hover:border-[#00450e] rounded-2xl text-xs font-bold text-[#00450e] bg-[#f6fbf0]/40 hover:bg-[#f6fbf0] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Building2 className="w-4 h-4 text-[#00450e]" />
                <span>+ Add Another Organisation / Past Employment Record</span>
              </button>
            </div>
          ) : (
            /* ═══════════════════════════════════════════════════ */
            /* EDUCATION DETAILS FORM                              */
            /* ═══════════════════════════════════════════════════ */
            <div className="flex flex-col gap-6">
              <div className="bg-[#f6fbf0]/60 border border-[#eaf0e4] rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 border-b border-[#eaf0e4] pb-2">
                  <Award className="w-4 h-4 text-purple-700" />
                  <span className="font-bold text-xs uppercase text-[#181d16] tracking-wider">Academic Credentials</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Verification Country Dropdown */}
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-[#475569] uppercase tracking-wider">Country *</label>
                    <select
                      value={eduForm.country || "India"}
                      onChange={(e) => updateEdu("country", e.target.value)}
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                    >
                      {ALLOWED_COUNTRIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Degree Category *</label>
                    <select
                      value={eduForm.degreeType}
                      onChange={(e) => updateEdu("degreeType", e.target.value)}
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none"
                    >
                      <option value="">Select Degree Category</option>
                      <option value="10th / Matriculation">10th / Matriculation</option>
                      <option value="12th / Intermediate">12th / Intermediate</option>
                      <option value="Bachelor's Degree">Bachelor's Degree</option>
                      <option value="Master's Degree">Master's Degree</option>
                      <option value="Doctorate (PhD)">Doctorate (PhD)</option>
                      <option value="Diploma">Diploma / Certification</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Course / Degree Name *</label>
                    <input
                      type="text"
                      value={eduForm.courseName}
                      onChange={(e) => updateEdu("courseName", e.target.value)}
                      placeholder="e.g. B.Tech Computer Science"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Board / University Name *</label>
                    <input
                      type="text"
                      value={eduForm.boardUniversity}
                      onChange={(e) => updateEdu("boardUniversity", e.target.value)}
                      placeholder="e.g. Delhi University, CBSE"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Institution / School / College Name *</label>
                    <input
                      type="text"
                      value={eduForm.institutionName}
                      onChange={(e) => updateEdu("institutionName", e.target.value)}
                      placeholder="e.g. Hansraj College"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Roll / Registration / Enrollment Number *</label>
                    <input
                      type="text"
                      value={eduForm.rollNumber}
                      onChange={(e) => updateEdu("rollNumber", e.target.value)}
                      placeholder="Roll or Registration number"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Passing Year *</label>
                    <input
                      type="number"
                      min="1950"
                      max="2026"
                      value={eduForm.passingYear}
                      onChange={(e) => updateEdu("passingYear", e.target.value)}
                      placeholder="e.g. 2023"
                      className="border border-[#eaf0e4] rounded-xl p-2.5 text-xs font-semibold text-[#181d16] bg-white focus:outline-none focus:border-[#181d16]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Buttons Footer */}
          <div className="pt-4 border-t border-[#eaf0e4] flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 border border-[#eaf0e4] rounded-xl font-semibold text-xs text-[#334155] hover:bg-[#f6fbf0] transition-colors cursor-pointer bg-white"
            >
              Fill Later / Close
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-[#181d16] text-white hover:bg-[#1E293B] active:scale-95 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>Submit Details</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
