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
  workout_pt_unlocked: boolean;
  workout_prep_unlocked: boolean;
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

export type WorkoutExerciseRow = {
  id: string;
  name: string;
  tier: 'basic' | 'pt' | 'prep';
  category: string | null;
  muscle_group: string | null;
  equipment: string | null;
  gif_url: string | null;
  instructions: string | null;
  posture_tips: string | null;
  active: boolean;
  created_at: string | null;
};

export type WorkoutPlanRow = {
  id: string;
  name: string;
  tier: 'basic' | 'pt' | 'prep';
  description: string | null;
  structure: WorkoutDayStruct[];
  created_by: string | null;
  active: boolean;
  created_at: string | null;
};

export type WorkoutExerciseStruct = { exercise_id: string; sets: string; reps: string; weight_direction: string; rest_seconds: string; notes: string };
export type WorkoutDayStruct = { day_number: number; day_label: string; exercises: WorkoutExerciseStruct[] };

export type Lead = {
  id: string;
  name: string | null;
  phone: string;
  source: string;
  notes: string | null;
  last_contacted: string | null;
  created_at: string | null;
};

export type LapsedMember = {
  member_id: string;
  name: string | null;
  phone: string | null;
  expiry_date: string | null;
};

export type SellingProduct = {
  id: string;
  name: string;
  category: string | null;
  unit_size: string | null;
  mrp: number;
  wholesale_price: number;
  distributor_price: number;
  purchase_cost: number;
  stock: number;
  reorder_threshold: number;
  image_url: string | null;
  description: string | null;
  benefits: string | null;
  warnings: string | null;
  active: boolean;
  created_at: string | null;
};

export type SellingStaff = {
  id: string;
  name: string;
  phone: string;
  approved: boolean;
  active: boolean;
  created_at: string | null;
};

export type SellingSale = {
  id: number;
  sale_date: string | null;
  customer_name: string;
  customer_mobile: string | null;
  customer_address: string | null;
  customer_photo_url: string | null;
  location_lat: number | null;
  location_lng: number | null;
  sales_person: string | null;
  sales_staff_id: string | null;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  customer_tier: string;
  unit_price: number;
  gross_total: number;
  paid_amount: number;
  due_amount: number;
  payment_due_date: string | null;
  payment_mode: string;
  created_at: string | null;
};
