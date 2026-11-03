import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOf, defaultRenewal } from '../../src/components/PackagePicker';

// names exactly as they appear in the gym's price list
const NAMES: Record<string, string[]> = {
  new: ['New Member - 1 Month (Monthly)', 'New Member - 2 Months (Starter)', 'New Member - 9 Months (9-Month Pro)', 'New Member - 12 Months (Annual)'],
  renewal: ['Renewal - 1 Month (Monthly)', 'Renewal - 3 Months (Quarterly)', 'Renewal - 6 Months (Half-Yearly)', 'Renewal - 12 Months (Annual)'],
  student: ['Student (School/College ID) - 1 Month', 'Student (School/College ID) - 12 Months'],
  women: ['Women (4-6 PM) - 3 Months'],
  senior: ['Senior (55+) - 6 Months'],
  kids: ['Kids (Below 15) - 9 Months'],
  couple: ['Couples (Husband-Wife) - 1 Month', 'Couples (Husband-Wife) - 12 Months'],
  duo: ['Duo (2 Friends) - 3 Months'],
};

test('every package name falls in the right group', () => {
  for (const [group, names] of Object.entries(NAMES)) for (const n of names) assert.equal(groupOf(n), group, n);
});
test('capital letters and extra spaces do not matter', () => {
  assert.equal(groupOf('  renewal - 1 month'), 'renewal');
  assert.equal(groupOf('STUDENT (school) - 1 Month'), 'student');
});
test('a new kind of package still shows up (in "other"), and Staff packages get their own group', () => {
  assert.equal(groupOf('Corporate Special - 1 Month'), 'other');
  assert.equal(groupOf('Staff - 1 Month'), 'staff');
});
test('"Couple" must not swallow other words', () => {
  assert.equal(groupOf('Couplet Offer'), 'other');
});
test('a renewal starts on the shortest Renewal plan, never on a PT plan', () => {
  const pk = (id: string, name: string, m: number, category = 'Membership') => ({ id, name, price: 1, duration_months: m, category });
  const list = [pk('a', 'Personal Training - 1 Month', 1, 'PT'), pk('b', 'Renewal - 3 Months (Quarterly)', 3), pk('c', 'Renewal - 1 Month (Monthly)', 1), pk('d', 'New Member - 1 Month (Monthly)', 1)];
  assert.equal(defaultRenewal(list)?.id, 'c');
  assert.equal(defaultRenewal([pk('a', 'Personal Training - 1 Month', 1, 'PT'), pk('d', 'New Member - 1 Month (Monthly)', 1)])?.id, 'd');
});
