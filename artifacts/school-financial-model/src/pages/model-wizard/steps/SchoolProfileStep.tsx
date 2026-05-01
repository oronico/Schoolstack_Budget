import { useEffect, useMemo, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import { FormInput, FormSelect, FormCheckbox, getNestedError } from "@/components/ui/form-inputs";
import { Building2, Rocket, AlertCircle, MapPin, Home, Key, HelpCircle, Landmark, Info, ChevronDown, ChevronUp, ExternalLink, Gift, Sprout, AlertTriangle, Lightbulb, Heart, Upload, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { FinancingInsight } from "@/components/coaching/FinancingInsight";
import { GlossaryTerm } from "@/components/coaching/GlossaryTerm";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { InlineHelpCard } from "@/components/coaching/InlineHelpCard";
import { MicroLessonCardInner } from "@/components/coaching/MicroLessonCard";
import { EXPLAINERS } from "@/lib/coaching/explainers";
import { useAuth } from "@/lib/auth-context";
import { isYetToLaunch as personaIsYetToLaunch } from "@/lib/coaching/founder-persona";
import { trackCoachingEvent } from "@/lib/coaching/track";
import { cn } from "@/lib/utils";
import { SCHOOL_TYPE_LABELS, ENTITY_TYPE_LABELS, isForProfit, isNonprofit, isChestertonAcademy } from "../schema";
import { buildDefaultChestertonData } from "@/lib/chesterton/template";
import {
  parseAccountingExportCsv,
  parseAccountingExportRows,
  MAX_ACCOUNTING_EXPORT_BYTES,
  type AccountingExportLike,
  type ParsedAccountingExport,
} from "@/lib/decision-flows";

const STATES = [
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" }, { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" }, { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" }, { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" }, { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" }, { value: "IN", label: "Indiana" }, { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" }, { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" }, { value: "MD", label: "Maryland" }, { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" }, { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" }, { value: "MT", label: "Montana" }, { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" }, { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" }, { value: "NY", label: "New York" }, { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" }, { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" }, { value: "PA", label: "Pennsylvania" }, { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" }, { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" }, { value: "UT", label: "Utah" }, { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" }, { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" }, { value: "WY", label: "Wyoming" }, { value: "DC", label: "Washington D.C." },
];

const MONTHS = [
  { value: "1", label: "January" }, { value: "2", label: "February" }, { value: "3", label: "March" },
  { value: "4", label: "April" }, { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" }, { value: "9", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

function EINInput() {
  const { watch, setValue } = useFormContext();
  const raw = watch("schoolProfile.ein") || "";

  const formatEIN = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 9);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatEIN(e.target.value);
    setValue("schoolProfile.ein", formatted, { shouldDirty: true });
  };

  const display = formatEIN(raw);
  const isComplete = raw.replace(/\D/g, "").length === 9;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="ein" className="text-sm font-semibold text-foreground">
        EIN (Employer Identification Number)
      </label>
      <input
        id="ein"
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        maxLength={10}
        className="w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-base text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 tracking-widest font-mono"
        placeholder="XX-XXXXXXX"
      />
      {display && !isComplete ? (
        <p className="text-xs text-muted-foreground">{raw.replace(/\D/g, "").length}/9 digits</p>
      ) : !display ? (
        <p className="text-xs text-muted-foreground">Optional - you can add this later</p>
      ) : null}
      <FinancingInsight text="If you're applying for financing, banks will verify your EIN against IRS records - having it ready saves time." />
    </div>
  );
}

interface RadioCardProps {
  value: string;
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
}

function RadioCard({ selected, onSelect, icon, title, description, disabled }: RadioCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all w-full",
        disabled && "opacity-50 cursor-not-allowed",
        selected
          ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
          : "border-border bg-card hover:border-primary/40 hover:bg-primary/[0.02]"
      )}
    >
      <div className={cn(
        "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
        selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("font-semibold text-base", selected ? "text-primary" : "text-foreground")}>{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className={cn(
        "flex-shrink-0 w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center",
        selected ? "border-primary" : "border-border"
      )}>
        {selected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
      </div>
    </button>
  );
}




const ENTITY_TYPE_GUIDE = [
  {
    key: "sole_practitioner",
    name: "Sole Practitioner",
    pros: "Simplest to set up, no paperwork or fees to form, full control over decisions",
    cons: "Personal liability for debts, harder to get loans, no EIN separation",
    goodFor: "Tutoring businesses, solo micro-pods, getting started quickly",
  },
  {
    key: "llc_single",
    name: "LLC (Single Member)",
    pros: "Separates personal and business assets, simple pass-through taxes, credibility with vendors",
    cons: "State filing fees, annual reports in some states, slightly more paperwork",
    goodFor: "Solo founders starting a microschool or learning pod",
  },
  {
    key: "llc_partnership",
    name: "LLC (Partnership)",
    pros: "Same liability protection as single-member LLC, flexible profit sharing, pass-through taxes",
    cons: "Need an operating agreement, potential for partner disagreements, more complex tax filing",
    goodFor: "Co-founded schools with two or more partners",
  },
  {
    key: "c_corp",
    name: "C Corporation",
    pros: "Can raise investment capital, issue stock, unlimited growth potential",
    cons: "Double taxation on profits, more regulatory requirements, higher accounting costs",
    goodFor: "Schools planning to scale significantly or take outside investment",
  },
  {
    key: "s_corp",
    name: "S Corporation",
    pros: "Pass-through taxation like an LLC, corporate structure, potential payroll tax savings",
    cons: "Limited to 100 shareholders, restrictions on ownership types, more paperwork than an LLC",
    goodFor: "Small school businesses wanting corporate structure without double taxation",
  },
  {
    key: "nonprofit_501c3",
    name: "501(c)(3) Nonprofit",
    pros: "Tax-exempt, eligible for grants and donations, donors get tax deductions, access to public funding",
    cons: "No owners or shareholders, strict governance rules, longer setup process, public reporting",
    goodFor: "Mission-driven schools, charter schools, required for most government and foundation funding",
  },
  {
    key: "undetermined",
    name: "Undetermined",
    pros: "No pressure to decide right now - your financial model works with any entity type",
    cons: "You'll want to choose before applying for loans, grants, or opening a bank account",
    goodFor: "Early-stage founders still exploring options - you can update this anytime",
  },
];

function EntityTypeSection({ allowedEntityTypes, entityType, lendingLabIntent }: { allowedEntityTypes: [string, string][]; entityType?: string; lendingLabIntent?: string }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const showNudge = lendingLabIntent === "plan_to_apply" || lendingLabIntent === "want_to_understand";

  return (
    <div>
      <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Entity Type</h3>
      <p className="text-sm text-muted-foreground mb-4">
        This helps us use the right financial terminology in your model and reports. There's no wrong answer here.
      </p>
      {showNudge && (
        <div className="rounded-xl bg-teal-50/60 border border-teal-200/60 px-4 py-3 mb-4 flex items-start gap-2.5">
          <Lightbulb className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-teal-800">Not sure? Most small private schools start as an LLC or 501(c)(3). You can always update this later.</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setGuideOpen(!guideOpen)}
        aria-expanded={guideOpen}
        className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 mb-4 transition-colors"
      >
        <Info className="h-4 w-4" />
        {guideOpen ? "Hide" : "Which entity type is right for my school?"}
        {guideOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {guideOpen && (
        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/[0.02] p-5 animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-sm text-muted-foreground mb-4">
            Every school is different, and there's no single right answer. Here's a quick overview to help you think through your options. You can always change this later.
          </p>
          <div className="space-y-4">
            {ENTITY_TYPE_GUIDE.filter(g => allowedEntityTypes.some(([k]) => k === g.key)).map((guide) => (
              <div key={guide.key} className="rounded-xl border border-border bg-card p-4">
                <h4 className="font-semibold text-sm text-foreground mb-2">{guide.name}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="font-medium text-green-600">Pros: </span>
                    <span className="text-muted-foreground">{guide.pros}</span>
                  </div>
                  <div>
                    <span className="font-medium text-amber-600">Cons: </span>
                    <span className="text-muted-foreground">{guide.cons}</span>
                  </div>
                  <div>
                    <span className="font-medium text-primary">Good for: </span>
                    <span className="text-muted-foreground">{guide.goodFor}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <FormSelect
            name="schoolProfile.entityType"
            label="Entity Type"
            options={allowedEntityTypes.map(([value, label]) => ({ value, label }))}
          />
          <FinancingInsight text="Your entity type affects tax treatment, liability, and what financing options are available. 501(c)(3) status can unlock tax-exempt bond financing if that's part of your plan." />
        </div>
        {entityType && entityType !== "sole_practitioner" && entityType !== "undetermined" && (
          <EINInput />
        )}
      </div>
    </div>
  );
}

const FACILITY_BENCHMARKS: Record<string, string> = {
  catholic_school: "$5,000–$15,000/mo",
  microschool: "$1,500–$4,000/mo",
  learning_pod: "$800–$2,500/mo",
  private_school: "$5,000–$15,000/mo",
  charter_school: "$8,000–$25,000/mo",
  homeschool_coop: "$500–$2,000/mo",
  tutoring_center: "$1,500–$4,000/mo",
  other: "$2,000–$8,000/mo",
};

const CURRENT_YEAR = new Date().getFullYear();
const LEASE_EXPIRATION_YEARS = Array.from({ length: 15 }, (_, i) => ({
  value: String(CURRENT_YEAR + i),
  label: String(CURRENT_YEAR + i),
}));

const YEAR_OPTIONS = [
  { value: "1", label: "Year 1" },
  { value: "2", label: "Year 2" },
  { value: "3", label: "Year 3" },
  { value: "4", label: "Year 4" },
  { value: "5", label: "Year 5" },
];

const OWNERSHIP_PILLS = [
  { value: "own" as const, label: "Own" },
  { value: "rent" as const, label: "Rent / Lease" },
  { value: "donated" as const, label: "Donated" },
  { value: "home_based" as const, label: "Home-based" },
];

function FacilityPhaseCard({ index, phase, onRemove, onUpdate, schoolType, entityType }: {
  index: number;
  phase: { id: string; ownershipType: string; startYear: number; endYear: number; [key: string]: unknown };
  onRemove: () => void;
  onUpdate: (field: string, value: unknown) => void;
  schoolType?: string;
  entityType?: string;
}) {
  const forProfit = entityType ? !["nonprofit_501c3"].includes(entityType) : false;
  const isNNN = phase.isNNNLease as boolean;
  const hasMort = phase.hasMortgage as boolean;
  const benchmarkText = schoolType && FACILITY_BENCHMARKS[schoolType] ? FACILITY_BENCHMARKS[schoolType] : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold">{index + 1}</span>
          <h4 className="text-sm font-bold text-foreground">Phase {index + 1}</h4>
        </div>
        {index > 0 && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-xs">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Starts</label>
          <select
            value={phase.startYear}
            onChange={e => onUpdate("startYear", Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            {YEAR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Ends</label>
          <select
            value={phase.endYear}
            onChange={e => onUpdate("endYear", Number(e.target.value))}
            className={cn("w-full rounded-lg border bg-background px-3 py-1.5 text-sm", phase.startYear > phase.endYear ? "border-destructive" : "border-border")}
          >
            {YEAR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {phase.startYear > phase.endYear && (
            <p className="text-xs text-destructive mt-1">End year must be ≥ start year</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">Arrangement</label>
        <div className="flex flex-wrap gap-2">
          {OWNERSHIP_PILLS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onUpdate("ownershipType", opt.value)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                phase.ownershipType === opt.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {phase.ownershipType === "rent" && (
        <div className="space-y-3 pl-2 border-l-2 border-primary/20">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Monthly Rent</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input type="number" value={phase.monthlyRent as number || ""} onChange={e => onUpdate("monthlyRent", Number(e.target.value))} placeholder="5000" className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Annual Escalation %</label>
              <input type="number" value={phase.annualRentEscalation as number || ""} onChange={e => onUpdate("annualRentEscalation", Number(e.target.value))} placeholder="3" className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Lease Expires (Year)</label>
              <input type="number" value={phase.leaseExpirationYear as number || ""} onChange={e => onUpdate("leaseExpirationYear", e.target.value ? Number(e.target.value) : undefined)} placeholder="2030" className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Expires (Month)</label>
              <select value={phase.leaseExpirationMonth as number ?? ""} onChange={e => onUpdate("leaseExpirationMonth", e.target.value ? Number(e.target.value) : undefined)} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
                <option value="">--</option>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={m}>{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m-1]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Renewal Bump %</label>
              <input type="number" value={phase.postLeaseRenewalBump as number ?? ""} onChange={e => onUpdate("postLeaseRenewalBump", Number(e.target.value))} placeholder="15" className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
            </div>
          </div>
          <FinancingInsight text="If your lease expires during the 5-year plan, think about what happens next - renewal terms, a relocation plan, or a backup option. This is something banks focus on." />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!isNNN} onChange={e => onUpdate("isNNNLease", e.target.checked)} className="rounded" />
            <span className="text-muted-foreground">Triple Net (NNN) lease</span>
          </label>
          {isNNN && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">CAM/mo</label>
                <div className="relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span><input type="number" value={phase.nnnCamCharges as number || ""} onChange={e => onUpdate("nnnCamCharges", Number(e.target.value))} className="w-full rounded-lg border border-border bg-background pl-6 pr-2 py-1.5 text-xs" /></div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Maint/mo</label>
                <div className="relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span><input type="number" value={phase.nnnMaintenance as number || ""} onChange={e => onUpdate("nnnMaintenance", Number(e.target.value))} className="w-full rounded-lg border border-border bg-background pl-6 pr-2 py-1.5 text-xs" /></div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Util/mo</label>
                <div className="relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span><input type="number" value={phase.nnnUtilities as number || ""} onChange={e => onUpdate("nnnUtilities", Number(e.target.value))} className="w-full rounded-lg border border-border bg-background pl-6 pr-2 py-1.5 text-xs" /></div>
              </div>
            </div>
          )}
        </div>
      )}

      {phase.ownershipType === "own" && (
        <div className="space-y-3 pl-2 border-l-2 border-primary/20">
          {forProfit && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Annual Property Tax</label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span><input type="number" value={phase.propertyTaxAnnual as number || ""} onChange={e => onUpdate("propertyTaxAnnual", Number(e.target.value))} placeholder="5000" className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-1.5 text-sm" /></div>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!hasMort} onChange={e => onUpdate("hasMortgage", e.target.checked)} className="rounded" />
            <span className="text-muted-foreground">We have a mortgage</span>
          </label>
          {hasMort && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Monthly Mortgage Payment</label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span><input type="number" value={phase.mortgageMonthlyPayment as number || ""} onChange={e => onUpdate("mortgageMonthlyPayment", Number(e.target.value))} placeholder="2500" className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-1.5 text-sm" /></div>
            </div>
          )}
        </div>
      )}

      {phase.ownershipType === "donated" && (
        <div className="space-y-3 pl-2 border-l-2 border-primary/20">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Comparable Market Rent/mo</label>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span><input type="number" value={phase.comparableMarketRent as number || ""} onChange={e => onUpdate("comparableMarketRent", Number(e.target.value))} placeholder="3000" className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-1.5 text-sm" /></div>
            {benchmarkText && <p className="text-xs text-muted-foreground mt-1">Typical for your school type: {benchmarkText}</p>}
            {(phase.comparableMarketRent === 0 || phase.comparableMarketRent === undefined) && (
              <p className="text-xs text-amber-600 mt-1">Even if your space is free, entering a comparable market rent helps your model show what happens if the arrangement changes. It's good planning either way.</p>
            )}

          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Arrangement End Date</label>
            <input type="date" value={phase.facilityArrangementEndDate as string || ""} onChange={e => onUpdate("facilityArrangementEndDate", e.target.value || undefined)} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
            <p className="text-xs text-muted-foreground mt-1">Leave blank if the arrangement has no fixed end date.</p>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!phase.hasWrittenAgreement} onChange={e => onUpdate("hasWrittenAgreement", e.target.checked)} className="rounded" />
            <span className="text-muted-foreground">Written agreement in place</span>
          </label>
        </div>
      )}

      {phase.ownershipType === "home_based" && (
        <div className="space-y-3 pl-2 border-l-2 border-primary/20">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Monthly Facility Allocation</label>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span><input type="number" value={phase.monthlyFacilityAllocation as number || ""} onChange={e => onUpdate("monthlyFacilityAllocation", Number(e.target.value))} placeholder="500" className="w-full rounded-lg border border-border bg-background pl-7 pr-3 py-1.5 text-sm" /></div>
            {(phase.monthlyFacilityAllocation === 0 || phase.monthlyFacilityAllocation === undefined) && (
              <p className="text-xs text-amber-600 mt-1">Even home-based programs have costs (internet, utilities, supplies). Add a small monthly allocation so your budget reflects the true cost of operating.</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!phase.hasWrittenAgreement} onChange={e => onUpdate("hasWrittenAgreement", e.target.checked)} className="rounded" />
            <span className="text-muted-foreground">Written use agreement in place</span>
          </label>
        </div>
      )}

      {phase.ownershipType && phase.ownershipType !== "home_based" && (
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Square Footage</label>
              <input type="number" value={phase.squareFootage as number || ""} onChange={e => onUpdate("squareFootage", e.target.value ? Number(e.target.value) : undefined)} placeholder="5000" className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
              <p className="text-xs text-muted-foreground mt-1">Total usable square footage</p>
            </div>
            <div className="flex items-end pb-6">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!phase.hasRenewalOption} onChange={e => onUpdate("hasRenewalOption", e.target.checked)} className="rounded" />
                <span className="text-muted-foreground">Lease includes renewal option</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// "Mar 14" formatter — keeps the upload card readable without yanking in
// the model summary's heavier date-fns helpers. Falls back to "today" if
// the timestamp can't be parsed (shouldn't happen since we set it
// ourselves, but defensive against round-tripped data).
function formatUploadedAt(iso: string | undefined): string {
  if (!iso) return "today";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "today";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Reads a CSV the founder has uploaded, parses out the headline P&L
// totals, and persists the result on the form so the saved-scenario
// actuals editor's "Suggest from latest data" affordance can pull from
// real books. Re-uploading replaces the prior file in place — that's the
// "automatically refreshes" behavior the task calls for, since the
// suggestion engine reads `accountingExport` lazily on each render.
function AccountingExportUploader({ focused }: { focused?: boolean }) {
  const { watch, setValue } = useFormContext();
  const exportData = watch("accountingExport") as AccountingExportLike | undefined;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  // Two-step confirmation for the destructive "Remove uploaded export"
  // affordance — mirrors the saved-scenario actuals editor on the
  // scenarios page so a misclick can't silently nuke the founder's books.
  // Resets back to false whenever the upload itself goes away (either via
  // confirm-remove or a fresh upload that replaces it) so a half-confirmed
  // remove can't bleed into a different file.
  const [confirmRemoveExport, setConfirmRemoveExport] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const guidanceLevel = (user?.guidanceLevel as "advanced" | "basics" | "extra") || "basics";
  const showCoach = guidanceLevel !== "advanced";

  // Track the lesson + post-upload coach-line surfacings exactly once each
  // per mount so the analytics view doesn't get spammed by re-renders.
  const lessonTrackedRef = useRef(false);
  useEffect(() => {
    if (!showCoach || lessonTrackedRef.current) return;
    lessonTrackedRef.current = true;
    trackCoachingEvent("accounting_export_lesson_shown", {
      surface: "uploader",
      guidanceLevel,
    });
  }, [showCoach, guidanceLevel]);
  const postUploadTrackedRef = useRef<string>("");
  useEffect(() => {
    if (!showCoach || !exportData) return;
    const key = exportData.filename ?? "";
    if (postUploadTrackedRef.current === key) return;
    postUploadTrackedRef.current = key;
    trackCoachingEvent("accounting_export_post_upload_coach_shown", {
      filename: exportData.filename,
      guidanceLevel,
    });
  }, [showCoach, exportData, guidanceLevel]);
  // Brief amber ring shown when the founder lands here from the saved-scenario
  // "Replace export" deep-link, so the upload section is visually called out
  // after the scroll-into-view. Cleared after a few seconds so it doesn't
  // hang around the next time they visit the step manually.
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    if (!focused) return;
    const node = containerRef.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlight(true);
    const t = window.setTimeout(() => setHighlight(false), 2400);
    return () => window.clearTimeout(t);
  }, [focused]);

  const totals = exportData?.totals;
  const hasAnyTotal =
    !!totals &&
    (totals.totalRevenue !== undefined ||
      totals.totalExpenses !== undefined ||
      totals.netIncome !== undefined);
  // Curated category subtotals (tuition / philanthropy / payroll /
  // facility) — surfaced as a secondary breakdown chip row under the
  // headline figures so the founder can see exactly which sub-rows we
  // recognized before they head into mapping. Each chip is omitted when
  // the parser couldn't find a matching row, so a sparse export only
  // shows the chips we actually picked up.
  const categoryChips: Array<{ label: string; value: number; testid: string }> = [];
  if (totals?.tuitionRevenue !== undefined) {
    categoryChips.push({
      label: "Tuition",
      value: totals.tuitionRevenue,
      testid: "accounting-export-tuition",
    });
  }
  if (totals?.philanthropyRevenue !== undefined) {
    categoryChips.push({
      label: "Philanthropy",
      value: totals.philanthropyRevenue,
      testid: "accounting-export-philanthropy",
    });
  }
  if (totals?.payrollExpense !== undefined) {
    categoryChips.push({
      label: "Payroll",
      value: totals.payrollExpense,
      testid: "accounting-export-payroll",
    });
  }
  if (totals?.facilityExpense !== undefined) {
    categoryChips.push({
      label: "Facility / Rent",
      value: totals.facilityExpense,
      testid: "accounting-export-facility",
    });
  }

  const triggerPicker = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_ACCOUNTING_EXPORT_BYTES) {
      setError(
        `File is larger than ${Math.round(MAX_ACCOUNTING_EXPORT_BYTES / 1000)} KB. Trim it to a single P&L summary and re-upload.`,
      );
      return;
    }
    const lower = file.name.toLowerCase();
    const isXlsx = lower.endsWith(".xlsx");
    const isCsv = lower.endsWith(".csv");
    if (!isCsv && !isXlsx) {
      setError("Only CSV and Excel (.xlsx) exports are supported. Re-export your Profit & Loss from QuickBooks, Xero, or Wave as CSV or Excel.");
      return;
    }
    setIsParsing(true);
    try {
      let parsed: ParsedAccountingExport;
      if (isXlsx) {
        // Parse client-side via SheetJS so the founder's books never leave
        // their browser. We take the first sheet, convert to a string[][]
        // grid, and feed it through the same row processor the CSV path
        // uses so label aliases and right-most-column logic stay
        // identical across formats. SheetJS is loaded lazily here so its
        // ~600 KB bundle only ships to founders who actually upload an
        // .xlsx file.
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const firstName = wb.SheetNames[0];
        if (!firstName) {
          setError("That Excel file didn't have any sheets we could read. Re-export the Profit & Loss as a single sheet and try again.");
          return;
        }
        const sheet = wb.Sheets[firstName];
        const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          blankrows: false,
          raw: false,
          defval: "",
        });
        const rows: string[][] = grid.map((r) => (r ?? []).map((c) => (c == null ? "" : String(c))));
        parsed = parseAccountingExportRows(rows);
      } else {
        const text = await file.text();
        parsed = parseAccountingExportCsv(text);
      }
      const next: AccountingExportLike = {
        filename: file.name,
        uploadedAt: new Date().toISOString(),
        totals: parsed.totals,
        // Persist the parser's row-recognition count so the post-upload
        // coach line can tell the founder *how many* account categories we
        // picked up. Without this the coach falls through to its
        // "couldn't recognize anything" branch even on a clean QuickBooks
        // export — see budget-coach-surfaces.spec.ts.
        recognizedRowCount: parsed.recognizedRowCount,
        parseWarnings: parsed.parseWarnings.length > 0 ? parsed.parseWarnings : undefined,
      };
      // setValue marks the form dirty so the wizard's autosave picks it up
      // and the saved-scenario editor on the scenarios page will see the
      // new export the next time it computes a suggestion.
      setValue("accountingExport", next, { shouldDirty: true });
    } catch (e) {
      setError(
        isXlsx
          ? "Couldn't read that Excel file. Re-save it as .xlsx (or export as CSV) and try again."
          : "Couldn't read that file. Make sure it's a plain-text CSV and try again.",
      );
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  // Clears the founder's uploaded accounting export from the wizard form.
  // Mirrors the scenarios-page implementation: snapshot the prior export
  // first so the toast can offer a one-click Undo (the upload itself isn't
  // re-stored anywhere else, so undoing is the *only* way to recover from
  // an accidental remove). The wizard's autosave picks the cleared value
  // up on the next render, so we don't need to call any mutation here.
  const removeUpload = () => {
    setError(null);
    const priorExport = exportData;
    setValue("accountingExport", undefined, { shouldDirty: true });
    setConfirmRemoveExport(false);
    if (!priorExport) return;
    toast({
      title: "Uploaded export removed",
      description:
        "Suggestions will revert to your typed-in priors. Upload a fresh export to start sourcing from books again.",
      action: (
        <ToastAction
          altText="Undo remove"
          onClick={() => {
            setValue("accountingExport", priorExport, { shouldDirty: true });
            toast({
              title: "Upload restored",
              description: "Your accounting export is back on the model.",
            });
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  // If the upload disappears for any reason (replace flow that briefly
  // clears + re-sets, autosave round-trip, etc.) clear any half-confirmed
  // remove state so the prompt doesn't reappear over a fresh upload.
  useEffect(() => {
    if (!exportData) setConfirmRemoveExport(false);
  }, [exportData]);

  return (
    <div
      ref={containerRef}
      data-testid="accounting-export-uploader"
      className={cn(
        "rounded-2xl transition-shadow duration-500",
        highlight && "ring-2 ring-amber-400 ring-offset-2 ring-offset-card shadow-lg shadow-amber-200/40 -m-1 p-1",
      )}
      data-focused={highlight ? "true" : undefined}
    >
      <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">
        Accounting Export (Optional)
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Drop in your latest QuickBooks, Xero, or Wave Profit &amp; Loss
        export and we'll auto-fill the actuals editor on saved scenarios so
        you don't re-type figures already in your books.
      </p>
      {showCoach && (
        <div className="mb-4" data-testid="accounting-export-lesson">
          <MicroLessonCardInner
            lesson={{
              id: "accounting_export_uploader_lesson",
              title: "Quick lesson: what makes a clean P&L export",
              body:
                "From QuickBooks, Xero, or Wave, run a Profit & Loss for the most recent full month or year. Export as CSV or Excel — no edits, no merged cells. We read the rightmost numeric column, so summary rows like \"Total Revenue\" and \"Net Income\" land in the right buckets automatically. Skip exports with multiple sheets, pivot tables, or dashboard formatting.",
              readTimeSeconds: 25,
              triggerStep: 0,
              checkTrigger: () => true,
            }}
            onDismiss={() => {
              // No-op: the lesson is contextual to this uploader and is
              // re-shown each time the founder revisits the step. We rely
              // on the parent's containerRef + highlight to hint that the
              // section is here when needed.
            }}
          />
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={onChange}
        data-testid="accounting-export-file-input"
      />
      {!exportData ? (
        <button
          type="button"
          onClick={triggerPicker}
          disabled={isParsing}
          className="w-full rounded-xl border-2 border-dashed border-border bg-muted/20 hover:border-primary/40 hover:bg-primary/5 transition-colors px-4 py-6 flex flex-col items-center gap-2 text-center"
          data-testid="accounting-export-upload-button"
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            {isParsing ? "Reading file…" : "Upload accounting export (CSV or Excel)"}
          </span>
          <span className="text-xs text-muted-foreground">
            Profit &amp; Loss .csv or .xlsx, up to {Math.round(MAX_ACCOUNTING_EXPORT_BYTES / 1000)} KB
          </span>
        </button>
      ) : (
        <div
          className="rounded-xl border border-border bg-card px-4 py-3"
          data-testid="accounting-export-summary"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileSpreadsheet className="h-4 w-4 text-primary flex-shrink-0" />
                <span
                  className="truncate"
                  data-testid="accounting-export-filename"
                  title={exportData.filename}
                >
                  {exportData.filename}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Uploaded {formatUploadedAt(exportData.uploadedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!confirmRemoveExport ? (
                <>
                  <button
                    type="button"
                    onClick={triggerPicker}
                    disabled={isParsing}
                    className="text-xs font-medium px-2 py-1 rounded-md border border-border hover:bg-muted transition-colors"
                    data-testid="accounting-export-replace-button"
                  >
                    {isParsing ? "Reading…" : "Replace"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveExport(true)}
                    className="text-xs font-semibold text-rose-700 hover:text-rose-800 hover:underline whitespace-nowrap"
                    aria-label={`Remove ${exportData.filename}`}
                    data-testid="accounting-export-remove-button"
                    title="Clear the uploaded export so suggestions revert to your typed-in priors"
                  >
                    Remove uploaded export
                  </button>
                </>
              ) : (
                <>
                  <span
                    className="text-xs text-rose-800 whitespace-nowrap"
                    data-testid="accounting-export-remove-confirm-prompt"
                  >
                    Remove this upload?
                  </span>
                  <button
                    type="button"
                    onClick={removeUpload}
                    className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded px-2 py-1 whitespace-nowrap"
                    data-testid="accounting-export-remove-confirm"
                  >
                    Yes, remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveExport(false)}
                    className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap"
                    data-testid="accounting-export-remove-cancel"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {hasAnyTotal ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-border/60">
              <div data-testid="accounting-export-revenue">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Revenue
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {totals?.totalRevenue !== undefined ? fmtMoney(totals.totalRevenue) : "—"}
                </p>
              </div>
              <div data-testid="accounting-export-expenses">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Expenses
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {totals?.totalExpenses !== undefined ? fmtMoney(totals.totalExpenses) : "—"}
                </p>
              </div>
              <div data-testid="accounting-export-net">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Net income
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {totals?.netIncome !== undefined ? fmtMoney(totals.netIncome) : "—"}
                </p>
              </div>
            </div>
          ) : (
            <p
              className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2"
              data-testid="accounting-export-no-totals"
            >
              We couldn't read any totals from that file — try re-exporting as a Profit &amp; Loss summary.
            </p>
          )}

          {categoryChips.length > 0 && (
            // Curated category subtotals row — sits beneath the headline
            // revenue / expenses / net income block so the founder can see
            // exactly which sub-rows we recognized (Tuition $480k,
            // Donations $95k, Payroll $320k, Rent $55k). These chips are
            // also what the actuals editor surfaces as contributing
            // accounts, so the wizard view doubles as a preview of the
            // breakdown the founder will see on the saved-scenario page.
            <div
              className="mt-2 pt-2 border-t border-border/60"
              data-testid="accounting-export-categories"
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Category breakdown
              </p>
              <div className="flex flex-wrap gap-1.5">
                {categoryChips.map((chip) => (
                  <span
                    key={chip.testid}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
                    data-testid={chip.testid}
                  >
                    <span className="text-muted-foreground">{chip.label}</span>
                    <span className="font-semibold">{fmtMoney(chip.value)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {exportData.parseWarnings && exportData.parseWarnings.length > 0 && (
            <ul
              className="mt-2 pt-2 border-t border-border/60 text-xs text-amber-800 space-y-0.5"
              data-testid="accounting-export-warnings"
            >
              {exportData.parseWarnings.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
          {showCoach && (() => {
            // Post-upload coach line — tell the founder *which* account
            // categories we recognized (revenue / expenses / net income)
            // and explicitly cue them to map accounts in the next step.
            // The parser today only emits category-level totals, so we
            // count the categories present rather than per-account rows;
            // the explicit "next step" cue is what the CR asked for.
            const totals = exportData.totals ?? {};
            const recognized = exportData.recognizedRowCount ?? 0;
            const haveRevenue = typeof totals.totalRevenue === "number";
            const haveExpenses = typeof totals.totalExpenses === "number";
            const haveNet = typeof totals.netIncome === "number";
            const found: string[] = [];
            if (haveRevenue) found.push("a revenue total");
            if (haveExpenses) found.push("an expenses total");
            if (haveNet) found.push("a net income line");
            const foundList =
              found.length === 0
                ? ""
                : found.length === 1
                ? found[0]
                : found.length === 2
                ? `${found[0]} and ${found[1]}`
                : `${found[0]}, ${found[1]}, and ${found[2]}`;
            return (
              <div
                className="mt-2 pt-2 border-t border-border/60 flex items-start gap-2 text-[11px] text-amber-900 leading-snug"
                data-testid="accounting-export-post-upload-coach"
              >
                <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-700" />
                <p>
                  <span className="font-semibold">Coach:</span>{" "}
                  {recognized > 0 ? (
                    <>
                      we recognized {foundList} in this export ({recognized}{" "}
                      account {recognized === 1 ? "category" : "categories"}{" "}
                      detected). The next step in this wizard is where you
                      map each account to a budget bucket — line up rent,
                      payroll, and tuition there so future syncs can keep
                      your model honest.
                    </>
                  ) : (
                    <>
                      we couldn't recognize any account totals in this file,
                      so there's nothing to map yet. Re-export your{" "}
                      <GlossaryTerm termKey="pl_statement">P&amp;L</GlossaryTerm>
                      {" "}as a detailed report (not a summary) so the next
                      step has real accounts to map into your budget.
                    </>
                  )}
                </p>
              </div>
            );
          })()}
        </div>
      )}
      {error && (
        <p
          className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1"
          data-testid="accounting-export-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function SchoolProfileStep({ focus }: { focus?: string } = {}) {
  const { watch, setValue, getValues } = useFormContext();
  const { user } = useAuth();
  // Task #302: persona-stage gating overrides model.schoolStage. A founder
  // who picked `yet_to_launch` should never see prior-year actuals,
  // QuickBooks/Xero callouts, or any "import last year's books" surfaces —
  // even if a legacy model on their account was saved with
  // `schoolStage = "operating_school"`. We compute this once here and use
  // it everywhere the schoolStage gate previously stood alone.
  const yetToLaunch = personaIsYetToLaunch(user);
  const isOperatingSchool = !yetToLaunch && watch("schoolProfile.schoolStage") === "operating_school";
  const isPartialFirstYear = watch("schoolProfile.isPartialFirstYear");
  const schoolStage = watch("schoolProfile.schoolStage");
  // If a yet_to_launch founder opens a legacy model that was saved with
  // `schoolStage = "operating_school"`, force it back to `"new_school"` so
  // every downstream calc treats them as pre-opening. This runs once per
  // mount and only when the persona + saved stage are out of sync.
  useEffect(() => {
    if (yetToLaunch && schoolStage === "operating_school") {
      setValue("schoolProfile.schoolStage", "new_school", { shouldDirty: true });
    }
  }, [yetToLaunch, schoolStage, setValue]);
  const operatingYear = watch("schoolProfile.operatingYear");
  const schoolType = watch("schoolProfile.schoolType");
  const entityType = watch("schoolProfile.entityType");
  const isAccredited = watch("schoolProfile.isAccredited");
  const lendingLabIntent = watch("schoolProfile.lendingLabIntent");
  const currentStudents = watch("schoolProfile.currentStudents");

  const locationSecured = watch("schoolProfile.locationSecured");
  const ownershipType = watch("schoolProfile.ownershipType");
  const isNNNLease = watch("schoolProfile.isNNNLease");
  const hasMortgage = watch("schoolProfile.hasMortgage");
  const estimatedFacilityBudget = watch("schoolProfile.estimatedMonthlyFacilityBudget");
  const comparableMarketRent = watch("schoolProfile.comparableMarketRent");
  const monthlyFacilityAllocation = watch("schoolProfile.monthlyFacilityAllocation");
  const monthlyRent = watch("schoolProfile.monthlyRent");
  const annualRentEscalation = watch("schoolProfile.annualRentEscalation");
  const postLeaseRenewalBump = watch("schoolProfile.postLeaseRenewalBump");
  const leaseExpirationYear = watch("schoolProfile.leaseExpirationYear");
  const leaseExpirationMonth = watch("schoolProfile.leaseExpirationMonth");
  const nnnCamCharges = watch("schoolProfile.nnnCamCharges");
  const nnnMaintenance = watch("schoolProfile.nnnMaintenance");
  const nnnUtilities = watch("schoolProfile.nnnUtilities");
  const propertyTaxAnnual = watch("schoolProfile.propertyTaxAnnual");
  const mortgageMonthlyPayment = watch("schoolProfile.mortgageMonthlyPayment");
  const facilityArrangementEndDate = watch("schoolProfile.facilityArrangementEndDate");
  const hasWrittenAgreement = watch("schoolProfile.hasWrittenAgreement");
  const facilityPhases = watch("schoolProfile.facilityPhases") as Array<{ id: string; ownershipType: string; startYear: number; endYear: number; [key: string]: unknown }> | undefined;
  const forProfit = isForProfit(entityType);

  const isCharter = schoolType === "charter_school";
  const isPrivate = schoolType === "private_school";
  const isCatholic = schoolType === "catholic_school";

  const isDiocesan = watch("schoolProfile.isDiocesan") as boolean | undefined;
  const isFaithAffiliated = watch("schoolProfile.isFaithAffiliated") as boolean | undefined;
  const congregationSupport = watch("schoolProfile.congregationSupport") as boolean | undefined;
  const congregationAssessment = watch("schoolProfile.congregationAssessment") as boolean | undefined;
  const doesFundraise = watch("schoolProfile.doesFundraise") as boolean | undefined;
  const hasFiscalSponsor = watch("schoolProfile.hasFiscalSponsor") as boolean | undefined;
  const fiscalSponsorInterest = watch("schoolProfile.fiscalSponsorInterest") as boolean | undefined;
  const accountingBasis = watch("schoolProfile.accountingBasis") as string | undefined;

  const allowedEntityTypes = useMemo(() => {
    const all = Object.entries(ENTITY_TYPE_LABELS);
    if (isCharter || isPrivate || isCatholic || schoolType === "homeschool_coop") {
      return all.filter(([v]) => v !== "sole_practitioner");
    }
    return all;
  }, [schoolType, isCharter, isPrivate, isCatholic]);

  useEffect(() => {
    if (!schoolType || !entityType) return;
    const allowed = allowedEntityTypes.map(([v]) => v);
    if (!allowed.includes(entityType)) {
      setValue("schoolProfile.entityType", undefined);
    }
  }, [schoolType, entityType, allowedEntityTypes, setValue]);

  useEffect(() => {
    if (isCharter && (lendingLabIntent === "plan_to_apply" || lendingLabIntent === "want_to_understand")) {
      setValue("schoolProfile.lendingLabIntent", "budget_only", { shouldDirty: true });
    }
  }, [isCharter, lendingLabIntent, setValue]);

  const prevSchoolType = useRef(schoolType);
  useEffect(() => {
    if (prevSchoolType.current === schoolType) return;
    prevSchoolType.current = schoolType;
    if (!isCatholic) {
      setValue("schoolProfile.isDiocesan", false, { shouldDirty: true });
    }
    if (isCatholic || !isPrivate) {
      setValue("schoolProfile.isFaithAffiliated", false, { shouldDirty: true });
      setValue("schoolProfile.congregationSupport", false, { shouldDirty: true });
      setValue("schoolProfile.congregationAssessment", false, { shouldDirty: true });
    }
    // Chesterton Academy: seed the chesterton namespace with the CSN
    // Operating Manual defaults (planning year, $8,500 starting tuition,
    // 4% tuition growth, $44k starting teacher salary, gift chart pyramid,
    // recruiting pipeline scaffolding) the first time the founder picks
    // this school type. We only seed if the chesterton block is empty so
    // toggling away and back doesn't clobber in-progress edits.
    if (isChestertonAcademy(schoolType)) {
      const existing = getValues("chesterton") as Record<string, unknown> | undefined;
      if (!existing || Object.keys(existing).length === 0) {
        setValue("chesterton", buildDefaultChestertonData(), { shouldDirty: true });
      }
    }
  }, [schoolType, isCatholic, isPrivate, setValue, getValues]);

  const prevEntityType = useRef(entityType);
  useEffect(() => {
    if (prevEntityType.current === entityType) return;
    prevEntityType.current = entityType;
    if (!isForProfit(entityType)) {
      setValue("schoolProfile.hasFiscalSponsor", false, { shouldDirty: true });
      setValue("schoolProfile.fiscalSponsorName", "", { shouldDirty: true });
      setValue("schoolProfile.fiscalSponsorInterest", false, { shouldDirty: true });
    }
  }, [entityType, setValue]);

  const legacyEnrollmentMigrated = useRef(false);
  const currentYearEnrollmentLegacy = watch("currentYearProjection.currentEnrollment");
  useEffect(() => {
    if (legacyEnrollmentMigrated.current) return;
    if (schoolStage === "operating_school" && operatingYear === "first_year") {
      if (currentStudents === undefined && currentYearEnrollmentLegacy && currentYearEnrollmentLegacy > 0) {
        setValue("schoolProfile.currentStudents", currentYearEnrollmentLegacy, { shouldDirty: true });
        legacyEnrollmentMigrated.current = true;
      }
    }
  }, [schoolStage, operatingYear, currentStudents, currentYearEnrollmentLegacy, setValue]);

  useEffect(() => {
    if (schoolStage === "operating_school" && operatingYear === "first_year" && currentStudents != null) {
      setValue("currentYearProjection.currentEnrollment", currentStudents, { shouldDirty: true });
    }
  }, [schoolStage, operatingYear, currentStudents, setValue]);

  const prevLocationSecured = useRef(locationSecured);
  useEffect(() => {
    if (prevLocationSecured.current && !locationSecured) {
      setValue("schoolProfile.ownershipType", undefined, { shouldDirty: true });
      setValue("schoolProfile.facilityStreet", "", { shouldDirty: true });
      setValue("schoolProfile.facilityCity", "", { shouldDirty: true });
      setValue("schoolProfile.facilityState", "", { shouldDirty: true });
      setValue("schoolProfile.facilityZip", "", { shouldDirty: true });
      setValue("schoolProfile.monthlyRent", 0, { shouldDirty: true });
      setValue("schoolProfile.isNNNLease", false, { shouldDirty: true });
      setValue("schoolProfile.hasMortgage", false, { shouldDirty: true });
    }
    if (!prevLocationSecured.current && locationSecured) {
      setValue("schoolProfile.estimatedMonthlyFacilityBudget", 0, { shouldDirty: true });
    }
    prevLocationSecured.current = locationSecured;
  }, [locationSecured, setValue]);

  const schoolState = watch("schoolProfile.state");
  const facilityState = watch("schoolProfile.facilityState");
  useEffect(() => {
    if (locationSecured && schoolState && !facilityState) {
      setValue("schoolProfile.facilityState", schoolState, { shouldDirty: true });
    }
  }, [locationSecured, schoolState, facilityState, setValue]);

  useEffect(() => {
    if (!facilityPhases || facilityPhases.length !== 1) return;
    if (!ownershipType) return;
    const phase = facilityPhases[0];
    const safeNum = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v)) ? v : fallback;
    const updated = {
      ...phase,
      ownershipType,
      monthlyRent: safeNum(monthlyRent, 0),
      annualRentEscalation: safeNum(annualRentEscalation, 3),
      postLeaseRenewalBump: safeNum(postLeaseRenewalBump, 15),
      leaseExpirationYear,
      leaseExpirationMonth,
      isNNNLease: isNNNLease ?? false,
      nnnCamCharges: safeNum(nnnCamCharges, 0),
      nnnMaintenance: safeNum(nnnMaintenance, 0),
      nnnUtilities: safeNum(nnnUtilities, 0),
      propertyTaxAnnual: safeNum(propertyTaxAnnual, 0),
      hasMortgage: hasMortgage ?? false,
      mortgageMonthlyPayment: safeNum(mortgageMonthlyPayment, 0),
      facilityArrangementEndDate,
      comparableMarketRent: safeNum(comparableMarketRent, 0),
      hasWrittenAgreement: hasWrittenAgreement ?? false,
      monthlyFacilityAllocation: safeNum(monthlyFacilityAllocation, 0),
      estimatedMonthlyFacilityBudget: safeNum(estimatedFacilityBudget, 0),
    };
    const changed = Object.keys(updated).some(k => !Object.is((updated as Record<string, unknown>)[k], (phase as Record<string, unknown>)[k]));
    if (changed) {
      setValue("schoolProfile.facilityPhases", [updated], { shouldDirty: true });
    }
  }, [ownershipType, monthlyRent, annualRentEscalation, postLeaseRenewalBump, leaseExpirationYear, leaseExpirationMonth, isNNNLease, nnnCamCharges, nnnMaintenance, nnnUtilities, propertyTaxAnnual, hasMortgage, mortgageMonthlyPayment, facilityArrangementEndDate, comparableMarketRent, hasWrittenAgreement, monthlyFacilityAllocation, estimatedFacilityBudget, facilityPhases, setValue]);


  const { formState: { errors } } = useFormContext();
  const stageError = getNestedError(errors, "schoolProfile.schoolStage");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Tell Us About Your School</h2>
        <p className="text-muted-foreground text-lg">We'll tailor everything to your school's type, stage, and structure. There are no wrong answers here - just tell us where you are today, and we'll meet you there.</p>
      </div>

      <WhyThisMatters
        why="Your state, school type, and stage shape every default we recommend — from per-pupil funding bands and salary benchmarks to staffing ratios and rent norms. Getting these right up front means the rest of the wizard is pre-tuned for schools like yours."
        revisit="If your governance changes (for example, you decide to pursue a charter or apply for nonprofit status), come back here first."
      />

      <div>
        <FormInput 
          name="schoolProfile.schoolName" 
          label="What's the name of your school?" 
          placeholder="e.g., Summit Academy"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormSelect
          name="schoolProfile.schoolType"
          label="School Type"
          options={Object.entries(SCHOOL_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        
        {schoolType === "other" && (
          <FormInput
            name="schoolProfile.schoolTypeOther"
            label="Describe Your School Type"
            placeholder="e.g., Montessori Academy"
          />
        )}

        <FormSelect
          name="schoolProfile.state"
          label="State"
          options={STATES}
        />
      </div>

      {yetToLaunch ? (
        // Yet-to-launch founders never see the "are you operating?" radio
        // or any of its operating-school branches. Their persona implies
        // pre-opening, and we ask only for the planned opening year so the
        // wizard can still build a 5-year ramp.
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">When are you planning to open?</h3>
          <div className="max-w-sm">
            <FormSelect
              name="schoolProfile.plannedOpeningYear"
              label="Planned Opening School Year"
              options={[
                { value: "2026-27", label: "2026–27" },
                { value: "2027-28", label: "2027–28" },
                { value: "2028-29", label: "2028–29" },
              ]}
            />
          </div>
        </div>
      ) : (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">What stage is your school?</h3>
          <div className={cn("flex flex-wrap gap-2 rounded-xl", stageError && "ring-2 ring-destructive/50 p-1")}>
            {([
              { value: "new_school" as const, icon: <Rocket className="h-4 w-4" />, label: "New School (Pre-Opening)" },
              { value: "operating_school" as const, icon: <Building2 className="h-4 w-4" />, label: "Already Operating" },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setValue("schoolProfile.schoolStage", opt.value, { shouldDirty: true, shouldValidate: true })}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all",
                  schoolStage === opt.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                )}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          {stageError && (
            <div className="flex items-center gap-2 mt-3 text-destructive" data-error="true">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p className="text-sm font-medium">{stageError}</p>
            </div>
          )}

          {schoolStage === "new_school" && (
            <div className="mt-4 max-w-sm">
              <FormSelect
                name="schoolProfile.plannedOpeningYear"
                label="Planned Opening School Year"
                options={[
                  { value: "2026-27", label: "2026–27" },
                  { value: "2027-28", label: "2027–28" },
                  { value: "2028-29", label: "2028–29" },
                ]}
              />
            </div>
          )}

          {schoolStage === "operating_school" && (
            <div className="mt-4 max-w-sm">
              <FormSelect
                name="schoolProfile.operatingYear"
                label="How long have you been operating?"
                options={[
                  { value: "first_year", label: "This is our first year of operation" },
                  { value: "second_year_plus", label: "We've completed at least one full school year" },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {!isCharter && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary flex-shrink-0" />
            <p className="font-semibold text-foreground">Is this model for a Lending Lab microloan application?</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { value: "plan_to_apply", label: "Yes, I plan to apply" },
              { value: "want_to_understand", label: "Maybe - I want to explore" },
              { value: "budget_only", label: "No, budget only" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setValue("schoolProfile.lendingLabIntent", opt.value, { shouldDirty: true })}
                className={cn(
                  "px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all",
                  lendingLabIntent === opt.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {(lendingLabIntent === "plan_to_apply" || lendingLabIntent === "want_to_understand") && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-start gap-3">
              <Rocket className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-foreground">
                <p>
                  The <a href="https://www.lendinglab.org" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">Lending Lab <ExternalLink className="h-3 w-3" /></a> provides microloans to schools with fewer than 100 students. Your completed model here will help support your application.
                </p>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground italic">
            This selection tailors your export and next steps - it does not submit a loan application.
          </p>
        </div>
      )}

      <EntityTypeSection
        allowedEntityTypes={allowedEntityTypes}
        entityType={entityType}
        lendingLabIntent={lendingLabIntent}
      />

      {isCatholic && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold border-b border-border pb-2">Catholic School Governance</h3>
          <p className="text-sm text-muted-foreground">Catholic schools can be diocesan, parish-based, or fully independent. This affects your financial structure.</p>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isDiocesan === true}
              onChange={(e) => {
                setValue("schoolProfile.isDiocesan", e.target.checked, { shouldDirty: true });
                if (!e.target.checked) {
                  setValue("schoolProfile.congregationAssessment", false, { shouldDirty: true });
                }
              }}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-0.5"
            />
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground">Is your school affiliated with a diocese?</label>
              <p className="text-xs text-muted-foreground mt-0.5">Diocesan-affiliated schools often receive parish subsidies and pay a diocesan assessment fee. Leave unchecked if your school is independent.</p>
            </div>
          </div>
          {isDiocesan && (
            <div className="ml-7 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-start gap-3">
              <Lightbulb className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-foreground space-y-1">
                <p>We'll add a <span className="font-semibold">Parish / Diocese Subsidy</span> revenue line and a <span className="font-semibold">Diocesan Assessment</span> expense (typically 5–10% of revenue). You can adjust the amounts on the Revenue and Expense steps.</p>
              </div>
            </div>
          )}
          {!isDiocesan && (
            <div className="ml-7 rounded-xl bg-muted/50 border border-border px-4 py-3 flex items-start gap-3">
              <Lightbulb className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">Independent Catholic schools typically rely more heavily on tuition and philanthropy. You can still add fundraising sources below.</p>
            </div>
          )}
        </div>
      )}

      {!isCatholic && isPrivate && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold border-b border-border pb-2">Faith or Organization Affiliation</h3>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isFaithAffiliated === true}
              onChange={(e) => {
                setValue("schoolProfile.isFaithAffiliated", e.target.checked, { shouldDirty: true });
                if (!e.target.checked) {
                  setValue("schoolProfile.congregationSupport", false, { shouldDirty: true });
                  setValue("schoolProfile.congregationAssessment", false, { shouldDirty: true });
                }
              }}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-0.5"
            />
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground">Is your school affiliated with a faith community or sponsoring organization?</label>
              <p className="text-xs text-muted-foreground mt-0.5">Examples: church-sponsored school, synagogue-affiliated program, faith-based academy</p>
            </div>
          </div>
          {isFaithAffiliated && (
            <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 flex items-start gap-3 ml-7 mb-2">
              <Heart className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-teal-800">
                Faith-affiliated schools bring a unique strength: a community already invested in your mission. Your congregation or faith community can be a powerful foundation for enrollment, fundraising, and volunteer support. We'll help you build a budget that honors that partnership.
              </p>
            </div>
          )}
          {isFaithAffiliated && (
            <div className="ml-7 space-y-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={congregationSupport === true}
                  onChange={(e) => setValue("schoolProfile.congregationSupport", e.target.checked, { shouldDirty: true })}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-0.5"
                />
                <div className="flex-1">
                  <label className="text-sm font-medium text-foreground">Does the congregation or organization provide financial support?</label>
                  <p className="text-xs text-muted-foreground mt-0.5">Direct subsidies, below-market rent, or regular contributions</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={congregationAssessment === true}
                  onChange={(e) => setValue("schoolProfile.congregationAssessment", e.target.checked, { shouldDirty: true })}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-0.5"
                />
                <div className="flex-1">
                  <label className="text-sm font-medium text-foreground">Does the organization charge an assessment fee?</label>
                  <p className="text-xs text-muted-foreground mt-0.5">A percentage of revenue paid to the sponsoring organization</p>
                </div>
              </div>
              {(congregationSupport || congregationAssessment) && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-start gap-3">
                  <Lightbulb className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-foreground space-y-1">
                    {congregationSupport && <p>We'll add a <span className="font-semibold">Congregation / Organization Support</span> revenue line.</p>}
                    {congregationAssessment && <p>We'll add a <span className="font-semibold">Congregation / Organization Assessment Fee</span> expense.</p>}
                    <p className="text-xs text-muted-foreground">You can set the exact amounts on the Revenue and Expense steps.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-bold border-b border-border pb-2">Fundraising</h3>
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={doesFundraise === true}
            onChange={(e) => {
              setValue("schoolProfile.doesFundraise", e.target.checked, { shouldDirty: true });
              if (!e.target.checked) {
                setValue("schoolProfile.hasFiscalSponsor", false, { shouldDirty: true });
                setValue("schoolProfile.fiscalSponsorInterest", false, { shouldDirty: true });
              }
            }}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-0.5"
          />
          <div className="flex-1">
            <label className="text-sm font-medium text-foreground">Does your school fundraise or plan to fundraise?</label>
            <p className="text-xs text-muted-foreground mt-0.5">Annual fund, events, individual donations, grant applications</p>
          </div>
        </div>
        {doesFundraise && !isNonprofit(entityType) && entityType !== "undetermined" && entityType && (
          <div className="ml-7 space-y-3">
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900 space-y-1">
                <p className="font-semibold">For-profit schools and tax-deductible donations</p>
                <p>Donors generally cannot take a tax deduction for gifts to a for-profit entity. Many for-profit schools work with a <span className="font-semibold">fiscal sponsor</span> - a 501(c)(3) nonprofit that receives donations on the school's behalf and passes the funds through, minus a fee (typically 5–10% of donations received).</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={hasFiscalSponsor === true}
                onChange={(e) => {
                  setValue("schoolProfile.hasFiscalSponsor", e.target.checked, { shouldDirty: true });
                  if (!e.target.checked) {
                    setValue("schoolProfile.fiscalSponsorName", "", { shouldDirty: true });
                  }
                }}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-0.5"
              />
              <div className="flex-1">
                <label className="text-sm font-medium text-foreground">Do you have a fiscal sponsor?</label>
                <p className="text-xs text-muted-foreground mt-0.5">A 501(c)(3) that receives tax-deductible donations on your behalf</p>
              </div>
            </div>
            {hasFiscalSponsor && (
              <div className="ml-7">
                <FormInput
                  name="schoolProfile.fiscalSponsorName"
                  label="Fiscal Sponsor Name"
                  placeholder="e.g., Community Foundation of Greater Springfield"
                />
                <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 mt-3 flex items-start gap-3">
                  <Lightbulb className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground">We'll add philanthropy revenue lines and a <span className="font-semibold">Fiscal Sponsor Fee</span> expense line. Most sponsors charge 5–10% of the philanthropic revenue they process. Enter your estimated annual fee as a dollar amount on the Expense step.</p>
                </div>
              </div>
            )}
            {!hasFiscalSponsor && (
              <div className="ml-7 space-y-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={fiscalSponsorInterest === true}
                    onChange={(e) => setValue("schoolProfile.fiscalSponsorInterest", e.target.checked, { shouldDirty: true })}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary mt-0.5"
                  />
                  <div className="flex-1">
                    <label className="text-sm font-medium text-foreground">Would you like help finding a fiscal sponsor?</label>
                    <p className="text-xs text-muted-foreground mt-0.5">We can guide you through the process of establishing a fiscal sponsorship</p>
                  </div>
                </div>
                {fiscalSponsorInterest && (
                  <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 flex items-start gap-3">
                    <Lightbulb className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-teal-900 space-y-1">
                      <p>Look for community foundations, education-focused nonprofits, or national fiscal sponsors like the <span className="font-semibold">National Network of Fiscal Sponsors</span>. Most charge 5–10% of funds received. Start the conversation early - approval can take 4–8 weeks.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {doesFundraise && isNonprofit(entityType) && (
          <div className="ml-7 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-start gap-3">
            <Lightbulb className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">As a nonprofit, we'll pre-enable <span className="font-semibold">Annual Fund</span>, <span className="font-semibold">Individual Donations</span>, and <span className="font-semibold">Fundraising Events</span> on the Revenue step. You can adjust or disable any of these.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {schoolStage === "operating_school" && (
          <>
            <FormInput 
              name="schoolProfile.openingYear" 
              label="Year School Opened" 
              type="number"
              placeholder="2020"
            />
            {operatingYear !== "first_year" && (
              <FormInput 
                name="schoolProfile.currentStudents" 
                label="Current Enrollment" 
                type="number"
                placeholder="0"
                helperText="Number of students currently enrolled"
              />
            )}
          </>
        )}

        <FormInput 
          name="schoolProfile.maxCapacity" 
          label="Maximum Facility Capacity" 
          type="number"
          placeholder="150"
          helperText="Max students your building can hold"
          className={schoolStage === "new_school" ? "" : "md:col-span-2"}
        />
      </div>

      <div>
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" /> Facility & Location
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Your facility situation affects how we project expenses - especially rent escalation, lease renewals, and property costs.
        </p>

        <div className="space-y-5">
          <FormCheckbox
            name="schoolProfile.locationSecured"
            label="I have a location secured (signed lease or owned property)"
            helperText="If not, we'll ask for an estimate so your model still works"
          />

          {!locationSecured && (
            <div className="rounded-2xl border border-border bg-secondary/30 p-5 space-y-4">
              <div className="flex items-start gap-3">
                <HelpCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm text-foreground">
                  <span className="font-semibold">No worries - an estimate is fine.</span>{" "}
                  {schoolType && FACILITY_BENCHMARKS[schoolType]
                    ? `Most ${SCHOOL_TYPE_LABELS[schoolType]?.toLowerCase() || "school"}s budget around ${FACILITY_BENCHMARKS[schoolType]} for facility costs.`
                    : "Most small schools budget $2,000–$8,000/month for facility costs."}
                </div>
              </div>
              <FormInput
                name="schoolProfile.estimatedMonthlyFacilityBudget"
                label="Estimated Monthly Facility Budget"
                type="number"
                prefix="$"
                placeholder="3000"
                helperText="Your best guess for monthly rent + utilities. We'll flag this as an estimate in your model."
              />
              {estimatedFacilityBudget === 0 && (
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    A $0 facility budget means your model assumes free space indefinitely. That's rare - most programs have some facility cost, even if it's modest. Consider what you'd pay if your current arrangement changed.
                  </p>
                </div>
              )}
            </div>
          )}

          {locationSecured && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <FormInput
                    name="schoolProfile.facilityStreet"
                    label="Street Address"
                    placeholder="123 Main St"
                  />
                </div>
                <FormInput
                  name="schoolProfile.facilityCity"
                  label="City"
                  placeholder="Springfield"
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormSelect
                    name="schoolProfile.facilityState"
                    label="State"
                    options={STATES}
                  />
                  <FormInput
                    name="schoolProfile.facilityZip"
                    label="ZIP Code"
                    placeholder="62701"
                  />
                </div>
              </div>

              {(!facilityPhases || facilityPhases.length <= 1) && (
              <div>
                <h4 className="text-sm font-bold text-foreground mb-3">What's your facility arrangement?</h4>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: "own" as const, icon: <Home className="h-4 w-4" />, label: "We own our space" },
                    { value: "rent" as const, icon: <Key className="h-4 w-4" />, label: "We rent / lease" },
                    { value: "donated" as const, icon: <Gift className="h-4 w-4" />, label: "Donated or no-cost space" },
                    { value: "home_based" as const, icon: <Sprout className="h-4 w-4" />, label: "Home-based program" },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setValue("schoolProfile.ownershipType", opt.value, { shouldDirty: true })}
                      className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all",
                        ownershipType === opt.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {ownershipType === "own" && (!facilityPhases || facilityPhases.length <= 1) && (
                <div className="rounded-2xl border border-border bg-secondary/30 p-5 space-y-4">
                  {forProfit && (
                    <FormInput
                      name="schoolProfile.propertyTaxAnnual"
                      label="Annual Property Tax"
                      type="number"
                      prefix="$"
                      placeholder="5000"
                      helperText="As a for-profit entity, property tax will be added to your expenses automatically"
                    />
                  )}
                  <FormCheckbox
                    name="schoolProfile.hasMortgage"
                    label="We have a mortgage on this property"
                  />
                  {hasMortgage && (
                    <FormInput
                      name="schoolProfile.mortgageMonthlyPayment"
                      label="Monthly Mortgage Payment"
                      type="number"
                      prefix="$"
                      placeholder="2500"
                    />
                  )}
                  {!forProfit && !hasMortgage && (
                    <p className="text-sm text-muted-foreground italic">
                      Great - owning your space with no mortgage means lower facility costs in your model.
                    </p>
                  )}
                </div>
              )}

              {ownershipType === "rent" && (!facilityPhases || facilityPhases.length <= 1) && (
                <div className="rounded-2xl border border-border bg-secondary/30 p-5 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput
                      name="schoolProfile.monthlyRent"
                      label="Monthly Rent"
                      type="number"
                      prefix="$"
                      placeholder="5000"
                    />
                    <FormInput
                      name="schoolProfile.annualRentEscalation"
                      label="Annual Rent Escalation %"
                      type="number"
                      placeholder="3"
                      helperText="Typical: 2–5% per year"
                    />
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-3">When does your lease expire?</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      This matters - for years beyond your lease, we'll model a conservative rent increase to reflect renewal risk.
                    </p>
                    <div className="grid grid-cols-2 gap-4 max-w-sm">
                      <FormSelect
                        name="schoolProfile.leaseExpirationMonth"
                        label="Month"
                        options={MONTHS}
                        valueAsNumber
                      />
                      <FormSelect
                        name="schoolProfile.leaseExpirationYear"
                        label="Year"
                        options={LEASE_EXPIRATION_YEARS}
                        valueAsNumber
                      />
                    </div>
                  </div>

                  <FormInput
                    name="schoolProfile.postLeaseRenewalBump"
                    label="Post-Lease Renewal Rent Increase %"
                    type="number"
                    placeholder="15"
                    helperText="When your lease expires, how much higher might rent be? Default 15% reflects market renewal risk."
                  />

                  <div className="border-t border-border pt-4">
                    <FormCheckbox
                      name="schoolProfile.isNNNLease"
                      label={<>This is a <GlossaryTerm termKey="nnn">Triple Net (NNN)</GlossaryTerm> lease</>}
                      helperText="NNN leases mean you're responsible for property taxes, maintenance, and utilities on top of base rent"
                    />
                  </div>

                  {isNNNLease && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ml-0">
                      <FormInput
                        name="schoolProfile.nnnCamCharges"
                        label="Monthly CAM Charges"
                        type="number"
                        prefix="$"
                        placeholder="500"
                        helperText="Common area maintenance"
                      />
                      <FormInput
                        name="schoolProfile.nnnMaintenance"
                        label="Monthly Maintenance"
                        type="number"
                        prefix="$"
                        placeholder="300"
                        helperText="Repairs & upkeep"
                      />
                      <FormInput
                        name="schoolProfile.nnnUtilities"
                        label="Monthly Utilities"
                        type="number"
                        prefix="$"
                        placeholder="400"
                        helperText="Electric, water, gas"
                      />
                    </div>
                  )}
                </div>
              )}

              {ownershipType === "donated" && (!facilityPhases || facilityPhases.length <= 1) && (
                <div className="rounded-2xl border border-border bg-secondary/30 p-5 space-y-5">
                  <div className="flex items-start gap-3">
                    <Gift className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-foreground">
                      <span className="font-semibold">That's a great start.</span> Let's make sure your plan accounts for what happens when this arrangement changes - being prepared is what separates thriving programs from vulnerable ones.
                    </div>
                  </div>

                  <FormCheckbox
                    name="schoolProfile.hasWrittenAgreement"
                    label="We have a written agreement for this space"
                    helperText="Even informal arrangements benefit from a simple written agreement. It protects both parties and shows you've thought through the details."
                  />

                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-2">When does this arrangement end?</h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      If there's no set end date, that's okay - but it's smart to plan for what rent would cost if things change.
                    </p>
                    <FormInput
                      name="schoolProfile.facilityArrangementEndDate"
                      label="Arrangement End Date"
                      type="month"
                      helperText="Leave blank if the arrangement is indefinite"
                    />
                  </div>

                  <div>
                    <FormInput
                      name="schoolProfile.comparableMarketRent"
                      label="What would comparable rent cost for this space?"
                      type="number"
                      prefix="$"
                      placeholder="3000"
                      helperText={schoolType && FACILITY_BENCHMARKS[schoolType]
                        ? `Look up similar spaces in your area. Most ${SCHOOL_TYPE_LABELS[schoolType]?.toLowerCase() || "school"}s pay around ${FACILITY_BENCHMARKS[schoolType]}.`
                        : "Look up similar spaces in your area. This helps your model show what it would take to sustain the school independently."}
                    />
                    {(!comparableMarketRent || comparableMarketRent === 0) && (
                      <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          Leaving this at $0 means your model won't show what rent would cost if this arrangement ends. Adding a realistic estimate - even a rough one - makes your plan stronger and helps you prepare.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {ownershipType === "home_based" && (!facilityPhases || facilityPhases.length <= 1) && (
                <div className="rounded-2xl border border-border bg-secondary/30 p-5 space-y-5">
                  <div className="flex items-start gap-3">
                    <Sprout className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-foreground">
                      <span className="font-semibold">Running from home keeps costs low</span> - but there are still real costs to account for. Being honest about them now means fewer surprises later.
                    </div>
                  </div>

                  <div>
                    <FormInput
                      name="schoolProfile.monthlyFacilityAllocation"
                      label="Monthly Facility Allocation"
                      type="number"
                      prefix="$"
                      placeholder="500"
                      helperText={schoolType && FACILITY_BENCHMARKS[schoolType]
                        ? `Think about your share of mortgage/rent, utilities, insurance, internet, and wear-and-tear. Most ${SCHOOL_TYPE_LABELS[schoolType]?.toLowerCase() || "school"}s budget around ${FACILITY_BENCHMARKS[schoolType]}, even when home-based.`
                        : "Think about your share of mortgage/rent, utilities, insurance, internet, and wear-and-tear on the space. Even a modest allocation makes your budget more realistic."}
                    />
                    {(!monthlyFacilityAllocation || monthlyFacilityAllocation === 0) && (
                      <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          A $0 facility allocation means your model won't capture real costs like utilities, internet, or space wear-and-tear. Even $200–$500/mo makes your budget more realistic and complete.
                        </p>
                      </div>
                    )}
                  </div>

                  <FormCheckbox
                    name="schoolProfile.hasWrittenAgreement"
                    label="We have a written use agreement for this space"
                    helperText="A simple agreement - even with yourself - clarifies what space is dedicated to the program and protects you if questions arise."
                  />
                </div>
              )}

              {ownershipType && (!facilityPhases || facilityPhases.length <= 1) && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const existingPhase = facilityPhases?.[0];
                      const currentPhase: Record<string, unknown> = existingPhase ? {
                        ...existingPhase,
                        endYear: 3,
                      } : {
                        id: `phase-${Date.now()}-1`,
                        ownershipType: ownershipType,
                        startYear: 1,
                        endYear: 3,
                        monthlyRent: watch("schoolProfile.monthlyRent") ?? 0,
                        annualRentEscalation: watch("schoolProfile.annualRentEscalation") ?? 3,
                        postLeaseRenewalBump: watch("schoolProfile.postLeaseRenewalBump") ?? 15,
                        leaseExpirationYear: watch("schoolProfile.leaseExpirationYear"),
                        leaseExpirationMonth: watch("schoolProfile.leaseExpirationMonth"),
                        isNNNLease: watch("schoolProfile.isNNNLease") ?? false,
                        nnnCamCharges: watch("schoolProfile.nnnCamCharges") ?? 0,
                        nnnMaintenance: watch("schoolProfile.nnnMaintenance") ?? 0,
                        nnnUtilities: watch("schoolProfile.nnnUtilities") ?? 0,
                        propertyTaxAnnual: watch("schoolProfile.propertyTaxAnnual") ?? 0,
                        hasMortgage: watch("schoolProfile.hasMortgage") ?? false,
                        mortgageMonthlyPayment: watch("schoolProfile.mortgageMonthlyPayment") ?? 0,
                        facilityArrangementEndDate: watch("schoolProfile.facilityArrangementEndDate"),
                        comparableMarketRent: watch("schoolProfile.comparableMarketRent") ?? 0,
                        hasWrittenAgreement: watch("schoolProfile.hasWrittenAgreement") ?? false,
                        monthlyFacilityAllocation: watch("schoolProfile.monthlyFacilityAllocation") ?? 0,
                      };
                      const newPhase = {
                        id: `phase-${Date.now()}-2`,
                        ownershipType: "rent",
                        startYear: 4,
                        endYear: 5,
                        monthlyRent: 0,
                        annualRentEscalation: 3,
                        postLeaseRenewalBump: 15,
                        isNNNLease: false,
                        nnnCamCharges: 0,
                        nnnMaintenance: 0,
                        nnnUtilities: 0,
                        propertyTaxAnnual: 0,
                        hasMortgage: false,
                        mortgageMonthlyPayment: 0,
                        comparableMarketRent: 0,
                        hasWrittenAgreement: false,
                        monthlyFacilityAllocation: 0,
                      };
                      setValue("schoolProfile.facilityPhases", [currentPhase, newPhase], { shouldDirty: true });
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary border border-primary/30 rounded-xl hover:bg-primary/5 transition-colors"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Plan a facility transition
                  </button>
                  <p className="text-xs text-muted-foreground mt-1">
                    Many schools evolve their space over 5 years - home-based to donated, donated to lease, lease to own. Add a transition to model that journey.
                  </p>
                </div>
              )}

              {facilityPhases && facilityPhases.length > 1 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-foreground">Facility Timeline</h4>
                    <button
                      type="button"
                      onClick={() => {
                        const first = facilityPhases[0];
                        setValue("schoolProfile.facilityPhases", [{ ...first, startYear: 1, endYear: 5 }], { shouldDirty: true });
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Use single arrangement
                    </button>
                  </div>

                  <div className="flex items-center gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map(yr => {
                      const phase = facilityPhases.find(p => yr >= p.startYear && yr <= p.endYear);
                      const color = phase ? ({
                        own: "bg-emerald-500",
                        rent: "bg-blue-500",
                        donated: "bg-amber-500",
                        home_based: "bg-violet-500",
                      } as Record<string, string>)[phase.ownershipType] || "bg-gray-400" : "bg-gray-200";
                      return (
                        <div key={yr} className="flex-1 flex flex-col items-center gap-1">
                          <div className={cn("h-2 w-full rounded-full", color)} />
                          <span className="text-[10px] text-muted-foreground">Y{yr}</span>
                        </div>
                      );
                    })}
                  </div>

                  {(() => {
                    const covered = new Set<number>();
                    facilityPhases.forEach(p => {
                      for (let y = p.startYear; y <= p.endYear; y++) covered.add(y);
                    });
                    const gaps = [1, 2, 3, 4, 5].filter(y => !covered.has(y));
                    if (gaps.length === 0) return null;
                    const label = gaps.length === 1 ? `Year ${gaps[0]} is` : `Years ${gaps.join(", ")} are`;
                    return (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800">
                          {label} not covered by any phase. Facility costs will be $0 for uncovered years. Adjust your phase ranges or add another phase to fill the gap.
                        </p>
                      </div>
                    );
                  })()}

                  {facilityPhases.map((phase, idx) => (
                    <FacilityPhaseCard
                      key={phase.id}
                      index={idx}
                      phase={phase}
                      schoolType={schoolType}
                      entityType={entityType}
                      onRemove={() => {
                        const updated = facilityPhases.filter((_, i) => i !== idx);
                        if (updated.length > 0) {
                          updated[updated.length - 1] = { ...updated[updated.length - 1], endYear: 5 };
                        }
                        setValue("schoolProfile.facilityPhases", updated.length > 0 ? updated : undefined, { shouldDirty: true });
                      }}
                      onUpdate={(field, value) => {
                        let updated = facilityPhases.map((p, i) => i === idx ? { ...p, [field]: value } : p);
                        if (field === "endYear" && typeof value === "number" && idx < updated.length - 1) {
                          const next = updated[idx + 1];
                          if (next.startYear <= value) {
                            const newNextStart = value + 1;
                            if (newNextStart > 5) {
                              const clampedEnd = next.startYear - 1;
                              updated = updated.map((p, i) => i === idx ? { ...p, endYear: Math.max(clampedEnd, p.startYear) } : p);
                            } else {
                              updated = updated.map((p, i) => i === idx + 1 ? { ...p, startYear: newNextStart } : p);
                            }
                          }
                        }
                        if (field === "startYear" && typeof value === "number" && idx > 0) {
                          const prev = updated[idx - 1];
                          if (prev.endYear >= value) {
                            const newPrevEnd = value - 1;
                            if (newPrevEnd < 1) {
                              const clampedStart = prev.endYear + 1;
                              updated = updated.map((p, i) => i === idx ? { ...p, startYear: Math.min(clampedStart, p.endYear) } : p);
                            } else {
                              updated = updated.map((p, i) => i === idx - 1 ? { ...p, endYear: newPrevEnd } : p);
                            }
                          }
                        }
                        setValue("schoolProfile.facilityPhases", updated, { shouldDirty: true });
                      }}
                    />
                  ))}

                  {facilityPhases.length < 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        const lastPhase = facilityPhases[facilityPhases.length - 1];
                        const newStart = Math.min((lastPhase?.endYear || 0) + 1, 5);
                        if (newStart > 5) return;
                        const updated = facilityPhases.map((p, i) =>
                          i === facilityPhases.length - 1 ? { ...p, endYear: Math.max(p.startYear, newStart - 1) } : p
                        );
                        updated.push({
                          id: `phase-${Date.now()}`,
                          ownershipType: "rent",
                          startYear: newStart,
                          endYear: 5,
                          monthlyRent: 0,
                          annualRentEscalation: 3,
                          postLeaseRenewalBump: 15,
                          isNNNLease: false,
                          nnnCamCharges: 0,
                          nnnMaintenance: 0,
                          nnnUtilities: 0,
                          propertyTaxAnnual: 0,
                          hasMortgage: false,
                          mortgageMonthlyPayment: 0,
                          comparableMarketRent: 0,
                          hasWrittenAgreement: false,
                          monthlyFacilityAllocation: 0,
                        });
                        setValue("schoolProfile.facilityPhases", updated, { shouldDirty: true });
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-primary border border-dashed border-primary/30 rounded-xl hover:bg-primary/5 transition-colors w-full justify-center"
                    >
                      + Add another transition
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isPrivate && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Accreditation</h3>
          <div className="space-y-4">
            <FormCheckbox
              name="schoolProfile.isAccredited"
              label="Is your school accredited?"
              helperText="Accreditation status can be important for financial planning and compliance"
            />
            {isAccredited && (
              <div className="max-w-md">
                <FormInput
                  name="schoolProfile.accreditingBody"
                  label="Accrediting Body"
                  placeholder="e.g., SACS, NAIS, AdvancED"
                  helperText="Name of the accrediting organization"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Fiscal Year</h3>
        <div className="rounded-xl bg-teal-50/60 border border-teal-200/60 px-4 py-3 mb-4 flex items-start gap-2.5">
          <Lightbulb className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-teal-800">Most schools use July as their fiscal year start - it aligns with the school calendar. If you're not sure, July is a safe choice.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormSelect
            name="schoolProfile.fiscalYearStartMonth"
            label="Fiscal Year Start Month"
            options={MONTHS}
            valueAsNumber
            helperText="Most schools use July (Jul-Jun fiscal year)"
          />

          <div className="flex flex-col gap-4 justify-center">
            <FormCheckbox
              name="schoolProfile.isPartialFirstYear"
              label="Year 1 is a partial year"
              helperText="Check if your school opens mid-fiscal-year"
            />
          </div>

          {isPartialFirstYear && (
            <FormInput
              name="schoolProfile.year1OperatingMonths"
              label="Year 1 Operating Months"
              type="number"
              placeholder="10"
              helperText="Number of months the school operates in Year 1"
            />
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold border-b border-border pb-2 mb-4 flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" /> Accounting Basis
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          How do you currently keep your books? This helps us label your exports accurately. Your projections will work exactly the same regardless of your answer.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {([
            { value: "cash", label: "Cash Basis", desc: "I record income when received and expenses when paid" },
            { value: "accrual", label: "Accrual Basis", desc: "I record income when earned and expenses when incurred" },
            { value: "not_sure", label: "Not sure yet", desc: "I haven't decided or I'm not sure what we use" },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setValue("schoolProfile.accountingBasis", opt.value, { shouldDirty: true })}
              className={cn(
                "flex flex-col items-start gap-1 p-4 rounded-xl border-2 text-left transition-all",
                accountingBasis === opt.value
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/40"
              )}
            >
              <span className={cn("text-sm font-semibold", accountingBasis === opt.value ? "text-primary" : "text-foreground")}>{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
        </div>

        {accountingBasis && (
          <div className="rounded-xl bg-teal-50/60 border border-teal-200/60 px-4 py-3 flex items-start gap-2.5">
            <Lightbulb className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-teal-800">
              <span className="font-semibold">Why we always model on an accrual basis:</span> Accrual accounting shows when revenue is earned and costs are committed - not just when cash moves. This gives your board, authorizer, or any reviewer the most complete picture of your school's financial health. Your day-to-day bookkeeping method is a separate choice.
              {accountingBasis === "not_sure" && (
                <span className="block mt-2"><span className="font-semibold">What's the difference?</span> With <em>cash basis</em>, you record income when money hits your bank account and expenses when you write the check. With <em>accrual basis</em>, you record income when it's earned (e.g., when a student enrolls) and expenses when they're committed (e.g., when you sign a contract). Most lenders, boards, and authorizers prefer accrual because it paints a fuller picture - and that's what we use here. You can always update this later once you've chosen a bookkeeping method.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {isOperatingSchool && (
        <AccountingExportUploader focused={focus === "accounting-export"} />
      )}

      {isOperatingSchool && operatingYear === "first_year" && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Current Year Projections</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Knowing where you stand right now helps us build projections grounded in reality - not just hope. Be honest here; it makes the whole model stronger.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput
              name="schoolProfile.currentStudents"
              label="Current Enrollment"
              type="number"
              placeholder="0"
              helperText="Students currently enrolled"
            />
            <FormInput
              name="currentYearProjection.monthsCompleted"
              label="Months of Operation Completed"
              type="number"
              placeholder="8"
              helperText="How many months have you been open?"
            />
            <FormInput
              name="currentYearProjection.projectedRevenue"
              label="Projected End-of-Year Revenue"
              type="number"
              prefix="$"
              placeholder="0"
              helperText="Your best estimate for total revenue this school year"
            />
            <FormInput
              name="currentYearProjection.projectedExpenses"
              label="Projected End-of-Year Expenses"
              type="number"
              prefix="$"
              placeholder="0"
              helperText="Your best estimate for total expenses this school year"
            />
            <FormInput
              name="currentYearProjection.currentCash"
              label="Current Cash on Hand"
              type="number"
              prefix="$"
              placeholder="0"
            />
          </div>
        </div>
      )}

      {isOperatingSchool && operatingYear === "second_year_plus" && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Prior-Year Actuals</h3>
          {lendingLabIntent === "plan_to_apply" && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3 mb-4">
              <Rocket className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">Reviewers compare your projections against actual performance. Providing last year's numbers strengthens your model and shows you know your financials.</p>
            </div>
          )}
          {lendingLabIntent === "want_to_understand" && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 mb-4">
              <p className="text-sm text-muted-foreground">Adding prior-year data helps validate your projections and spot trends.</p>
            </div>
          )}
          <p className="text-sm text-muted-foreground mb-4">
            Last year's real numbers are the foundation for credible projections - they help us stress-test assumptions and strengthen your financial story.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <FormInput
              name="priorYearSnapshot.endingEnrollment"
              label="Prior-Year Ending Enrollment"
              type="number"
              placeholder="0"
            />
            <FormInput
              name="priorYearSnapshot.endingCash"
              label="Prior-Year Ending Cash"
              type="number"
              prefix="$"
              placeholder="0"
            />
            <FormInput
              name="priorYearSnapshot.totalRevenue"
              label="Prior-Year Total Revenue"
              type="number"
              prefix="$"
              placeholder="0"
            />
            <FormInput
              name="priorYearSnapshot.totalExpenses"
              label="Prior-Year Total Expenses"
              type="number"
              prefix="$"
              placeholder="0"
            />
          </div>
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-primary hover:underline mb-4">
              + Revenue & expense breakdown (optional)
            </summary>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Revenue by Source</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormInput name="priorYearSnapshot.tuitionRevenue" label="Tuition & Fees" type="number" prefix="$" placeholder="0" />
                  <FormInput name="priorYearSnapshot.publicFundingRevenue" label="Public Funding" type="number" prefix="$" placeholder="0" />
                  <FormInput name="priorYearSnapshot.philanthropyRevenue" label="Philanthropy & Grants" type="number" prefix="$" placeholder="0" />
                  <FormInput name="priorYearSnapshot.otherRevenue" label="Other Revenue" type="number" prefix="$" placeholder="0" />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Expenses by Category</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormInput name="priorYearSnapshot.personnelExpenses" label="Personnel (Salaries & Benefits)" type="number" prefix="$" placeholder="0" />
                  <FormInput name="priorYearSnapshot.facilityExpenses" label="Facility & Occupancy" type="number" prefix="$" placeholder="0" />
                  <FormInput name="priorYearSnapshot.instructionalExpenses" label="Instructional & Program" type="number" prefix="$" placeholder="0" />
                  <FormInput name="priorYearSnapshot.adminExpenses" label="Admin & Operations" type="number" prefix="$" placeholder="0" />
                </div>
              </div>
            </div>
          </details>
        </div>
      )}

      {schoolStage && (
        <div>
          <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Opening Balance Sheet</h3>
          {lendingLabIntent === "plan_to_apply" && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3 mb-4">
              <Rocket className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">An opening balance sheet shows your current financial position - it's standard for any financing application and helps reviewers understand where you're starting from.</p>
            </div>
          )}
          {lendingLabIntent === "want_to_understand" && (
            <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 mb-4">
              <p className="text-sm text-muted-foreground">Your opening balances flow into Year 1 cash projections and give a complete financial picture.</p>
            </div>
          )}
          {schoolStage === "new_school" && (
            <div className="rounded-xl bg-teal-50/60 border border-teal-200/60 px-4 py-3 mb-4 flex items-start gap-2.5">
              <Sprout className="h-4 w-4 text-teal-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-teal-800">Starting from scratch? That's totally normal - we'll set everything to $0 for you. If you do have existing savings or debts to carry over, you can expand this section and enter them.</p>
            </div>
          )}
          <details className="group" open={schoolStage === "operating_school" && lendingLabIntent === "plan_to_apply"}>
            <summary className="cursor-pointer text-sm font-medium text-primary hover:underline mb-4">
              {schoolStage === "new_school" ? "Do you have any existing finances to carry over?" : lendingLabIntent === "plan_to_apply" ? "Assets & Liabilities" : "+ Opening balances (optional)"}
            </summary>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Assets</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormInput name="openingBalances.cash" label="Cash & Cash Equivalents" type="number" prefix="$" placeholder="0" />
                  <FormInput name="openingBalances.accountsReceivable" label={<><GlossaryTerm termKey="accounts_receivable">Accounts Receivable</GlossaryTerm></>} type="number" prefix="$" placeholder="0" />
                  <FormInput name="openingBalances.fixedAssets" label={<><GlossaryTerm termKey="fixed_assets">Fixed Assets</GlossaryTerm> (Net)</>} type="number" prefix="$" placeholder="0" />
                  <div className="flex flex-col gap-1.5">
                    <FormInput name="openingBalances.fixedAssetUsefulLife" label="Useful Life (years)" type="number" placeholder="7" />
                    <div className="flex items-start gap-2 mt-1">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground">How many years your equipment and furniture will last before needing replacement. We spread the cost evenly across those years - that's <GlossaryTerm termKey="depreciation">depreciation</GlossaryTerm>. Most school assets last 5–10 years. Default is 7.</p>
                    </div>
                  </div>
                  <FormInput name="openingBalances.otherAssets" label="Other Assets" type="number" prefix="$" placeholder="0" />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Liabilities</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormInput name="openingBalances.accountsPayable" label={<><GlossaryTerm termKey="accounts_payable">Accounts Payable</GlossaryTerm></>} type="number" prefix="$" placeholder="0" />
                  <FormInput name="openingBalances.currentDebtPortion" label="Current Portion of Debt" type="number" prefix="$" placeholder="0" />
                  <FormInput name="openingBalances.longTermDebt" label="Long-Term Debt" type="number" prefix="$" placeholder="0" />
                </div>
              </div>
            </div>
          </details>
        </div>
      )}

      {schoolStage && (
        <div className="bg-secondary/50 rounded-2xl p-5 border border-border">
          <p className="text-sm font-medium text-foreground mb-1">Planning Horizon</p>
          <p className="text-sm text-muted-foreground">
            {schoolStage === "new_school"
              ? "Your model will project 5 years (Year 1 through Year 5)."
              : "Your model will project 5 years (Current Year through Year 5)."}
          </p>
        </div>
      )}
    </div>
  );
}
