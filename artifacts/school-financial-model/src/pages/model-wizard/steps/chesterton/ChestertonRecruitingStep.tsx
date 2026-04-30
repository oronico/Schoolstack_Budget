import { useEffect, useMemo } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import { Plus, Trash2, Users, GraduationCap, Church } from "lucide-react";
import { FormInput } from "@/components/ui/form-inputs";
import { WhyThisMatters } from "@/components/coaching/WhyThisMatters";
import { buildDefaultChestertonData, totalEnrollmentForYear } from "@/lib/chesterton/template";
import type { ChestertonGradeRow } from "../../schema";

export function ChestertonRecruitingStep() {
  const { control, watch, setValue } = useFormContext();
  const phaseEnrollment = watch("chesterton.phaseEnrollment") as ChestertonGradeRow[] | undefined;

  const { fields: pipelineFields, append: appendPipeline, remove: removePipeline } = useFieldArray({
    control,
    name: "chesterton.recruitingPipeline",
  });

  const { fields: priestFields, append: appendPriest, remove: removePriest } = useFieldArray({
    control,
    name: "chesterton.priestlyOutreach",
  });

  const { fields: facilityFields, append: appendFacility, remove: removeFacility } = useFieldArray({
    control,
    name: "chesterton.prospectiveFacilities",
  });

  useEffect(() => {
    if (pipelineFields.length === 0) {
      const d = buildDefaultChestertonData();
      setValue("chesterton.recruitingPipeline", d.recruitingPipeline, { shouldDirty: true });
    }
    if (priestFields.length === 0) {
      const d = buildDefaultChestertonData();
      setValue("chesterton.priestlyOutreach", d.priestlyOutreach, { shouldDirty: true });
    }
    if (facilityFields.length === 0) {
      const d = buildDefaultChestertonData();
      setValue("chesterton.prospectiveFacilities", d.prospectiveFacilities, { shouldDirty: true });
    }
  }, [pipelineFields.length, priestFields.length, facilityFields.length, setValue]);

  const rows = watch("chesterton.recruitingPipeline") as Array<{ prospectiveStudents?: number }> | undefined;
  const totalProspects = useMemo(() => (rows || []).reduce((s, r) => s + (Number(r?.prospectiveStudents) || 0), 0), [rows]);
  const year1Need = useMemo(() => totalEnrollmentForYear(phaseEnrollment, "year1"), [phaseEnrollment]);

  return (
    <div className="space-y-10" data-testid="chesterton-recruiting-step">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3 flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-primary" />
          Recruiting Pipeline
        </h2>
        <p className="text-muted-foreground text-lg">
          Map every realistic source of students for your launch class. The CSN Operating Manual coaches schools to
          plan recruiting against feeder schools, parishes, and homeschool co-ops by name — not as a single hopeful number.
        </p>
      </div>

      <WhyThisMatters
        why="Lenders and CSN both ask: 'Where do your students come from, and how do you reach them?' A named pipeline (sibling list, K-8 feeders, homeschool partners) is the difference between a real plan and a hope."
        revisit="Update at the end of every recruiting season."
      />

      {year1Need > 0 && (
        <div className={`rounded-2xl border p-4 text-sm ${totalProspects >= year1Need * 3 ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
          Year 1 enrollment target: <strong>{year1Need} students</strong>. Current prospect total: <strong>{totalProspects}</strong>.
          {totalProspects < year1Need * 3 && (
            <> The CSN guideline is roughly <strong>3× more prospects than seats</strong> — you may need {year1Need * 3 - totalProspects} more.</>
          )}
        </div>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Prospect Sources
          </h3>
          <button
            type="button"
            data-testid="chesterton-recruiting-add-row"
            onClick={() => appendPipeline({ id: `rec-${Date.now()}`, source: "New source", prospectiveStudents: 0, notes: "" })}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add source
          </button>
        </div>
        <div className="space-y-2">
          {pipelineFields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center rounded-xl border border-border bg-white p-3">
              <div className="sm:col-span-4"><FormInput name={`chesterton.recruitingPipeline.${index}.source`} label="Source" /></div>
              <div className="sm:col-span-2"><FormInput name={`chesterton.recruitingPipeline.${index}.prospectiveStudents`} label="# Students" type="number" /></div>
              <div className="sm:col-span-5"><FormInput name={`chesterton.recruitingPipeline.${index}.notes`} label="Notes" /></div>
              <div className="sm:col-span-1 flex justify-end">
                <button type="button" onClick={() => removePipeline(index)} className="text-destructive hover:underline">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Church className="h-5 w-5 text-primary" />
            Priestly Outreach
          </h3>
          <button
            type="button"
            onClick={() => appendPriest({ id: `priest-${Date.now()}`, name: "Father TBD", affiliation: "Parish Name", teamMember: "" })}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
          >
            <Plus className="h-4 w-4" />
            Add contact
          </button>
        </div>
        <div className="space-y-2">
          {priestFields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center rounded-xl border border-border bg-white p-3">
              <div className="sm:col-span-4"><FormInput name={`chesterton.priestlyOutreach.${index}.name`} label="Priest" /></div>
              <div className="sm:col-span-4"><FormInput name={`chesterton.priestlyOutreach.${index}.affiliation`} label="Parish" /></div>
              <div className="sm:col-span-3"><FormInput name={`chesterton.priestlyOutreach.${index}.teamMember`} label="Team member assigned" /></div>
              <div className="sm:col-span-1 flex justify-end">
                <button type="button" onClick={() => removePriest(index)} className="text-destructive hover:underline">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">Prospective Future Facilities</h3>
          <button
            type="button"
            onClick={() => appendFacility({ id: `fac-${Date.now()}`, name: "New phase", capacity: 0, location: "TBD" })}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
          >
            <Plus className="h-4 w-4" />
            Add facility
          </button>
        </div>
        <div className="space-y-2">
          {facilityFields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center rounded-xl border border-border bg-white p-3">
              <div className="sm:col-span-4"><FormInput name={`chesterton.prospectiveFacilities.${index}.name`} label="Phase / Facility" /></div>
              <div className="sm:col-span-2"><FormInput name={`chesterton.prospectiveFacilities.${index}.capacity`} label="Capacity" type="number" /></div>
              <div className="sm:col-span-5"><FormInput name={`chesterton.prospectiveFacilities.${index}.location`} label="Location" /></div>
              <div className="sm:col-span-1 flex justify-end">
                <button type="button" onClick={() => removeFacility(index)} className="text-destructive hover:underline">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
