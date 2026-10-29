import { Link } from 'react-router';
import { BadgeCheck, MapPin, Ruler, ShieldCheck, Star } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { useConfigValues } from '@/api/config';
import { formatWeight } from '@/lib/format';

const STEPS = [
  {
    title: 'Choose a service',
    text: 'Plumbing, electrical, aircon, appliance repair and more.',
  },
  {
    title: 'Set your location',
    text: 'Search your address, use your phone’s location, or drop a pin inside Kidapawan City.',
  },
  {
    title: 'Pick a date and time',
    text: 'Only technicians free for the whole appointment are shown.',
  },
  {
    title: 'Compare and book',
    text: 'See a ranked list with distance and ratings, then send a request. The technician accepts or declines.',
  },
];

export function LandingPage() {
  const { settings } = useConfigValues();
  const wp = settings?.w_p ?? 0.5;
  const wr = settings?.w_r ?? 0.5;
  const d0 = settings?.d0_km ?? 1;
  return (
    <div>
      <section className="contours relative overflow-hidden bg-pine-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-12 pb-16 sm:px-6 md:grid-cols-[1.15fr_1fr] md:items-center md:pt-20 md:pb-24">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-sun-300">
              <MapPin className="size-4" aria-hidden="true" /> Serving Kidapawan City, at the foot of Mt. Apo
            </p>
            <h1 className="text-[2.5rem] leading-[1.02] font-extrabold tracking-[-0.03em] text-white sm:text-[3.5rem] lg:text-[4rem]">
              Find a nearby, well‑rated technician. Book in minutes.
            </h1>
            <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-white/75">
              Tell us what you need, where, and when. We recommend approved technicians who are free at that
              time, ranked by how close they are and how customers rated them. You choose who to book —
              nothing is assigned automatically.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className={buttonClasses('sun', 'lg')}>
                Create a customer account
              </Link>
              <Link to="/login" className={buttonClasses('onDark', 'lg')}>
                Log in
              </Link>
            </div>
            <p className="mt-6 max-w-xl text-sm text-white/60">
              Are you a technician? Apply in person at the administrator’s office. Once approved you’ll
              receive an activation code —{' '}
              <Link to="/activate" className="font-semibold text-white underline underline-offset-4">
                activate your account here
              </Link>
              .
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 text-slate-900 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)] sm:p-8">
            <h2 className="text-xl font-bold">Booking takes four steps</h2>
            <ol className="mt-6">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < STEPS.length - 1 && (
                    <span
                      className="absolute top-10 bottom-1 left-[1.1rem] w-px bg-slate-200"
                      aria-hidden="true"
                    />
                  )}
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pine-900 font-display text-base font-bold text-sun-400">
                    {i + 1}
                  </span>
                  <div className="pt-1">
                    <h3 className="text-base font-semibold">{s.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <div className="grid gap-10 md:grid-cols-[1fr_1.4fr] md:gap-16">
          <div>
            <h2 className="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
              How recommendations work, in plain words
            </h2>
            <p className="mt-4 text-slate-600">
              First we keep only technicians who can actually do the job: approved and active, offering the
              service you picked, located inside Kidapawan City, and free for your whole appointment without
              clashing with jobs they already accepted. Then each one gets a score from 0 to 1.
            </p>
          </div>

          <div>
            <p
              className="rounded-2xl bg-white px-5 py-6 font-display text-xl leading-snug font-semibold text-slate-900 ring-1 ring-slate-200 sm:px-7 sm:text-2xl"
              aria-label={`Overall score equals closeness times ${formatWeight(wp)} plus rating times ${formatWeight(wr)}`}
            >
              Overall = <span className="text-brand-700">closeness</span> × {formatWeight(wp)} +{' '}
              <span className="text-brand-700">rating</span> × {formatWeight(wr)}
            </p>
            <dl className="mt-8 grid gap-8 sm:grid-cols-2">
              <div>
                <dt className="flex items-center gap-2 font-display text-lg font-semibold">
                  <Ruler className="size-5 text-brand-600" aria-hidden="true" /> Closeness
                </dt>
                <dd className="mt-2 text-sm text-slate-600">
                  Nearer is better. A technician {d0} km away scores 0.50, right next door scores close to 1.
                  This is straight-line distance on the map — not road distance or travel time.
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 font-display text-lg font-semibold">
                  <Star className="size-5 text-brand-600" aria-hidden="true" /> Customer ratings
                </dt>
                <dd className="mt-2 text-sm text-slate-600">
                  The average star rating from completed jobs, turned into 0–1 (1 star = 0, 5 stars = 1).
                  Technicians with no reviews yet get a neutral 0.50 and are labelled “No ratings yet”.
                </dd>
              </div>
            </dl>
            <p className="mt-8 text-sm text-slate-600">
              Ties go to the nearer technician. Every result shows this breakdown, so you can see why someone
              ranks where they do.
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <div className="flex items-start gap-3 rounded-2xl bg-brand-100/70 p-5 text-sm text-brand-950">
            <BadgeCheck className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden="true" />
            <p>
              <strong>Credential checks are shown separately.</strong> The administrator records how each
              technician’s credentials (e.g. TESDA certificates) were verified. You’ll see that as a
              “Credentials verified” badge, but it does not change the score.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl bg-white p-5 text-sm text-slate-700 ring-1 ring-slate-200">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden="true" />
            <p>
              A booking starts as a <strong>request</strong>. It is reserved only when the technician accepts.
              After the work, the technician asks you to confirm completion; if something is wrong you can
              open a dispute that an administrator resolves.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
