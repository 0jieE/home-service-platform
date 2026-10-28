import { z } from 'zod';

const trimmed = (label: string, max = 150) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .regex(/^(\+?63|0)9\d{9}$/, 'Use a PH mobile number, e.g. 09171234567');

export const optionalPhoneSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^(\+?63|0)9\d{9}$/.test(v), 'Use a PH mobile number, e.g. 09171234567');

/** Mirrors Django's default validators as far as the client can (length, not all-numeric). */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((v) => !/^\d+$/.test(v), 'Password cannot be entirely numeric');

export const pointSchema = z.object({ lat: z.number(), lng: z.number() });

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email')),
  password: z.string().min(1, 'Password is required'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    first_name: trimmed('First name', 150),
    last_name: trimmed('Last name', 150),
    email: z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email')),
    phone: phoneSchema,
    password: passwordSchema,
    confirm_password: z.string().min(1, 'Please confirm your password'),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  })
  .refine((v) => !v.email || !v.password || v.password.toLowerCase() !== v.email.toLowerCase(), {
    path: ['password'],
    message: 'Password is too similar to your email',
  });
export type RegisterValues = z.infer<typeof registerSchema>;

export const activateSchema = z
  .object({
    email: z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email')),
    activation_code: z
      .string()
      .trim()
      .min(1, 'Activation code is required')
      .transform((v) => v.toUpperCase()),
    password: passwordSchema,
    confirm_password: z.string().min(1, 'Please confirm your password'),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  });
export type ActivateValues = z.input<typeof activateSchema>;

export const changePasswordSchema = z
  .object({
    old_password: z.string().min(1, 'Current password is required'),
    new_password: passwordSchema,
    confirm_password: z.string().min(1, 'Please confirm your password'),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const customerProfileSchema = z.object({
  first_name: trimmed('First name'),
  last_name: trimmed('Last name'),
  phone: phoneSchema,
  default_address: z.string().trim().max(255, 'Address is too long'),
  default_location: pointSchema.nullable(),
});
export type CustomerProfileValues = z.infer<typeof customerProfileSchema>;

export const technicianProfileSchema = z.object({
  bio: z.string().trim().max(1000, 'Bio must be at most 1000 characters'),
  phone: phoneSchema,
  years_experience: z
    .number({ error: 'Enter a number of years' })
    .int('Use whole years')
    .min(0, 'Cannot be negative')
    .max(60, 'Enter at most 60 years'),
  address: trimmed('Address', 255),
  location: pointSchema.nullable().refine((v) => v !== null, 'Set your operating location on the map'),
  service_category_ids: z.array(z.number()).min(1, 'Choose at least one specialization'),
});
export type TechnicianProfileValues = z.input<typeof technicianProfileSchema>;

/** Reason that is required (cancel an accepted booking, dispute, reject). */
export const requiredReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Please give a reason (at least 5 characters)')
    .max(500, 'Keep it under 500 characters'),
});
export const optionalReasonSchema = z.object({
  reason: z.string().trim().max(500, 'Keep it under 500 characters'),
});
export type ReasonValues = z.infer<typeof optionalReasonSchema>;

export const reviewSchema = z.object({
  rating: z
    .number({ error: 'Choose a rating' })
    .int()
    .min(1, 'Choose a rating from 1 to 5 stars')
    .max(5, 'Choose a rating from 1 to 5 stars'),
  comment: z.string().trim().max(1000, 'Keep it under 1000 characters'),
});
export type ReviewValues = z.infer<typeof reviewSchema>;

export const bookingNotesSchema = z.object({
  notes: z.string().trim().max(500, 'Keep notes under 500 characters'),
});

export const bookingFormSchema = z.object({
  category_id: z.number({ error: 'Choose a service' }).int().positive('Choose a service'),
  date: z.string().min(1, 'Choose a date'),
  time: z.string().min(1, 'Choose a start time'),
  location: pointSchema.nullable().refine((v) => v !== null, 'Choose the service location'),
  address: trimmed('Address', 255),
  notes: z.string().trim().max(500, 'Keep notes under 500 characters'),
});
export type BookingFormValues = z.input<typeof bookingFormSchema>;

export const findSchema = z.object({
  category_id: z.number({ error: 'Choose a service' }).int().positive('Choose a service'),
  location: pointSchema.nullable().refine((v) => v !== null, 'Choose the service location'),
  address: z.string().trim(),
  date: z.string().min(1, 'Choose a date'),
  time: z.string().min(1, 'Choose a start time'),
});
export type FindValues = z.input<typeof findSchema>;

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time');

export const slotSchema = z
  .object({
    date: z.string().min(1, 'Choose a date'),
    start_time: hhmm,
    end_time: hhmm,
    state: z.enum(['available', 'unavailable']),
  })
  .refine((v) => v.end_time > v.start_time, { path: ['end_time'], message: 'End must be after start' });
export type SlotValues = z.infer<typeof slotSchema>;

export const generateScheduleSchema = z
  .object({
    weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Choose at least one weekday'),
    start_time: hhmm,
    end_time: hhmm,
    from: z.string().min(1, 'Choose a start date'),
    to: z.string().min(1, 'Choose an end date'),
  })
  .refine((v) => v.end_time > v.start_time, { path: ['end_time'], message: 'End must be after start' })
  .refine((v) => !v.from || !v.to || v.to >= v.from, {
    path: ['to'],
    message: 'End date must be on or after start date',
  });
export type GenerateScheduleValues = z.infer<typeof generateScheduleSchema>;

export const applicationSchema = z.object({
  first_name: trimmed('First name'),
  last_name: trimmed('Last name'),
  email: z.string().trim().min(1, 'Email is required').pipe(z.email('Enter a valid email')),
  phone: phoneSchema,
  address: trimmed('Address', 255),
  requested_category_ids: z.array(z.number()).min(1, 'Choose at least one category'),
  notes: z.string().trim().max(1000, 'Keep notes under 1000 characters'),
});
export type ApplicationValues = z.infer<typeof applicationSchema>;

export const verificationSchema = z.object({
  credential_type: trimmed('Credential type', 120),
  method: z.enum(['official_portal', 'issuing_institution', 'in_person_inspection'], {
    error: 'Choose a method',
  }),
  outcome: z.enum(['verified', 'not_verified', 'inconclusive'], { error: 'Choose an outcome' }),
  checked_on: z.string().min(1, 'Choose the date checked'),
  notes: z.string().trim().max(1000, 'Keep notes under 1000 characters'),
});
export type VerificationValues = z.infer<typeof verificationSchema>;

export const categorySchema = z.object({
  name: trimmed('Name', 100),
  description: z.string().trim().max(500, 'Keep it under 500 characters'),
  icon: z.string().trim().max(50, 'Keep it under 50 characters'),
  is_active: z.boolean(),
});
export type CategoryValues = z.infer<typeof categorySchema>;

export const resolveDisputeSchema = z.object({
  decision: z.enum(['completed', 'cancelled', 'return_in_progress'], { error: 'Choose a decision' }),
  admin_notes: z
    .string()
    .trim()
    .min(5, 'Record the reason for the decision (at least 5 characters)')
    .max(1000),
});
export type ResolveDisputeValues = z.infer<typeof resolveDisputeSchema>;

const EPS = 1e-9;
export const recSettingsSchema = z
  .object({
    w_p: z
      .number({ error: 'Enter a number' })
      .min(0, 'Must be between 0 and 1')
      .max(1, 'Must be between 0 and 1'),
    w_r: z
      .number({ error: 'Enter a number' })
      .min(0, 'Must be between 0 and 1')
      .max(1, 'Must be between 0 and 1'),
    d0_km: z
      .number({ error: 'Enter a number' })
      .gt(0, 'Must be greater than 0')
      .max(50, 'Must be at most 50 km'),
    no_rating_q: z
      .number({ error: 'Enter a number' })
      .min(0, 'Must be between 0 and 1')
      .max(1, 'Must be between 0 and 1'),
    is_frozen: z.boolean(),
  })
  .refine((v) => Math.abs(v.w_p + v.w_r - 1) < 1e-6 + EPS, {
    path: ['w_r'],
    message: 'Weights must add up to exactly 1',
  });
export type RecSettingsValues = z.infer<typeof recSettingsSchema>;
