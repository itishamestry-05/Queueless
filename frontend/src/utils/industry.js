import { getCustomQueues } from './queueRegistry.js';

export const INDUSTRY_PROFILES = {
  general: {
    name: 'General Office',
    services: [
      { id: 'general',      title: 'General Inquiry',  desc: 'Reception, info, walk-in support' },
      { id: 'consultation', title: 'Consultation',      desc: 'Advisor or specialist visit' },
      { id: 'transaction',  title: 'Transaction',       desc: 'Payment, deposit, account change' },
      { id: 'billing',      title: 'Billing & Payments',desc: 'Invoices, refunds, billing queries' },
      { id: 'support',      title: 'Help & Support',    desc: 'Complaints, follow-ups, assistance' },
    ],
  },
  bank: {
    name: 'Bank / Finance',
    services: [
      { id: 'new_account',      title: 'New Account',       desc: 'Open savings, current, or business account' },
      { id: 'loan',             title: 'Loan Application',  desc: 'Personal, home, or vehicle loan' },
      { id: 'forex',            title: 'Foreign Exchange',  desc: 'Currency conversion, remittance' },
      { id: 'card_services',    title: 'Card Services',     desc: 'Debit/credit card issues, PIN reset' },
      { id: 'priority_banking', title: 'Priority Banking',  desc: 'Premium / wealth customer desk' },
      { id: 'locker',           title: 'Locker Services',   desc: 'Safe deposit locker access' },
      { id: 'general',          title: 'General Banking',   desc: 'Deposits, withdrawals, general queries' },
    ],
  },
  medical: {
    name: 'Medical / Hospital',
    services: [
      { id: 'opd',            title: 'OPD / General Medicine', desc: 'General physician consultation' },
      { id: 'eye_specialist', title: 'Ophthalmology (Eye)', desc: 'Eye check-ups, vision tests' },
      { id: 'cardiology',     title: 'Cardiology',       desc: 'Heart & cardiovascular care' },
      { id: 'dental',         title: 'Dental',           desc: 'Dentist consultation & procedures' },
      { id: 'ent',            title: 'ENT',              desc: 'Ear, nose & throat specialist' },
      { id: 'dermatology',    title: 'Dermatology',      desc: 'Skin, hair & nail care' },
      { id: 'orthopedics',    title: 'Orthopaedics',     desc: 'Bones, joints & fractures' },
      { id: 'pediatrics',     title: 'Paediatrics',      desc: 'Child & infant care' },
      { id: 'gynecology',     title: 'Obstetrics & Gynaecology', desc: 'Women’s health & maternity' },
      { id: 'lab',            title: 'Laboratory',       desc: 'Blood tests, urine, diagnostics' },
      { id: 'pharmacy',       title: 'Pharmacy',         desc: 'Prescription pickup, medication' },
      { id: 'radiology',      title: 'Radiology',        desc: 'X-ray, CT, MRI, ultrasound' },
      { id: 'emergency',      title: 'Emergency / Casualty', desc: 'Urgent care, seen first' },
    ],
  },
  restaurant: {
    name: 'Restaurant / Dining',
    services: [
      { id: 'table_small',  title: 'Table (1-2)',  desc: 'Small table for 1 or 2 people' },
      { id: 'table_medium', title: 'Table (3-4)',  desc: 'Medium table for 3-4 people' },
      { id: 'table_large',  title: 'Table (5+)',   desc: 'Large table for 5 or more' },
      { id: 'reservation',  title: 'Reservation',  desc: 'Booked / reserved seating' },
      { id: 'takeaway',     title: 'Takeaway',     desc: 'Order pickup, no seating needed' },
      { id: 'bar',          title: 'Bar / Lounge', desc: 'Bar seating & drinks' },
    ],
  },
};

/**
 * Doctor specialities for appointments. Appointments are a hospital feature, so
 * this list is used whatever queue profile the counters run on (the "general"
 * profile would otherwise offer "Transaction" and "Billing" as departments).
 * Ids for the first nine match the medical profile, so doctors and queues line up.
 */
export const SPECIALTIES = [
  { id: 'opd',              title: 'General Medicine',   desc: 'Fever, infections, general check-ups' },
  { id: 'cardiology',       title: 'Cardiology',         desc: 'Heart, blood pressure, chest pain' },
  { id: 'orthopedics',      title: 'Orthopaedics',       desc: 'Bones, joints, back pain, fractures' },
  { id: 'pediatrics',       title: 'Paediatrics',        desc: 'Children and infants' },
  { id: 'gynecology',       title: 'Obstetrics & Gynaecology', desc: 'Women’s health and pregnancy' },
  { id: 'dermatology',      title: 'Dermatology',        desc: 'Skin, hair and nails' },
  { id: 'ent',              title: 'ENT',                desc: 'Ear, nose and throat' },
  { id: 'eye_specialist',   title: 'Ophthalmology',      desc: 'Eyes and vision' },
  { id: 'dental',           title: 'Dental',             desc: 'Teeth and gums' },
  { id: 'neurology',        title: 'Neurology',          desc: 'Brain, nerves, headaches, seizures' },
  { id: 'gastroenterology', title: 'Gastroenterology',   desc: 'Stomach, liver and digestion' },
  { id: 'pulmonology',      title: 'Pulmonology',        desc: 'Lungs, asthma, breathing' },
  { id: 'nephrology',       title: 'Nephrology',         desc: 'Kidneys and dialysis' },
  { id: 'urology',          title: 'Urology',            desc: 'Urinary tract and kidney stones' },
  { id: 'endocrinology',    title: 'Endocrinology',      desc: 'Diabetes, thyroid, hormones' },
  { id: 'psychiatry',       title: 'Psychiatry',         desc: 'Mental health and counselling' },
  { id: 'oncology',         title: 'Oncology',           desc: 'Cancer care' },
  { id: 'general_surgery',  title: 'General Surgery',    desc: 'Surgical consultation' },
];

/**
 * Specialities to offer. Any department a doctor already belongs to that is not
 * in the list above (from older setups) is appended, so no doctor goes missing.
 */
export function getSpecialties(doctors = []) {
  const known = new Set(SPECIALTIES.map(s => s.id));
  const extra = [...new Set(doctors.map(d => d.specialty).filter(id => id && !known.has(id)))]
    .map(id => ({ id, title: getServiceLabel(id), desc: '' }));
  return [...SPECIALTIES, ...extra];
}

/** Map an admin-defined custom queue to the legacy service shape. */
function mapCustomQueue(q) {
  return {
    id: q.key,
    title: q.label,
    desc: q.prefix ? `Prefix ${q.prefix}` : '',
    prefix: q.prefix || null,
    capacity: q.capacity ?? null,
    avgServiceSeconds: q.avgServiceSeconds ?? null,
    workingHours: q.workingHours ?? null,
  };
}

/**
 * Active services/counters. Admin-defined custom queues take precedence over the
 * static industry profile; when none exist we fall back to the profile so legacy
 * deployments behave exactly as before.
 */
export function getServices(industry) {
  const custom = getCustomQueues();
  if (custom && custom.length) return custom.map(mapCustomQueue);
  return (INDUSTRY_PROFILES[industry] || INDUSTRY_PROFILES.general).services;
}

export function getServiceLabel(service, industry) {
  // Custom queues first, then the industry profile, then a humanised fallback.
  const custom = getCustomQueues();
  if (custom && custom.length) {
    const match = custom.find(q => q.key === service);
    if (match) return match.label;
  }
  const profile = (INDUSTRY_PROFILES[industry] || INDUSTRY_PROFILES.general).services;
  return profile.find(s => s.id === service)?.title
    || SPECIALTIES.find(s => s.id === service)?.title
    || String(service || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function getIndustryName(industry) {
  return (INDUSTRY_PROFILES[industry] || INDUSTRY_PROFILES.general).name;
}
