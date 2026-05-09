import { useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import { ClipboardCheck, Upload, ArrowLeftRight, FileSpreadsheet, AlertTriangle, BookOpen } from "lucide-react";
import {
  parseAccountingExportCsv,
  parseAccountingExportRows,
  mapAccountingExportToSnapshot,
  MAX_ACCOUNTING_EXPORT_BYTES,
  PATHWAY_FRAMING_COPY,
  type ParsedAccountingExport,
  type ActualsSnapshotField,
} from "@workspace/finance";
import { FormInput } from "@/components/ui/form-inputs";
import { hasActualsSeedData } from "@/lib/seed-from-actuals";

// Task #657 — Actuals Intake step.
//
// Surfaced right after Story whenever the founder picked the "actuals"
// pathway (operating school). Captures last year's six headline numbers
// (revenue, expenses, ending cash, ending enrollment, plus an optional
// breakdown by source / category) which then seed the empty Year-1 cells
// of the projection on Continue.
//
// Founders who already have a P&L export can drop it in here and we'll
// auto-fill the six numbers from QuickBooks / Xero / Wave totals via the
// same client-side parser the School Details step uses.
//
// Switching back to the assumptions path is offered with an explicit
// confirmation that the values entered here stay saved on the model — so
// the founder can flip back without losing typed-in numbers.

type FieldKey = ActualsSnapshotField;

type ImportSource = "quickbooks" | "csv";

export function ActualsIntakeStep({ jumpToStep }: { jumpToStep?: (s: number) => void }) {
  const { watch, setValue, getValues } = useFormContext();
  const snapshot = (watch("priorYearSnapshot") as Record<string, unknown> | undefined) ?? {};
  const seeded = hasActualsSeedData(snapshot as never);

  // Confirmation gate for the path switch. Values stay on the form
  // either way — switching only flips `wizardPathway` so the wizard
  // re-renders without the Actuals Intake step. We surface that
  // explicitly in the confirmation copy so founders aren't worried
  // about losing typed-in numbers.
  const [confirmingSwitch, setConfirmingSwitch] = useState(false);
  const confirmSwitchToAssumptions = () => {
    setValue("schoolProfile.wizardPathway", "assumptions", { shouldDirty: true });
    setConfirmingSwitch(false);
    if (jumpToStep) jumpToStep(1);
  };

  // P&L upload — mirrors the SchoolProfileStep wiring so the same
  // QuickBooks / Xero / Wave exports work in both surfaces. Parses
  // client-side, maps the headline + curated category totals onto the
  // priorYearSnapshot fields, and never overwrites a non-empty cell so
  // a founder who typed a number and then uploaded keeps their value.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadFilename, setUploadFilename] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [filledFields, setFilledFields] = useState<FieldKey[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  // Tracks which entry-point the founder picked so the upload summary
  // and analytics can distinguish "Imported from QuickBooks" from the
  // generic CSV fallback (Xero, Wave, hand-rolled spreadsheet, etc.).
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  // Inline instruction panel for the QuickBooks path. Surfaced before
  // the picker so founders know where to find Reports → P&L → Export.
  const [showQuickBooksHelp, setShowQuickBooksHelp] = useState(false);

  const triggerPicker = (source: ImportSource) => {
    setImportSource(source);
    fileInputRef.current?.click();
  };

  const handleQuickBooksClick = () => {
    setImportSource("quickbooks");
    if (showQuickBooksHelp) {
      triggerPicker("quickbooks");
    } else {
      setShowQuickBooksHelp(true);
    }
  };

  const handleFile = async (file: File) => {
    setUploadError(null);
    setFilledFields([]);
    setParseWarnings([]);
    if (file.size > MAX_ACCOUNTING_EXPORT_BYTES) {
      setUploadError(
        `File is larger than ${Math.round(MAX_ACCOUNTING_EXPORT_BYTES / 1000)} KB. Trim it to a single P&L summary and re-upload.`,
      );
      return;
    }
    const lower = file.name.toLowerCase();
    const isXlsx = lower.endsWith(".xlsx");
    const isCsv = lower.endsWith(".csv");
    if (!isCsv && !isXlsx) {
      setUploadError("Only CSV and Excel (.xlsx) exports are supported.");
      return;
    }
    setIsParsing(true);
    try {
      let parsed: ParsedAccountingExport;
      if (isXlsx) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const firstName = wb.SheetNames[0];
        if (!firstName) {
          setUploadError("That Excel file didn't have any sheets we could read.");
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
      const mappings = mapAccountingExportToSnapshot(parsed);
      const filled: FieldKey[] = [];
      for (const [key, value] of mappings) {
        const current = getValues(`priorYearSnapshot.${key}`) as number | string | undefined;
        // FormInput registers numeric fields with `valueAsNumber: true`,
        // so an empty input reads back as NaN. Treat NaN as empty so we
        // pre-fill cells the founder hasn't typed into yet.
        const isEmpty =
          current === undefined ||
          current === null ||
          current === "" ||
          current === 0 ||
          (typeof current === "number" && Number.isNaN(current));
        if (isEmpty) {
          setValue(`priorYearSnapshot.${key}`, value, { shouldDirty: true });
          filled.push(key);
        }
      }
      setUploadFilename(file.name);
      setFilledFields(filled);
      setParseWarnings(parsed.parseWarnings ?? []);
      if (filled.length === 0 && parsed.parseWarnings.length === 0) {
        setUploadError(
          "We couldn't pull any new numbers from that export — your existing values were kept. Try a cleaner P&L (no merged cells, single sheet).",
        );
      }
    } catch {
      setUploadError(
        isXlsx
          ? "Couldn't read that Excel file. Re-save it as .xlsx (or export as CSV) and try again."
          : "Couldn't read that file. Make sure it's a plain-text CSV and try again.",
      );
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 mb-4">
          <ClipboardCheck className="h-7 w-7 text-emerald-700" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">
          Last year's numbers
        </h2>
        <p
          data-testid="actuals-intake-framing"
          className="text-muted-foreground mt-2 max-w-2xl mx-auto"
        >
          {PATHWAY_FRAMING_COPY.actuals}
        </p>
        <p className="text-muted-foreground mt-2 max-w-2xl mx-auto text-sm">
          These six numbers seed your Year-1 projection — you can refine every line on the steps that follow.
        </p>
      </div>

      <div
        data-testid="actuals-intake-form"
        className="rounded-2xl border border-border bg-card p-6 space-y-6"
      >
        {/* P&L upload — drop-zone style affordance, wired to the same
            client-side parser SchoolProfileStep uses. Auto-fills empty
            cells and never overwrites a typed-in number. */}
        <div data-testid="actuals-intake-upload" className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 p-4">
          <div className="flex items-start gap-3">
            <Upload className="h-5 w-5 text-emerald-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Auto-import last year's books</p>
              <p className="text-xs text-muted-foreground mt-1">
                Pull the six numbers below straight from your accounting tool. We won't overwrite anything you've already typed, and your books never leave your browser.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={onFileChange}
                data-testid="actuals-intake-upload-input"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleQuickBooksClick}
                  disabled={isParsing}
                  data-testid="actuals-intake-quickbooks-button"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <BookOpen className="h-4 w-4" />
                  {isParsing && importSource === "quickbooks"
                    ? "Reading file…"
                    : showQuickBooksHelp
                      ? "Choose your QuickBooks export"
                      : "Import from QuickBooks"}
                </button>
                <button
                  type="button"
                  onClick={() => triggerPicker("csv")}
                  disabled={isParsing}
                  data-testid="actuals-intake-upload-button"
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {isParsing && importSource === "csv"
                    ? "Reading file…"
                    : uploadFilename
                      ? "Upload a different export"
                      : "Upload CSV or Excel (Xero, Wave, other)"}
                </button>
              </div>
              {showQuickBooksHelp && (
                <div
                  data-testid="actuals-intake-quickbooks-help"
                  className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-foreground"
                >
                  <p className="font-semibold">Export your Profit &amp; Loss from QuickBooks:</p>
                  <ol className="mt-1 list-decimal pl-4 space-y-0.5 text-muted-foreground">
                    <li>In QuickBooks, open <span className="font-medium">Reports → Profit and Loss</span>.</li>
                    <li>Set the date range to last fiscal year and run the report.</li>
                    <li>Click <span className="font-medium">Export → Export to Excel</span> (CSV also works).</li>
                    <li>Click <span className="font-medium">Choose your QuickBooks export</span> above and pick the file.</li>
                  </ol>
                </div>
              )}
              {uploadFilename && filledFields.length > 0 && (
                <p
                  data-testid="actuals-intake-upload-summary"
                  className="text-xs text-emerald-800 mt-2"
                >
                  {importSource === "quickbooks" ? "Imported" : "Pulled"} {filledFields.length} number{filledFields.length === 1 ? "" : "s"} from <span className="font-medium">{uploadFilename}</span>
                  {importSource === "quickbooks" ? " (QuickBooks)" : ""}. Review the cells below and edit anything that looks off.
                </p>
              )}
              {uploadError && (
                <p className="text-xs text-amber-800 mt-2 flex items-start gap-1.5" data-testid="actuals-intake-upload-error">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>{uploadError}</span>
                </p>
              )}
              {parseWarnings.length > 0 && (
                <ul className="text-xs text-amber-800 mt-2 list-disc pl-4 space-y-0.5">
                  {parseWarnings.slice(0, 3).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-1">The six headline numbers</h3>
          <p className="text-xs text-muted-foreground">All optional - skip any you don't have on hand and we'll leave the matching Year-1 cell blank.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormInput
            name="priorYearSnapshot.totalRevenue"
            label="1. Last-year total revenue"
            type="number"
            prefix="$"
            placeholder="0"
            helperText="Everything that came in last year - tuition, public funding, philanthropy, fundraising."
          />
          <FormInput
            name="priorYearSnapshot.totalExpenses"
            label="2. Last-year total expenses paid"
            type="number"
            prefix="$"
            placeholder="0"
            helperText="Everything that went out the door last year - cash basis is fine."
          />
          <FormInput
            name="priorYearSnapshot.endingCash"
            label="3. Cash on hand at year-end"
            type="number"
            prefix="$"
            placeholder="0"
            helperText="Combined balance across operating + savings accounts on the last day of last year."
          />
          <FormInput
            name="priorYearSnapshot.endingEnrollment"
            label="4. Ending enrollment"
            type="number"
            placeholder="0"
            helperText="Headcount on the last day of school last year."
          />
        </div>

        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-primary hover:underline">
            5 + 6. Revenue sources & expense categories (optional breakdown)
          </summary>
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">5. Where revenue came from</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput name="priorYearSnapshot.tuitionRevenue" label="Tuition & Fees" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.publicFundingRevenue" label="Public Funding" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.philanthropyRevenue" label="Philanthropy & Grants" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.otherRevenue" label="Other Revenue" type="number" prefix="$" placeholder="0" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">6. What expenses paid for</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput name="priorYearSnapshot.personnelExpenses" label="Personnel (Salaries & Benefits)" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.facilityExpenses" label="Facility & Occupancy" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.instructionalExpenses" label="Instructional & Program" type="number" prefix="$" placeholder="0" />
                <FormInput name="priorYearSnapshot.adminExpenses" label="Admin & Operations" type="number" prefix="$" placeholder="0" />
              </div>
            </div>
          </div>
        </details>

        {seeded && (
          <div
            data-testid="actuals-intake-seed-confirmation"
            className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3"
          >
            <p className="text-sm text-emerald-800">
              <span className="font-semibold">Got it.</span> When you continue, we'll seed Year-1 enrollment, opening cash, revenue, and expenses from these numbers. You can edit any line on the steps that follow.
            </p>
          </div>
        )}
      </div>

      {/* Bidirectional switcher with explicit data-preservation
          confirmation. The "Wrong path?" link mirrors the assumptions
          framing block's switcher so the founder can flip in either
          direction at any point in the flow. */}
      <div className="flex items-center justify-center">
        {!confirmingSwitch ? (
          <button
            type="button"
            data-testid="actuals-switch-to-assumptions"
            onClick={() => setConfirmingSwitch(true)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary underline"
          >
            <ArrowLeftRight className="h-4 w-4" /> Wrong path? Switch to the assumptions path instead
          </button>
        ) : (
          <div
            role="dialog"
            aria-label="Confirm path switch"
            data-testid="actuals-switch-confirm"
            className="rounded-xl border border-border bg-card px-4 py-3 max-w-lg w-full text-center space-y-3"
          >
            <p className="text-sm text-foreground">
              <span className="font-semibold">Switch to the assumptions path?</span>{" "}
              Your typed-in numbers stay saved on the model - you can switch back any time without losing them.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmingSwitch(false)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="actuals-switch-confirm-button"
                onClick={confirmSwitchToAssumptions}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Yes, switch
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
