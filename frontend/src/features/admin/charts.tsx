import { useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

/** Single-series charts: one accent hue, recessive grid/axes, hover tooltip, table view for accessibility. */
const SERIES = '#0f766e';
const GRID = '#e2e8f0';
const AXIS = '#64748b';

export interface Datum {
  label: string;
  value: number;
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-800">{label}</p>
      <p className="text-slate-600">
        <span className="font-semibold text-slate-900 tabular-nums">{payload[0]!.value}</span> {unit}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  description,
  data,
  unit,
  children,
}: {
  title: string;
  description?: string;
  data: Datum[];
  unit: string;
  children: ReactNode;
}) {
  const [table, setTable] = useState(false);
  const empty = !data.length || data.every((d) => d.value === 0);
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          !empty && (
            <button
              type="button"
              onClick={() => setTable((t) => !t)}
              className="min-h-9 rounded-lg px-2 text-xs font-medium text-brand-700 hover:bg-brand-50"
              aria-pressed={table}
            >
              {table ? 'Show chart' : 'View as table'}
            </button>
          )
        }
      />
      <CardBody>
        {empty ? (
          <EmptyState
            title="No data yet"
            description="Bookings will appear here once customers start booking."
          />
        ) : table ? (
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase">
                <th className="py-1 font-semibold">Item</th>
                <th className="py-1 text-right font-semibold">{unit}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((d) => (
                <tr key={d.label}>
                  <td className="py-1.5 text-slate-700">{d.label}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{d.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div
            className="h-64"
            role="img"
            aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}
          >
            {children}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const axisProps = { stroke: AXIS, fontSize: 12, tickLine: false, axisLine: { stroke: GRID } } as const;

/** Horizontal bars: long category names stay readable without rotation. */
export function HBarCard({
  title,
  description,
  data,
  unit = 'bookings',
}: {
  title: string;
  description?: string;
  data: Datum[];
  unit?: string;
}) {
  return (
    <ChartCard title={title} description={description} data={data} unit={unit}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
          barCategoryGap="22%"
        >
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" allowDecimals={false} {...axisProps} />
          <YAxis type="category" dataKey="label" {...axisProps} width={150} tick={{ fontSize: 12 }} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip unit={unit} />} />
          <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function BarCard({
  title,
  description,
  data,
  unit = 'bookings',
}: {
  title: string;
  description?: string;
  data: Datum[];
  unit?: string;
}) {
  return (
    <ChartCard title={title} description={description} data={data} unit={unit}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="label"
            {...axisProps}
            interval={0}
            tick={{ fontSize: 11 }}
            height={48}
            angle={data.length > 5 ? -25 : 0}
            textAnchor={data.length > 5 ? 'end' : 'middle'}
          />
          <YAxis allowDecimals={false} {...axisProps} />
          <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip unit={unit} />} />
          <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function LineCard({
  title,
  description,
  data,
  unit = 'bookings',
}: {
  title: string;
  description?: string;
  data: Datum[];
  unit?: string;
}) {
  return (
    <ChartCard title={title} description={description} data={data} unit={unit}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axisProps} tick={{ fontSize: 11 }} minTickGap={16} />
          <YAxis allowDecimals={false} {...axisProps} />
          <Tooltip cursor={{ stroke: AXIS, strokeDasharray: '3 3' }} content={<ChartTooltip unit={unit} />} />
          <Line
            type="linear"
            dataKey="value"
            stroke={SERIES}
            strokeWidth={2}
            dot={{ r: 4, fill: SERIES, stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
