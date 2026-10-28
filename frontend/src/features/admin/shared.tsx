import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { ApplicationStatus, VerificationMethod, VerificationOutcome } from '@/types/api';

export const APP_STATUS_LABEL: Record<ApplicationStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
};
const APP_TONE: Record<ApplicationStatus, BadgeTone> = {
  submitted: 'amber',
  under_review: 'blue',
  approved: 'green',
  rejected: 'red',
};

export function AppStatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge tone={APP_TONE[status]}>{APP_STATUS_LABEL[status]}</Badge>;
}

export const METHOD_LABEL: Record<VerificationMethod, string> = {
  official_portal: 'Official portal (e.g. TESDA online)',
  issuing_institution: 'Confirmed with issuing institution',
  in_person_inspection: 'In-person inspection of document',
};

export const OUTCOME_LABEL: Record<VerificationOutcome, string> = {
  verified: 'Verified',
  not_verified: 'Not verified',
  inconclusive: 'Inconclusive',
};
const OUTCOME_TONE: Record<VerificationOutcome, BadgeTone> = {
  verified: 'green',
  not_verified: 'red',
  inconclusive: 'amber',
};

export function OutcomeBadge({ outcome }: { outcome: VerificationOutcome }) {
  return <Badge tone={OUTCOME_TONE[outcome]}>{OUTCOME_LABEL[outcome]}</Badge>;
}
