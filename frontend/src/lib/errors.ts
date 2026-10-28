import { isAxiosError } from 'axios';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ErrorCode } from '@/types/api';

/** Friendly copy for business error codes (contract §0). The server `detail` is preferred when present. */
export const ERROR_COPY: Record<ErrorCode, string> = {
  outside_coverage: 'This location is outside Kidapawan City coverage.',
  no_eligible_technicians:
    'No technician is available for that service and time. Try another time or service.',
  technician_unavailable:
    'This technician is no longer available for that time. Please pick another time or technician.',
  booking_conflict: 'That time overlaps another accepted job.',
  invalid_transition: 'This action is no longer possible because the booking status has changed.',
  reason_required: 'Please give a reason.',
  already_reviewed: 'You already reviewed this booking.',
  not_completed: 'You can review only after the job is confirmed as completed.',
  profile_incomplete: 'Your profile is incomplete. Complete it first.',
  application_not_approved: 'The application must be approved before creating an account.',
  account_exists: 'An account already exists for this application or email.',
  invalid_activation:
    'The email or activation code is invalid or has expired. Ask the administrator for a new code.',
  // additive codes (docs/CONTRACT_CHANGES.md 2026-10-29 02:50)
  account_not_approved: 'This technician account is not approved or not activated yet.',
  permission_denied: 'You do not have permission to do that.',
  settings_frozen: 'Recommendation settings are frozen. Unfreeze them first.',
  cannot_deactivate_self: 'You cannot deactivate your own account.',
};

export interface ApiErrorInfo {
  status?: number;
  code?: string;
  message: string;
  fieldErrors: Record<string, string>;
}

function firstString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length) return firstString(v[0]);
  if (v && typeof v === 'object') {
    // nested serializer errors, e.g. {"location": {"lat": ["..."]}}
    for (const inner of Object.values(v)) {
      const s = firstString(inner);
      if (s) return s;
    }
  }
  return undefined;
}

export function parseApiError(err: unknown): ApiErrorInfo {
  if (!isAxiosError(err)) {
    return { message: err instanceof Error ? err.message : 'Something went wrong.', fieldErrors: {} };
  }
  const status = err.response?.status;
  if (!err.response) {
    return { message: 'Cannot reach the server. Check your connection and try again.', fieldErrors: {} };
  }
  const data = err.response.data as unknown;
  const fieldErrors: Record<string, string> = {};
  let code: string | undefined;
  let message: string | undefined;

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    code = typeof obj.code === 'string' ? obj.code : undefined;
    const detail = firstString(obj.detail);
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'detail' || k === 'code') continue;
      const msg = firstString(v);
      if (msg) fieldErrors[k] = msg;
    }
    message = detail ?? fieldErrors.non_field_errors;
  } else if (Array.isArray(data)) {
    message = firstString(data);
  }
  if (code && code in ERROR_COPY && (!message || message.length > 200))
    message = ERROR_COPY[code as ErrorCode];
  if (!message) {
    if (status === 401) message = 'Please sign in again.';
    else if (status === 403) message = 'You do not have permission to do that.';
    else if (status === 404) message = 'Not found.';
    else if (Object.keys(fieldErrors).length) message = 'Please fix the highlighted fields.';
    else message = 'Something went wrong. Please try again.';
  }
  return { status, code, message, fieldErrors };
}

export function errorMessage(err: unknown): string {
  return parseApiError(err).message;
}

export function errorCode(err: unknown): string | undefined {
  return parseApiError(err).code;
}

/**
 * Maps DRF field errors onto React Hook Form fields. `aliases` maps API field
 * names to form field names. Returns a message to show at form level (or null
 * when every error landed on a field).
 */
export function applyApiErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
  aliases: Record<string, string> = {},
): string | null {
  const info = parseApiError(err);
  let unmapped: string | null = null;
  let mappedAny = false;
  for (const [apiField, msg] of Object.entries(info.fieldErrors)) {
    const formField = aliases[apiField] ?? apiField;
    if (fields.includes(formField)) {
      setError(formField as Path<T>, { type: 'server', message: msg });
      mappedAny = true;
    } else if (apiField !== 'non_field_errors') {
      unmapped = unmapped ?? `${apiField.replace(/_/g, ' ')}: ${msg}`;
    }
  }
  if (info.code || info.fieldErrors.non_field_errors || !mappedAny) return info.message;
  return unmapped;
}
