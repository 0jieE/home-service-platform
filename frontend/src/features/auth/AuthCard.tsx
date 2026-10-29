import type { ReactNode } from 'react';

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative">
      {/* Pine band continuing the header; the card overlaps its lower edge. */}
      <div className="contours absolute inset-x-0 top-0 h-48 bg-pine-900 sm:h-64" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-md px-4 pt-8 pb-12 sm:pt-14 sm:pb-20">
        <div className="rounded-3xl bg-white p-6 shadow-[0_24px_48px_-24px_rgb(11_29_21/0.45)] ring-1 ring-slate-200/70 sm:p-8">
          <h1 className="text-[2rem] leading-tight font-bold">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-slate-600">{footer}</div>}
      </div>
    </div>
  );
}
