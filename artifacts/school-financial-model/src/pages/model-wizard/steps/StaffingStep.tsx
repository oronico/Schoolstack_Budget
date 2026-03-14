import { FormInput } from "@/components/ui/form-inputs";

export function StaffingStep() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-3xl font-bold text-foreground mb-3">Staffing Model</h2>
        <p className="text-muted-foreground text-lg">Staffing is usually the largest expense. We'll automatically calculate how many teachers you need based on enrollment.</p>
      </div>

      <div className="space-y-8">
        <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10">
          <h3 className="font-bold text-primary mb-4">Instructional Staff</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormInput 
              name="staffing.studentsPerTeacher" 
              label="Target Student:Teacher Ratio" 
              type="number"
              placeholder="12"
              helperText="We'll use this to calculate teacher headcount"
            />
            
            <FormInput 
              name="staffing.teacherSalary" 
              label="Average Teacher Salary" 
              type="number"
              prefix="$"
              placeholder="55000"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormInput 
            name="staffing.adminStaffCount" 
            label="Admin Staff Headcount" 
            type="number"
            placeholder="1"
            helperText="Non-teaching staff (excluding founder)"
          />
          
          <FormInput 
            name="staffing.adminSalary" 
            label="Average Admin Salary" 
            type="number"
            prefix="$"
            placeholder="45000"
          />
          
          <FormInput 
            name="staffing.founderSalary" 
            label="Founder/Leader Salary" 
            type="number"
            prefix="$"
            placeholder="75000"
          />

          <FormInput 
            name="staffing.benefitsRate" 
            label="Benefits & Taxes Rate" 
            type="number"
            suffix="%"
            placeholder="20"
            helperText="% of base salary (taxes, health, retirement)"
          />
        </div>
      </div>
    </div>
  );
}
