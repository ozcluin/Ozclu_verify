"use client";

import React, { useState } from "react";
import {
  FileText,
  UploadCloud,
  X,
  ChevronDown,
  MapPin,
  Trash2,
  Plus,
  Lock,
} from "lucide-react";
import { Country, State, City } from "country-state-city";
import { INDIAN_STATES } from "src/lib/courts-mapping";

export interface CourtAddressItem {
  address: string;
  city: string;
  state: string;
  country: string;
  stateCode: string;
  districtCode: string;
  fromYear: number;
  toYear: number;
}

interface CourtPersonalDetailsFieldsProps {
  // Candidate Full Name & DOB
  candidateName: string;
  setCandidateName: (v: string) => void;
  candidateNamePlaceholder?: string;
  candidateDob: string;
  setCandidateDob: (v: string) => void;

  // ID Proof
  idProofType: string;
  setIdProofType: (v: string) => void;
  idProofNumber: string;
  setIdProofNumber: (v: string) => void;
  idProofFile?: string | null;
  setIdProofFile?: (v: string | null) => void;
  idProofFileName?: string;
  setIdProofFileName?: (v: string) => void;

  // Family Details
  fatherName: string;
  setFatherName: (v: string) => void;
  motherName: string;
  setMotherName: (v: string) => void;
  gender: string;
  setGender: (v: string) => void;
  isMarried: boolean;
  setIsMarried: (v: boolean) => void;
  husbandName: string;
  setHusbandName: (v: string) => void;

  // Addresses
  addresses: CourtAddressItem[];
  setAddresses: React.Dispatch<React.SetStateAction<CourtAddressItem[]>>;
  defaultCountry?: string;
  lockCountry?: boolean;

  // General Props
  disabled?: boolean;
  onError?: (msg: string) => void;
  colorTheme?: "emerald" | "indigo" | "rose" | "amber" | "teal";
}

const getCuratedStatesForCountry = (
  countryName: string,
  sortedIndianStates: Array<{ code: string; name: string }>
): Array<{ name: string; code: string }> => {
  if (!countryName) return [];

  if (countryName === "India") {
    return sortedIndianStates.map((s) => ({ name: s.name, code: s.code }));
  }

  if (countryName === "South Africa") {
    return [
      { name: "Eastern Cape", code: "EC" },
      { name: "Free State", code: "FS" },
      { name: "Gauteng", code: "GP" },
      { name: "KwaZulu-Natal", code: "KZN" },
      { name: "Limpopo", code: "LP" },
      { name: "Mpumalanga", code: "MP" },
      { name: "North West", code: "NW" },
      { name: "Northern Cape", code: "NC" },
      { name: "Western Cape", code: "WC" },
    ];
  }

  if (countryName === "United Kingdom") {
    const primaryUk = [
      { name: "England & Wales (All Divisions)", code: "EW" },
      { name: "Greater London", code: "GL" },
      { name: "Greater Manchester", code: "GM" },
      { name: "West Midlands", code: "WM" },
      { name: "West Yorkshire", code: "WY" },
      { name: "South East England", code: "SE" },
      { name: "South West England", code: "SW" },
      { name: "East Midlands", code: "EM" },
      { name: "North West England", code: "NW" },
      { name: "North East England", code: "NE" },
      { name: "East of England", code: "EE" },
      { name: "Scotland", code: "SCT" },
      { name: "Northern Ireland", code: "NIR" },
      { name: "Wales", code: "WLS" },
    ];
    const gbStates = State.getStatesOfCountry("GB") || [];
    const restGb = gbStates
      .filter((s) => !primaryUk.some((p) => p.name.toLowerCase() === s.name.toLowerCase()))
      .map((s) => ({ name: s.name, code: s.isoCode }));
    return [...primaryUk, ...restGb];
  }

  if (countryName === "Malaysia") {
    return [
      { name: "Kuala Lumpur", code: "MY-14" },
      { name: "Selangor", code: "MY-10" },
      { name: "Johor", code: "MY-01" },
      { name: "Penang (Pulau Pinang)", code: "MY-07" },
      { name: "Perak", code: "MY-08" },
      { name: "Sabah", code: "MY-12" },
      { name: "Sarawak", code: "MY-13" },
      { name: "Kedah", code: "MY-02" },
      { name: "Kelantan", code: "MY-03" },
      { name: "Malacca (Melaka)", code: "MY-04" },
      { name: "Negeri Sembilan", code: "MY-05" },
      { name: "Pahang", code: "MY-06" },
      { name: "Perlis", code: "MY-09" },
      { name: "Terengganu", code: "MY-11" },
      { name: "Putrajaya", code: "MY-16" },
      { name: "Labuan", code: "MY-15" },
    ];
  }

  if (countryName === "Singapore") {
    return [
      { name: "Central Singapore", code: "SG-01" },
      { name: "North East", code: "SG-02" },
      { name: "North West", code: "SG-03" },
      { name: "South East", code: "SG-04" },
      { name: "South West", code: "SG-05" },
      { name: "Singapore (Island-wide)", code: "SG-ALL" },
    ];
  }

  if (countryName === "Philippines") {
    const primaryPh = [
      { name: "Metro Manila (NCR)", code: "PH-00" },
      { name: "Cebu (Visayas)", code: "PH-CEB" },
      { name: "Davao del Sur (Mindanao)", code: "PH-DAV" },
      { name: "Pampanga (Central Luzon)", code: "PH-PAM" },
      { name: "Cavite (Calabarzon)", code: "PH-CAV" },
      { name: "Laguna", code: "PH-LAG" },
      { name: "Batangas", code: "PH-BAT" },
      { name: "Iloilo (Western Visayas)", code: "PH-ILO" },
      { name: "Misamis Oriental (Cagayan de Oro)", code: "PH-CDO" },
    ];
    const phStates = State.getStatesOfCountry("PH") || [];
    const restPh = phStates
      .filter((s) => !primaryPh.some((p) => p.name.toLowerCase() === s.name.toLowerCase()))
      .map((s) => ({ name: s.name, code: s.isoCode }));
    return [...primaryPh, ...restPh];
  }

  const countryObj = Country.getAllCountries().find(
    (c) => c.name.toLowerCase() === countryName.toLowerCase()
  );
  if (countryObj) {
    const states = State.getStatesOfCountry(countryObj.isoCode);
    if (states.length > 0) {
      return states
        .map((s) => ({ name: s.name, code: s.isoCode }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return [];
};

const getCuratedCitiesForState = (
  countryName: string,
  stateNameOrCode: string,
  districtsCache: Record<string, { loading: boolean; districts: Array<{ value: string; name: string }> }>
): Array<{ name: string; value: string }> => {
  if (!countryName || !stateNameOrCode) return [];

  if (countryName === "India") {
    return (districtsCache[stateNameOrCode]?.districts || []).map((d) => ({
      name: d.name,
      value: d.value,
    }));
  }

  if (countryName === "Singapore") {
    return [
      "Singapore",
      "Bedok",
      "Jurong East",
      "Tampines",
      "Woodlands",
      "Yishun",
      "Ang Mo Kio",
      "Choa Chu Kang",
      "Hougang",
      "Sengkang",
      "Novena",
      "Bukit Batok",
      "Clementi",
      "Kallang",
      "Marine Parade",
    ].map((name) => ({ name, value: name }));
  }

  if (countryName === "South Africa") {
    const cleanCode = stateNameOrCode.startsWith("Other:") ? stateNameOrCode.substring(6) : stateNameOrCode;
    const zaStates = State.getStatesOfCountry("ZA");
    const stateObj = zaStates.find(
      (s) =>
        s.isoCode.toLowerCase() === cleanCode.toLowerCase() ||
        s.name.toLowerCase() === cleanCode.toLowerCase()
    );
    if (stateObj) {
      const cities = City.getCitiesOfState("ZA", stateObj.isoCode);
      if (cities && cities.length > 0) {
        return cities.map((c) => ({ name: c.name, value: c.name })).sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  }

  if (countryName === "Malaysia") {
    const cleanCode = stateNameOrCode.startsWith("Other:") ? stateNameOrCode.substring(6) : stateNameOrCode;
    const myStates = State.getStatesOfCountry("MY");
    const stateObj = myStates.find(
      (s) =>
        s.isoCode.toLowerCase() === cleanCode.toLowerCase() ||
        s.name.toLowerCase() === cleanCode.toLowerCase()
    );
    if (stateObj) {
      const cities = City.getCitiesOfState("MY", stateObj.isoCode);
      if (cities && cities.length > 0) {
        return cities.map((c) => ({ name: c.name, value: c.name })).sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  }

  if (countryName === "Philippines") {
    const cleanCode = stateNameOrCode.startsWith("Other:") ? stateNameOrCode.substring(6) : stateNameOrCode;
    const phStates = State.getStatesOfCountry("PH");
    const stateObj = phStates.find(
      (s) =>
        s.isoCode.toLowerCase() === cleanCode.toLowerCase() ||
        s.name.toLowerCase() === cleanCode.toLowerCase()
    );
    if (stateObj) {
      const cities = City.getCitiesOfState("PH", stateObj.isoCode);
      if (cities && cities.length > 0) {
        return cities.map((c) => ({ name: c.name, value: c.name })).sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  }

  if (countryName === "United Kingdom") {
    const cleanCode = stateNameOrCode.startsWith("Other:") ? stateNameOrCode.substring(6) : stateNameOrCode;
    const gbStates = State.getStatesOfCountry("GB");
    const stateObj = gbStates.find(
      (s) =>
        s.isoCode.toLowerCase() === cleanCode.toLowerCase() ||
        s.name.toLowerCase() === cleanCode.toLowerCase()
    );
    if (stateObj) {
      const cities = City.getCitiesOfState("GB", stateObj.isoCode);
      if (cities && cities.length > 0) {
        return cities.map((c) => ({ name: c.name, value: c.name })).sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    return [
      "London",
      "Birmingham",
      "Manchester",
      "Leeds",
      "Liverpool",
      "Sheffield",
      "Bristol",
      "Newcastle",
      "Nottingham",
      "Cardiff",
      "Edinburgh",
      "Glasgow",
      "Belfast",
      "Southampton",
      "Leicester",
      "Coventry",
      "Bradford",
      "Reading",
      "Cambridge",
      "Oxford",
    ].map((name) => ({ name, value: name }));
  }

  const countryObj = Country.getAllCountries().find(
    (c) => c.name.toLowerCase() === countryName.toLowerCase()
  );
  if (countryObj) {
    const states = State.getStatesOfCountry(countryObj.isoCode);
    const cleanCode = stateNameOrCode.startsWith("Other:") ? stateNameOrCode.substring(6) : stateNameOrCode;
    const stateObj = states.find(
      (s) =>
        s.isoCode.toLowerCase() === cleanCode.toLowerCase() ||
        s.name.toLowerCase() === cleanCode.toLowerCase()
    );
    if (stateObj) {
      const cities = City.getCitiesOfState(countryObj.isoCode, stateObj.isoCode);
      if (cities && cities.length > 0) {
        return cities.map((c) => ({ name: c.name, value: c.name })).sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    const allCities = City.getCitiesOfCountry(countryObj.isoCode) || [];
    if (allCities.length > 0) {
      return Array.from(new Set(allCities.map((c) => c.name)))
        .slice(0, 150)
        .map((name) => ({ name, value: name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return [];
};

export default function CourtPersonalDetailsFields({
  candidateName,
  setCandidateName,
  candidateNamePlaceholder = "Enter candidate's full legal name",
  candidateDob,
  setCandidateDob,
  idProofType,
  setIdProofType,
  idProofNumber,
  setIdProofNumber,
  idProofFile,
  setIdProofFile,
  idProofFileName,
  setIdProofFileName,
  fatherName,
  setFatherName,
  motherName,
  setMotherName,
  gender,
  setGender,
  isMarried,
  setIsMarried,
  husbandName,
  setHusbandName,
  addresses,
  setAddresses,
  defaultCountry = "India",
  lockCountry = true,
  disabled = false,
  onError,
  colorTheme = "emerald",
}: CourtPersonalDetailsFieldsProps) {
  const currentYear = new Date().getFullYear();
  const [districtsCache, setDistrictsCache] = useState<
    Record<string, { loading: boolean; districts: Array<{ value: string; name: string }> }>
  >({});

  // Cascading Indian district fetcher if country is India
  const fetchDistrictsForState = async (stateCode: string) => {
    if (!stateCode || stateCode === "Other" || stateCode.startsWith("Other:")) return;
    if (districtsCache[stateCode]?.districts?.length > 0 || districtsCache[stateCode]?.loading) return;

    setDistrictsCache((prev) => ({
      ...prev,
      [stateCode]: { loading: true, districts: [] },
    }));

    try {
      const res = await fetch(`/api/ecourts-districts?stateCode=${encodeURIComponent(stateCode)}`);
      const data = await res.json();
      if (data.districts && Array.isArray(data.districts)) {
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
    } catch {
      setDistrictsCache((prev) => ({
        ...prev,
        [stateCode]: { loading: false, districts: [] },
      }));
    }
  };

  const addAddress = () => {
    setAddresses((prev) => [
      ...prev,
      {
        address: "",
        city: "",
        state: "",
        country: defaultCountry,
        stateCode: "",
        districtCode: "",
        fromYear: currentYear - 2,
        toYear: currentYear,
      },
    ]);
  };

  const removeAddress = (index: number) => {
    if (addresses.length <= 1) return;
    setAddresses((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAddress = (index: number, field: keyof CourtAddressItem, value: any) => {
    setAddresses((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Color theme helpers
  const themeFocusRing =
    colorTheme === "indigo"
      ? "focus:ring-indigo-500/20 focus:border-indigo-600"
      : colorTheme === "rose"
      ? "focus:ring-rose-500/20 focus:border-[#751C24]"
      : colorTheme === "amber"
      ? "focus:ring-amber-500/20 focus:border-[#78350f]"
      : colorTheme === "teal"
      ? "focus:ring-teal-500/20 focus:border-teal-600"
      : "focus:ring-emerald-500/20 focus:border-emerald-600";

  const themeSwitchBg =
    colorTheme === "indigo"
      ? "bg-indigo-600"
      : colorTheme === "rose"
      ? "bg-[#751C24]"
      : colorTheme === "amber"
      ? "bg-[#78350f]"
      : colorTheme === "teal"
      ? "bg-teal-600"
      : "bg-emerald-600";

  const themeSwitchText =
    colorTheme === "indigo"
      ? "text-indigo-800"
      : colorTheme === "rose"
      ? "text-[#751C24]"
      : colorTheme === "amber"
      ? "text-[#78350f]"
      : colorTheme === "teal"
      ? "text-teal-800"
      : "text-emerald-800";

  const sortedIndianStates = [...INDIAN_STATES].sort((a, b) => a.name.localeCompare(b.name));
  const sortedAllCountries = [...Country.getAllCountries()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {/* Candidate Full Name */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          Candidate Full Name <span className="text-rose-500 font-bold">*</span>
        </label>
        <input
          type="text"
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
          autoComplete="off"
          disabled={disabled}
          className={`border border-slate-300 rounded-xl p-3.5 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white placeholder-slate-400 font-semibold shadow-2xs ${
            disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
          }`}
          placeholder={candidateNamePlaceholder}
          required
        />
      </div>

      {/* Candidate DOB */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          Candidate Date of Birth <span className="text-rose-500 font-bold">*</span>
        </label>
        <div className="relative">
          <input
            type="date"
            value={candidateDob}
            onChange={(e) => setCandidateDob(e.target.value)}
            onFocus={() => {
              if (!candidateDob) {
                setCandidateDob("2000-01-01");
              }
            }}
            onClick={() => {
              if (!candidateDob) {
                setCandidateDob("2000-01-01");
              }
            }}
            disabled={disabled}
            className={`w-full border border-slate-300 rounded-xl p-3.5 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white placeholder-slate-400 font-semibold shadow-2xs ${
              disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
            }`}
            required
          />
        </div>
        {candidateDob && (() => {
          const dob = new Date(candidateDob);
          const today = new Date();
          if (isNaN(dob.getTime()) || dob > today) return null;
          let years = today.getFullYear() - dob.getFullYear();
          let months = today.getMonth() - dob.getMonth();
          if (today.getDate() < dob.getDate()) months--;
          if (months < 0) {
            years--;
            months += 12;
          }
          return (
            <p className="text-xs font-semibold text-slate-500 mt-1.5 flex items-center gap-1.5">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  colorTheme === "rose"
                    ? "bg-rose-500"
                    : colorTheme === "indigo"
                    ? "bg-indigo-500"
                    : colorTheme === "amber"
                    ? "bg-amber-500"
                    : colorTheme === "teal"
                    ? "bg-teal-500"
                    : "bg-emerald-500"
                }`}
              />
              Age: <span className="font-bold text-slate-700">{years} year{years !== 1 ? "s" : ""}{months > 0 ? `, ${months} month${months !== 1 ? "s" : ""}` : ""}</span>
            </p>
          );
        })()}
      </div>

      {/* ID Proof Section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            ID Proof (Optional)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* ID Type Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              ID Type
            </label>
            <div className="relative">
              <select
                value={idProofType}
                onChange={(e) => {
                  setIdProofType(e.target.value);
                  if (!e.target.value) {
                    setIdProofNumber("");
                    if (setIdProofFile) setIdProofFile(null);
                    if (setIdProofFileName) setIdProofFileName("");
                  }
                }}
                disabled={disabled}
                className={`w-full border border-slate-300 rounded-xl p-3 pr-8 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white font-semibold text-sm appearance-none ${
                  disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : "cursor-pointer"
                } ${!idProofType ? "text-slate-400" : ""}`}
              >
                <option value="">Select ID type</option>
                <option value="Driving Licence">Driving Licence</option>
                <option value="Passport">Passport</option>
                <option value="National ID">National ID / Identity Card</option>
                <option value="Voter ID">Voter ID</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* ID Number */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              ID Number
            </label>
            <input
              type="text"
              value={idProofNumber}
              onChange={(e) => setIdProofNumber(e.target.value)}
              autoComplete="off"
              disabled={disabled || !idProofType}
              className={`border border-slate-300 rounded-xl p-3 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white placeholder-slate-400 font-semibold text-sm shadow-2xs ${
                disabled || !idProofType ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
              }`}
              placeholder={idProofType ? `Enter ${idProofType} number` : "Select ID type first"}
            />
          </div>
        </div>

        {/* Optional Document Upload */}
        {setIdProofFile && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Candidate Identity Document / Slip</span>
              <span className="text-slate-400 font-normal">(Optional, Max 2MB)</span>
            </label>
            {idProofFile ? (
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-hidden">
                  <FileText className="w-4 h-4 text-slate-700 shrink-0" />
                  <span className="text-xs font-bold text-slate-800 truncate">{idProofFileName || "ID_Proof.pdf"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIdProofFile(null);
                    if (setIdProofFileName) setIdProofFileName("");
                  }}
                  className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="border border-dashed border-slate-300 hover:border-slate-400 rounded-xl p-3 bg-slate-50/50 hover:bg-white transition-all flex items-center justify-center gap-2 cursor-pointer">
                <UploadCloud className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-700">Upload ID Attachment (PDF, PNG, JPG)</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      if (onError) onError("File size exceeds 2MB limit.");
                      return;
                    }
                    if (setIdProofFileName) setIdProofFileName(file.name);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setIdProofFile(reader.result as string);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            )}
          </div>
        )}
      </div>

      {/* Family Details */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Family Details
          </span>
        </div>

        {/* Father's Name & Mother's Name row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              Father&apos;s Name <span className="text-rose-500 font-bold">*</span>
            </label>
            <input
              type="text"
              value={fatherName}
              onChange={(e) => setFatherName(e.target.value)}
              autoComplete="off"
              disabled={disabled}
              className={`border border-slate-300 rounded-xl p-3 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white placeholder-slate-400 font-semibold text-sm shadow-2xs ${
                disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
              }`}
              placeholder="Enter father's full name"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              Mother&apos;s Name
            </label>
            <input
              type="text"
              value={motherName}
              onChange={(e) => setMotherName(e.target.value)}
              autoComplete="off"
              disabled={disabled}
              className={`border border-slate-300 rounded-xl p-3 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white placeholder-slate-400 font-semibold text-sm shadow-2xs ${
                disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
              }`}
              placeholder="Enter mother's full name"
            />
          </div>
        </div>

        {/* Gender & Marital Status row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Gender dropdown */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              Gender
            </label>
            <div className="relative">
              <select
                value={gender}
                onChange={(e) => {
                  const val = e.target.value;
                  setGender(val);
                  if (val === "Male" || val === "Not required") {
                    setHusbandName("");
                  }
                }}
                disabled={disabled}
                className={`w-full border border-slate-300 rounded-xl p-3 pr-8 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white font-semibold text-sm appearance-none ${
                  disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : "cursor-pointer"
                }`}
              >
                <option value="Not required">Not required</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Marital Status Toggle */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              Marital Status
            </label>
            <div className="flex items-center gap-3 h-[46px]">
              <button
                type="button"
                onClick={() => {
                  setIsMarried(!isMarried);
                  if (isMarried) setHusbandName("");
                }}
                disabled={disabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-slate-400/20 ${
                  disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                } ${isMarried ? themeSwitchBg : "bg-slate-300"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    isMarried ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className={`text-xs font-semibold ${isMarried ? themeSwitchText : "text-slate-500"}`}>
                {isMarried ? "Married" : "Not Married"}
              </span>
            </div>
          </div>
        </div>

        {/* Husband's Name (conditional) */}
        {gender === "Female" && isMarried && (
          <div className="flex flex-col gap-1.5 animate-fade-in">
            <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              Husband&apos;s Name <span className="text-rose-500 font-bold">*</span>
            </label>
            <input
              type="text"
              value={husbandName}
              onChange={(e) => setHusbandName(e.target.value)}
              autoComplete="off"
              disabled={disabled}
              className={`border border-slate-300 rounded-xl p-3 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white placeholder-slate-400 font-semibold text-sm shadow-2xs ${
                disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
              }`}
              placeholder="Enter husband's full name"
              required
            />
          </div>
        )}
      </div>

      {/* Addresses Section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-500" />
            Addresses
          </label>
        </div>

        {addresses.map((addr, index) => {
          const effectiveCountry = addr.country || defaultCountry;
          const countryStates = getCuratedStatesForCountry(effectiveCountry, sortedIndianStates);
          const countryStateCities = getCuratedCitiesForState(effectiveCountry, addr.stateCode, districtsCache);

          return (
            <div
              key={index}
              className="border border-slate-200 rounded-2xl p-5 bg-gradient-to-br from-slate-50/70 via-white to-slate-50/20 relative group transition-all hover:border-slate-300 hover:shadow-xs shadow-2xs"
            >
              {addresses.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeAddress(index)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Remove address"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <div className="flex items-center gap-1.5 mb-3">
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                    colorTheme === "rose"
                      ? "text-[#751C24] bg-rose-50 border-rose-200"
                      : colorTheme === "indigo"
                      ? "text-indigo-800 bg-indigo-50 border-indigo-200"
                      : colorTheme === "amber"
                      ? "text-[#78350f] bg-amber-50 border-amber-200"
                      : colorTheme === "teal"
                      ? "text-teal-800 bg-teal-50 border-teal-200"
                      : "text-emerald-800 bg-emerald-50 border-emerald-200"
                  }`}
                >
                  Address {index + 1}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {/* Address Line */}
                <input
                  type="text"
                  value={addr.address}
                  onChange={(e) => updateAddress(index, "address", e.target.value)}
                  disabled={disabled}
                  className={`border border-slate-300 rounded-xl p-3 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white placeholder-slate-400 font-semibold text-sm shadow-2xs ${
                    disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : ""
                  }`}
                  placeholder="Street address (optional)"
                />

                {/* State + District/City Row */}
                <div className="grid grid-cols-2 gap-3">
                  {/* State Select */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      State / Province <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={addr.stateCode.startsWith("Other:") ? "Other" : addr.stateCode}
                        onChange={(e) => {
                          const selectedCode = e.target.value;
                          const selectedState = countryStates.find((s) => s.code === selectedCode);

                          setAddresses((prev) =>
                            prev.map((a, i) =>
                              i === index
                                ? {
                                    ...a,
                                    state: selectedCode === "Other" ? "Other" : selectedState?.name || "",
                                    stateCode: selectedCode,
                                    city: "",
                                    districtCode: "",
                                  }
                                : a
                            )
                          );
                          if (effectiveCountry === "India" && selectedCode) {
                            fetchDistrictsForState(selectedCode);
                          }
                        }}
                        disabled={disabled || !effectiveCountry}
                        className={`w-full border border-slate-300 rounded-xl p-3 pr-8 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white font-semibold text-sm appearance-none ${
                          disabled || !effectiveCountry
                            ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80"
                            : "cursor-pointer"
                        } ${!addr.stateCode ? "text-slate-400" : ""}`}
                      >
                        <option value="">Select state / province</option>
                        {countryStates.map((state) => (
                          <option key={state.code} value={state.code}>
                            {state.name}
                          </option>
                        ))}
                        {effectiveCountry && <option value="Other">Other / Enter Manually</option>}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                    {(addr.stateCode === "Other" || addr.stateCode.startsWith("Other:")) && (
                      <input
                        type="text"
                        value={addr.stateCode.startsWith("Other:") ? addr.stateCode.substring(6) : ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAddresses((prev) =>
                            prev.map((a, i) =>
                              i === index ? { ...a, state: val, stateCode: "Other:" + val } : a
                            )
                          );
                        }}
                        placeholder="Enter custom state/province name"
                        className={`border border-slate-300 rounded-xl p-3 mt-1.5 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white placeholder-slate-400 font-semibold text-sm shadow-2xs animate-fade-in`}
                      />
                    )}
                  </div>

                  {/* City/District Select */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      District / City <span className="text-rose-500 font-bold">*</span>
                      {effectiveCountry === "India" && addr.stateCode && districtsCache[addr.stateCode]?.loading && (
                        <span className="inline-block w-3 h-3 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                      )}
                    </label>

                    {countryStateCities.length > 0 ? (
                      <>
                        <div className="relative">
                          <select
                            value={addr.districtCode.startsWith("Other:") ? "Other" : addr.districtCode}
                            onChange={(e) => {
                              const selectedDistCode = e.target.value;
                              const distEntry = countryStateCities.find((d) => d.value === selectedDistCode);
                              const distName =
                                selectedDistCode === "Other" ? "Other" : distEntry?.name || selectedDistCode;

                              setAddresses((prev) =>
                                prev.map((a, i) =>
                                  i === index ? { ...a, city: distName, districtCode: selectedDistCode } : a
                                )
                              );
                            }}
                            disabled={
                              disabled ||
                              !addr.stateCode ||
                              (effectiveCountry === "India" && districtsCache[addr.stateCode]?.loading)
                            }
                            className={`w-full border border-slate-300 rounded-xl p-3 pr-8 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white font-semibold text-sm appearance-none ${
                              disabled ||
                              !addr.stateCode ||
                              (effectiveCountry === "India" && districtsCache[addr.stateCode]?.loading)
                                ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80"
                                : "cursor-pointer"
                            } ${!addr.districtCode ? "text-slate-400" : ""}`}
                          >
                            <option value="">
                              {effectiveCountry === "India" && districtsCache[addr.stateCode]?.loading
                                ? "Loading districts..."
                                : !addr.stateCode
                                ? "Select state first"
                                : "Select district / city"}
                            </option>
                            {countryStateCities.map((dist) => (
                              <option key={dist.value} value={dist.value}>
                                {dist.name}
                              </option>
                            ))}
                            {addr.stateCode && <option value="Other">Other / Enter Manually</option>}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                            <ChevronDown className="w-4 h-4" />
                          </div>
                        </div>
                        {(addr.districtCode === "Other" || addr.districtCode.startsWith("Other:")) && (
                          <input
                            type="text"
                            value={addr.districtCode.startsWith("Other:") ? addr.districtCode.substring(6) : ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAddresses((prev) =>
                                prev.map((a, i) =>
                                  i === index ? { ...a, city: val, districtCode: "Other:" + val } : a
                                )
                              );
                            }}
                            placeholder="Enter custom city/district name"
                            className={`border border-slate-300 rounded-xl p-3 mt-1.5 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white placeholder-slate-400 font-semibold text-sm shadow-2xs animate-fade-in`}
                          />
                        )}
                      </>
                    ) : (
                      <input
                        type="text"
                        value={addr.city}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAddresses((prev) =>
                            prev.map((a, i) =>
                              i === index ? { ...a, city: val, districtCode: val } : a
                            )
                          );
                        }}
                        disabled={disabled || !addr.stateCode}
                        placeholder={!addr.stateCode ? "Select state first" : "Enter city / town / district"}
                        className={`border border-slate-300 rounded-xl p-3 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white placeholder-slate-400 font-semibold text-sm shadow-2xs ${
                          disabled || !addr.stateCode
                            ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80"
                            : ""
                        }`}
                      />
                    )}
                  </div>
                </div>

                {/* Country Select / Locked Display */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    Country <span className="text-rose-500 font-bold">*</span>
                  </label>
                  {lockCountry ? (
                    <div className="flex items-center gap-2 border border-slate-200 rounded-xl p-3 bg-slate-50 text-sm font-semibold text-slate-700">
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{addr.country || defaultCountry}</span>
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={addr.country || defaultCountry}
                        onChange={(e) => {
                          const selectedCountry = e.target.value;
                          setAddresses((prev) =>
                            prev.map((a, i) =>
                              i === index
                                ? {
                                    ...a,
                                    country: selectedCountry,
                                    state: "",
                                    stateCode: "",
                                    city: "",
                                    districtCode: "",
                                  }
                                : a
                            )
                          );
                        }}
                        disabled={disabled}
                        className={`w-full border border-slate-300 rounded-xl p-3 pr-8 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white font-semibold text-sm appearance-none ${
                          disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : "cursor-pointer"
                        }`}
                      >
                        <option value="">Select country</option>
                        {sortedAllCountries.map((c) => (
                          <option key={c.isoCode} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Year Range (FROM -> TO) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      From Year <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={addr.fromYear}
                        onChange={(e) => {
                          const newFrom = Number(e.target.value);
                          setAddresses((prev) =>
                            prev.map((a, i) => {
                              if (i !== index) return a;
                              const maxTo = Math.min(newFrom + 2, currentYear);
                              return {
                                ...a,
                                fromYear: newFrom,
                                toYear: a.toYear > maxTo ? maxTo : a.toYear < newFrom ? newFrom : a.toYear,
                              };
                            })
                          );
                        }}
                        disabled={disabled}
                        className={`w-full border border-slate-300 rounded-xl p-3 pr-8 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white font-semibold text-sm appearance-none ${
                          disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : "cursor-pointer"
                        }`}
                      >
                        {Array.from({ length: currentYear - 2015 + 1 }, (_, idx) => currentYear - idx).map((yr) => (
                          <option key={yr} value={yr}>
                            {yr}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      To Year <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={addr.toYear}
                        onChange={(e) => {
                          const newTo = Number(e.target.value);
                          setAddresses((prev) =>
                            prev.map((a, i) => {
                              if (i !== index) return a;
                              const minFrom = Math.max(newTo - 2, 2015);
                              return {
                                ...a,
                                toYear: newTo,
                                fromYear: a.fromYear < minFrom ? minFrom : a.fromYear > newTo ? newTo : a.fromYear,
                              };
                            })
                          );
                        }}
                        disabled={disabled}
                        className={`w-full border border-slate-300 rounded-xl p-3 pr-8 font-body-sm text-slate-900 focus:outline-none focus:ring-2 ${themeFocusRing} transition-all bg-white font-semibold text-sm appearance-none ${
                          disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed border-slate-200 opacity-80" : "cursor-pointer"
                        }`}
                      >
                        {Array.from({ length: Math.min(3, currentYear - addr.fromYear + 1) }, (_, idx) => addr.fromYear + idx).map((yr) => (
                          <option key={yr} value={yr}>
                            {yr}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Year range hint */}
                <p className="text-[9px] text-slate-400 font-medium -mt-1">
                  Max 3-year span per address · Searching {addr.fromYear} → {addr.toYear} ({addr.toYear - addr.fromYear + 1} year{addr.toYear - addr.fromYear + 1 !== 1 ? "s" : ""})
                </p>
              </div>
            </div>
          );
        })}

        <div className="flex justify-end mt-1">
          <button
            type="button"
            onClick={addAddress}
            disabled={disabled}
            className={`px-3 py-1.5 border border-slate-300 text-xs font-bold text-slate-800 hover:text-slate-900 hover:border-slate-400 hover:bg-slate-50 rounded-lg flex items-center gap-1 transition-all shadow-2xs ${
              disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-95"
            }`}
          >
            <Plus className="w-3.5 h-3.5 text-slate-700" />
            Add Address
          </button>
        </div>
      </div>
    </>
  );
}
