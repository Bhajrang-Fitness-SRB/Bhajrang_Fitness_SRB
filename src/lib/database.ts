import { useEffect, useState, useCallback } from 'react';

export type Member = {
  member_id: string;
  name: string | null;
  phone: string;
  dob: string | null;
  gender: string | null;
  joining_date: string | null;
  package: string | null;
  expiry_date: string | null;
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
};

export type Expense = {
  id: number;
  expense_name: string | null;
  amount: number | null;
  expense_date: string | null;
};

export type GhostVaultEntry = {
  member_id: string;
  passcode: string;
};

export type AiPlan = {
  id: number;
  member_id: string;
  plan_type: string;
  title: string;
  plan_data: string;
  created_at: string;
};

const DB_KEY = 'rbf_ghost_vault_db_v1';

type DB = {
  members: Member[];
  pending_approvals: PendingApproval[];
  ghost_vault: GhostVaultEntry[];
  billing: Billing[];
  attendance_logs: AttendanceLog[];
  expenses: Expense[];
  ai_plans: AiPlan[];
  counters: { pending: number; billing: number; attendance: number; expense: number; ai_plan: number };
};

function seedDB(): DB {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };

  return {
    members: [
      { member_id: 'SRB92900001', name: 'Arjun Sharma', phone: '9876543210', dob: '1998-05-14', gender: 'Male', joining_date: fmt(today), package: 'Monthly', expiry_date: addDays(30) },
      { member_id: 'SRB92900002', name: 'Priya Verma', phone: '9876543211', dob: '2001-09-22', gender: 'Female', joining_date: fmt(today), package: 'Quarterly', expiry_date: addDays(90) },
    ],
    pending_approvals: [
      { id: 1, name: 'Rahul Singh', mobile: '9988776655', email: 'rahul@example.com', dob: '2000-03-10', address: null, status: 'PENDING', created_at: today.toISOString(), gender: 'Male', goal: 'Build muscle' },
    ],
    ghost_vault: [
      { member_id: 'SRB92900001', passcode: '1234' },
      { member_id: 'SRB92900002', passcode: '5678' },
    ],
    billing: [
      { id: 1, member_id: 'SRB92900001', package_name: 'Monthly', amount: 1500, discount: 0, paid: 1500, due: 0, payment_date: fmt(today), expiry_date: addDays(30) },
      { id: 2, member_id: 'SRB92900002', package_name: 'Quarterly', amount: 4000, discount: 500, paid: 3500, due: 0, payment_date: fmt(today), expiry_date: addDays(90) },
    ],
    attendance_logs: [
      { id: 1, member_id: 'SRB92900001', punch_in_time: today.toISOString(), punch_out_time: null, status: 'CHECKED_IN' },
    ],
    expenses: [
      { id: 1, expense_name: 'Equipment maintenance', amount: 2500, expense_date: fmt(today) },
    ],
    ai_plans: [],
    counters: { pending: 2, billing: 3, attendance: 2, expense: 2, ai_plan: 1 },
  };
}

function loadDB(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const seeded = seedDB();
      localStorage.setItem(DB_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw);
  } catch {
    const seeded = seedDB();
    localStorage.setItem(DB_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function saveDB(db: DB) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export function useDB() {
  const [db, setDb] = useState<DB>(() => loadDB());

  const refresh = useCallback(() => setDb(loadDB()), []);

  const update = useCallback((mutator: (db: DB) => void) => {
    setDb(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as DB;
      mutator(next);
      saveDB(next);
      return next;
    });
  }, []);

  return { db, refresh, update };
}

export function resetDB() {
  localStorage.removeItem(DB_KEY);
  loadDB();
}

export function usePolling(callback: () => void, intervalMs: number) {
  useEffect(() => {
    const timer = window.setInterval(callback, intervalMs);
    return () => window.clearInterval(timer);
  }, [callback, intervalMs]);
}
