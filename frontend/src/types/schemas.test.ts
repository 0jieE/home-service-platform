import { describe, expect, it } from 'vitest';
import {
  activateSchema,
  generateScheduleSchema,
  passwordSchema,
  recSettingsSchema,
  registerSchema,
  requiredReasonSchema,
  resolveDisputeSchema,
  reviewSchema,
} from './schemas';

const firstMessage = (r: {
  success: boolean;
  error?: { issues: { message: string; path: PropertyKey[] }[] };
}) => (r.success ? null : r.error!.issues[0]!.message);

describe('password rules', () => {
  it('requires at least 8 characters', () => {
    expect(passwordSchema.safeParse('short1!').success).toBe(false);
    expect(passwordSchema.safeParse('Customer123!').success).toBe(true);
  });
  it('rejects entirely numeric passwords', () => {
    expect(firstMessage(passwordSchema.safeParse('12345678'))).toMatch(/numeric/);
  });
  it('register requires matching confirmation', () => {
    const base = {
      first_name: 'Ana',
      last_name: 'Cruz',
      email: 'ana@example.com',
      phone: '09171234567',
      password: 'Secret123!',
    };
    expect(registerSchema.safeParse({ ...base, confirm_password: 'Secret123!' }).success).toBe(true);
    const r = registerSchema.safeParse({ ...base, confirm_password: 'Other123!' });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.path).toEqual(['confirm_password']);
  });
  it('register validates email and PH mobile number', () => {
    const r = registerSchema.safeParse({
      first_name: 'Ana',
      last_name: 'Cruz',
      email: 'not-an-email',
      phone: '123',
      password: 'Secret123!',
      confirm_password: 'Secret123!',
    });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toContain('email');
    expect(paths).toContain('phone');
  });
  it('activation uppercases the code', () => {
    const r = activateSchema.safeParse({
      email: 'tech@demo.local',
      activation_code: ' k7p2-9qxm ',
      password: 'Tech1234!',
      confirm_password: 'Tech1234!',
    });
    expect(r.success && r.data.activation_code).toBe('K7P2-9QXM');
  });
});

describe('recommendation weights', () => {
  const base = { d0_km: 1, no_rating_q: 0.5, is_frozen: false };
  it('accepts weights that sum to 1', () => {
    expect(recSettingsSchema.safeParse({ ...base, w_p: 0.5, w_r: 0.5 }).success).toBe(true);
    expect(recSettingsSchema.safeParse({ ...base, w_p: 0.7, w_r: 0.3 }).success).toBe(true);
    expect(recSettingsSchema.safeParse({ ...base, w_p: 0.1 + 0.2, w_r: 0.7 }).success).toBe(true); // float noise
  });
  it('rejects weights that do not sum to 1', () => {
    const r = recSettingsSchema.safeParse({ ...base, w_p: 0.6, w_r: 0.5 });
    expect(r.success).toBe(false);
    expect(firstMessage(r)).toMatch(/add up to exactly 1/);
  });
  it('rejects out-of-range values and non-positive d0', () => {
    expect(recSettingsSchema.safeParse({ ...base, w_p: 1.5, w_r: -0.5 }).success).toBe(false);
    expect(recSettingsSchema.safeParse({ ...base, d0_km: 0, w_p: 0.5, w_r: 0.5 }).success).toBe(false);
  });
});

describe('required reasons', () => {
  it('rejects empty or whitespace reasons', () => {
    expect(requiredReasonSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(requiredReasonSchema.safeParse({ reason: '     ' }).success).toBe(false);
    expect(requiredReasonSchema.safeParse({ reason: 'Customer rescheduled' }).success).toBe(true);
  });
  it('dispute resolution needs a decision and notes', () => {
    expect(resolveDisputeSchema.safeParse({ decision: 'completed', admin_notes: '' }).success).toBe(false);
    expect(resolveDisputeSchema.safeParse({ decision: 'bogus', admin_notes: 'Checked photos' }).success).toBe(
      false,
    );
    expect(
      resolveDisputeSchema.safeParse({ decision: 'return_in_progress', admin_notes: 'Checked photos' })
        .success,
    ).toBe(true);
  });
});

describe('other forms', () => {
  it('review rating must be 1–5', () => {
    expect(reviewSchema.safeParse({ rating: 0, comment: '' }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 6, comment: '' }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 5, comment: '' }).success).toBe(true);
  });
  it('generated schedule needs weekdays and end after start', () => {
    const base = {
      weekdays: [0, 1],
      start_time: '08:00',
      end_time: '17:00',
      from: '2026-11-01',
      to: '2026-11-30',
    };
    expect(generateScheduleSchema.safeParse(base).success).toBe(true);
    expect(generateScheduleSchema.safeParse({ ...base, weekdays: [] }).success).toBe(false);
    expect(generateScheduleSchema.safeParse({ ...base, end_time: '07:00' }).success).toBe(false);
    expect(generateScheduleSchema.safeParse({ ...base, to: '2026-10-01' }).success).toBe(false);
  });
});
