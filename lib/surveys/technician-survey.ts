import type { SurveySpec } from '@/lib/surveys/types'

const yn = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

// Technician EV Readiness Form — one row per technician in
// tech_competency_surveys (responses JSONB). Filled by an invited tech via
// their own link, not the shop owner.
export const TECHNICIAN_SURVEY: SurveySpec = {
  id: 'technician-ev-readiness',
  title: 'Technician EV Readiness',
  intro: 'Your shop invited you to complete this short readiness survey. It takes about 5 minutes.',
  sections: [
    {
      title: 'About you',
      questions: [
        { key: 'full_name', label: 'Full name', type: 'text', required: true },
        { key: 'phone', label: 'Phone number', type: 'tel', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'years_experience', label: 'How many years of experience do you have working in a shop?', type: 'number', required: true },
        { key: 'oem_warranty_experience', label: 'Have you performed OEM warranty repairs at a dealership?', type: 'yesno', required: true },
      ],
    },
    {
      title: 'Your skills',
      questions: [
        {
          key: 'vehicle_types',
          label: 'What kinds of vehicles are you comfortable performing repairs on? Check all that apply.',
          type: 'multi',
          required: true,
          options: [
            { value: 'domestic', label: 'Domestic (Ford, Chevy, GM)' },
            { value: 'european', label: 'European (BMW, Mercedes, Audi)' },
            { value: 'asian', label: 'Asian (Toyota, Honda, Hyundai)' },
          ],
        },
        {
          key: 'work_types',
          label: 'What kind of work do you perform on a regular basis? Check all that apply.',
          type: 'multi',
          options: [
            { value: 'maintenance', label: 'Maintenance (oil change, tire rotation, brakes, fluids)' },
            { value: 'rr', label: 'R&R work (starter, alternator, pumps, hoses)' },
            { value: 'engine_perf_diag', label: 'Engine performance diagnosis (running rough, idling issues)' },
            { value: 'electrical_diag', label: 'Electrical diagnosis & repair (opens/shorts, connector/module testing, back probing)' },
            { value: 'heavy_line', label: 'Heavy line repairs (engine/transmission R&R)' },
          ],
        },
        {
          key: 'ase_certificates',
          label: 'ASE certificates — check all that apply.',
          type: 'multi',
          required: true,
          options: [
            { value: 'a1', label: 'A1 — Engine Repair' },
            { value: 'a2', label: 'A2 — Automatic Transmission / Transaxle' },
            { value: 'a3', label: 'A3 — Manual Drive Train & Axles' },
            { value: 'a4', label: 'A4 — Suspension and Steering' },
            { value: 'a5', label: 'A5 — Brakes' },
            { value: 'a6', label: 'A6 — Electrical / Electronic Systems' },
            { value: 'a7', label: 'A7 — Heating & A/C' },
            { value: 'a8', label: 'A8 — Engine Performance' },
            { value: 'a9', label: 'A9 — Light Vehicle Diesel Engines' },
          ],
        },
        { key: 'hv_certified', label: 'Are you High Voltage (HV) certified?', type: 'yesno', required: true },
        { key: 'ac_certified_609', label: 'Are you certified to perform A/C work? (EPA 609)', type: 'yesno', required: true },
        {
          key: 'ev_brands',
          label: 'What EV brands have you worked on? Check all that apply.',
          type: 'multi',
          required: true,
          options: [
            { value: 'tesla', label: 'Tesla' },
            { value: 'rivian', label: 'Rivian' },
            { value: 'lucid', label: 'Lucid' },
            { value: 'vinfast', label: 'VinFast' },
            { value: 'polestar', label: 'Polestar' },
            { value: 'domestic_ev', label: 'Domestic EVs' },
            { value: 'european_ev', label: 'European EVs' },
            { value: 'asian_ev', label: 'Asian EVs' },
            { value: 'none', label: 'None' },
            { value: 'other', label: 'Other' },
          ],
        },
        {
          key: 'ev_hv_repairs',
          label: 'What kind of EV / HV repairs do you perform on a regular basis? Check all that apply.',
          type: 'multi',
          required: true,
          options: [
            { value: 'hv_battery_rr', label: 'HV battery R&R' },
            { value: 'drive_unit_rr', label: 'Drive unit R&R' },
            { value: 'hv_isolation', label: 'HV isolation' },
            { value: 'hvil_diag', label: 'HVIL diagnosis' },
            { value: 'software_updates', label: 'Software / firmware updates' },
            { value: 'cooling_system', label: 'Cooling system repair' },
            { value: 'brake_coolant', label: 'Brakes / coolant issues' },
            { value: 'none', label: 'None' },
            { value: 'other', label: 'Other' },
          ],
        },
        { key: 'multimeter_hv', label: 'Do you own a quality multimeter with HV isolation capabilities and a pin-out kit?', type: 'yesno' },
      ],
    },
    {
      title: 'Knowledge check',
      intro: 'A few scenarios — pick the best answer.',
      questions: [
        {
          key: 'kc_crank_no_start',
          label: 'A car comes in with a crank, no-start condition. What are your first steps to diagnose the vehicle?',
          type: 'single',
          required: true,
          options: [
            { value: 'fuel_pressure', label: 'Verify fuel pressure at the rail' },
            { value: 'spark', label: 'Verify engine has spark' },
            { value: 'compression', label: 'Verify engine has compression' },
            { value: 'all_above', label: 'All of the above' },
            { value: 'voltage_comm', label: 'Check voltage and communication' },
            { value: 'forklift', label: 'Forklift gas car out and bring in EV for repair' },
            { value: 'other', label: 'Other' },
          ],
        },
        {
          key: 'kc_ac_warm',
          label: 'AC blows warm. Discharge pressure slowly increases on max, and vents blow warmer as pressure rises. What do you suspect?',
          type: 'single',
          required: true,
          options: [
            { value: 'condenser_fan', label: 'Condenser fan may not be cooling' },
            { value: 'hp_hose_restriction', label: 'Restriction in high-pressure hose' },
            { value: 'clogged_condenser', label: 'Clogged condenser' },
            { value: 'all_above', label: 'All of the above' },
            { value: 'pressure_switches', label: 'Pressure switches and AC regulators' },
            { value: 'other', label: 'Other' },
          ],
        },
        {
          key: 'kc_window_no_move',
          label: 'A window won’t roll up or down and the motor doesn’t respond when the switch is pressed. What should be checked first?',
          type: 'single',
          required: true,
          options: [
            { value: 'window_glass', label: 'Window glass' },
            { value: 'window_regulator', label: 'Window regulator' },
            { value: 'battery_voltage', label: 'Battery voltage' },
            { value: 'motor_housing', label: 'Motor housing' },
          ],
        },
        {
          key: 'kc_mirror_tilt',
          label: 'A left-hand mirror is not tilting downward. What would you suspect to be faulty?',
          type: 'single',
          required: true,
          options: [
            { value: 'fuse', label: 'Problem with fuse' },
            { value: 'chassis_ground', label: 'Faulty chassis ground' },
            { value: 'lin_bcm', label: 'LIN communication fault from BCM' },
            { value: 'actuator_switch', label: 'The actuator or control switch' },
            { value: 'none', label: 'None of the above' },
            { value: 'other', label: 'Other' },
          ],
        },
      ],
    },
  ],
}
