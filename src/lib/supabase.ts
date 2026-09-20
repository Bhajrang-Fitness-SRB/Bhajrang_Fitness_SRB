import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const supabase = createClient(url, key);

export type Member = {
  member_id: string;
  name: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  marital_status: string | null;
  father_name: string | null;
  govt_id: string | null;
  occupation: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pin: string | null;
  gym_experience_years: string | null;
  profile_pic: string | null;
  joining_date: string | null;
  package: string | null;
  expiry_date: string | null;
  goal: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  medical_conditions: string | null;
};

export type PendingApproval = {
  id: number;
  name: string | null;
  mobile: string;
  email: string | null;
  dob: string | null;
  address: string | null;
  status: string | null;
  created_at: string | null;
  gender: string | null;
  goal?: string | null;
};

export type AttendanceLog = {
  id: number;
  member_id: string | null;
  punch_in_time: string | null;
  punch_out_time: string | null;
  status: string | null;
};

export type Staff = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  passcode: string | null;
  active: boolean | null;
  created_at?: string | null;
};

export type Inventory = {
  id: string;
  item_name: string;
  category: string | null;
  quantity: number;
  reorder_level: number;
  unit_price: number | null;
  last_restocked: string | null;
};

export type Package = {
  id: string;
  name: string;
  duration_months: number;
  price: number;
  description: string | null;
};

export type Billing = {
  id: number;
  member_id: string | null;
  package_name: string | null;
  amount: number | null;
  discount: number | null;
  paid: number | null;
  due: number | null;
  payment_date: string | null;
  expiry_date: string | null;
  payment_method: string | null;
};
