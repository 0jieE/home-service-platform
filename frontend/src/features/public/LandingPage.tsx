import { Link } from 'react-router';
import {
  BadgeCheck,
  CalendarCheck,
  ClipboardList,
  MapPin,
  Ruler,
  ShieldCheck,
  Star,
  Wrench,
} from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { useConfigValues } from '@/api/config';
import { formatWeight } from '@/lib/format';

const STEPS = [
  { icon: Wrench, title: 'Choose a service', text: 'Plumbing, electrical, aircon, appliance repair and more.' },
  { icon: MapPin, title: 'Set your location', text: 'Search your address, use your phone’s location, or drop a pin inside Kidapawan City.' },
  { icon: CalendarCheck, title: 'Pick a date and time', text: 'Only technicians free for the whole appointment are shown.' },
  { icon: ClipboardList, title: 'Compare and book', text: 'See a ranked list with distance and ratings, then send a request. The technician accepts or declines.' },
];

export function LandingPage() {
  const { settings } = useConfigValues();
  const wp = settings?.w_p ?? 0.5;
  const wr = settings?.w_r ?? 0.5;
  const d0 = settings?.d0_km ?? 1;
  return (
    <div>
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:items-center md:py-20">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-800 ring-1 ring-brand-200">
              <MapPin className="size-3.5" /> Serving Kidapawan City
            </p>
            <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
              Find a nearby, well-rated home service technician — and book in minutes.
            </h1>
            <p className="mt-4 text-base text-slate-600">
              Tell us what you need, where, and when. We recommend approved technicians who are free at that time,
              ranked by how close they are and how customers rated them. You choose who to book — nothing is assigned
              automatically.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/register" className={buttonClasses('primary', 'lg')}>
                Create a customer account
              </Link>
              <Link to="/login" className={buttonClasses('outline', 'lg')}>
                Log in
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Are you a technician? Apply in person at the administrator’s office. Once approved you’ll receive an
              activation code —{' '}
              <Link to="/activate" className="font-medium text-brand-700 underline underline-offset-2">
                activate your account here
              </Link>
              .
            </p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <s.icon className="size-5 text-brand-700" aria-hidden="true" />
                </div>
                <h2 className="font-semibold">{s.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight">How recommendations work, in plain words</h2>
        <p className="mt-2 max-w-3xl text-slate-600">
          First we keep only technicians who can actually do the job: approved and active, offering the service you
          picked, located inside Kidapawan City, and free for your whole appointment without clashing with jobs they
          already accepted. Then each one gets a score from 0 to 1:
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <Ruler className="mb-2 size-6 text-brand-700" aria-hidden="true" />
            <h3 className="font-semibold">Closeness</h3>
            <p className="mt-1 text-sm text-slate-600">
              Nearer is better. A technician {d0} km away scores 0.50, right next door scores close to 1. This is
              straight-line distance on the map — not road distance or travel time.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <Star className="mb-2 size-6 text-brand-700" aria-hidden="true" />
            <h3 className="font-semibold">Customer ratings</h3>
            <p className="mt-1 text-sm text-slate-600">
              The average star rating from completed jobs, turned into 0–1 (1 star = 0, 5 stars = 1). Technicians
              with no reviews yet get a neutral 0.50 and are labelled “No ratings yet”.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <ClipboardList className="mb-2 size-6 text-brand-700" aria-hidden="true" />
            <h3 className="font-semibold">Overall score</h3>
            <p className="mt-1 text-sm text-slate-600">
              Overall = closeness × {formatWeight(wp)} + rating × {formatWeight(wr)}. Ties go to the nearer
              technician. Every result shows this breakdown, so you can see why someone ranks where they do.
            </p>
          </div>
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <BadgeCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            <strong>Credential checks are shown separately.</strong> The administrator records how each technician’s
            credentials (e.g. TESDA certificates) were verified. You’ll see that as a “Credentials verified” badge,
            but it does not change the score.
          </p>
        </div>
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden="true" />
          <p>
            A booking starts as a <strong>request</strong>. It is reserved only when the technician accepts. After the
            work, the technician asks you to confirm completion; if something is wrong you can open a dispute that an
            administrator resolves.
          </p>
        </div>
      </section>
    </div>
  );
}
