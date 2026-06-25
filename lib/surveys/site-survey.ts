import type { SurveySpec } from '@/lib/surveys/types'

// VinFast shop facility readiness survey. One row per location in
// shop_facility_surveys (responses JSONB). Questions sourced from the live
// RepairWise/VinFast facility readiness form.
export const SITE_SURVEY: SurveySpec = {
  id: 'vinfast-site',
  title: 'Facility readiness',
  intro:
    'This assessment evaluates your shop’s readiness for the VinFast OEM Warranty Program. ' +
    'Answering “No” to anything does not disqualify you — we’ll work with you to close any gaps. ' +
    'Completion is required for program participation.',
  sections: [
    {
      questions: [{ key: 'shop_name', label: 'Shop name', type: 'text', required: true }],
    },
    {
      title: 'Facility & infrastructure',
      questions: [
        { key: 'signage', label: 'Do you have visible signage so customers can easily identify your shop?', type: 'yesno', required: true },
        { key: 'parts_storage', label: 'Do you have a designated area to store spare parts?', type: 'yesno', required: true },
        { key: 'wall_charger_location', label: 'Do you have a location to install a VinFast wall charger? (provided at no charge)', type: 'yesno', required: true },
        { key: 'two_bays_one_lift', label: 'Does your shop have a minimum of two bays, including at least one lift?', type: 'yesno', required: true },
      ],
    },
    {
      title: 'Customer experience',
      questions: [
        { key: 'greeter', label: 'Do you have a staff member available to greet customers?', type: 'yesno', required: true },
        { key: 'waiting_area', label: 'Do you have a customer lounge or waiting area?', type: 'yesno', required: true },
        { key: 'service_desk', label: 'Do you have a customer service area with a desk or counter?', type: 'yesno', required: true },
      ],
    },
    {
      title: 'Staff, systems & safety',
      questions: [
        { key: 'advisor_computers_phones', label: 'Do you have computers and phones available in your service advisor area?', type: 'yesno', required: true },
        { key: 'power_wifi', label: 'Do you have power and Wi-Fi access in your service area?', type: 'yesno', required: true },
        { key: 'hv_safety_equipment', label: 'Do you have the RepairWise-recommended high-voltage (HV) safety equipment?', type: 'yesno', required: true },
        { key: 'acting_manager', label: 'Do you have an acting manager onsite?', type: 'yesno', required: true },
        { key: 'vinfast_trained_tech', label: 'Do you have at least one VinFast-trained technician?', type: 'yesno', required: true },
        { key: 'team_prepared', label: 'Is your team trained and prepared to receive VinFast customers?', type: 'yesno', required: true },
        { key: 'parts_inventory_tracking', label: 'Can you track and manage VinFast parts and inventory?', type: 'yesno', required: true },
        {
          key: 'wifi_speed_mbps',
          label: 'Navigate to fast.com, run a speed test, and enter your Wi-Fi speed (Mbps)',
          type: 'number',
          required: true,
          help: 'On a device connected to your shop Wi-Fi, run the test and enter the number it shows.',
          link: { label: 'Run speed test on fast.com', url: 'https://fast.com' },
          placeholder: 'e.g. 120',
        },
      ],
    },
  ],
}
