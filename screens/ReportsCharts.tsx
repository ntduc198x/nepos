import React from 'react';
import { TrendingUp, Utensils } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

interface HourlyPoint {
  label: string;
  amount: number;
}

interface TopItem {
  name: string;
  value: number;
}

interface ReportsChartsProps {
  hourlyData: HourlyPoint[];
  topItemsData: TopItem[];
  t: (key: string) => string;
  maskedFormatPrice: (value: number) => string;
}

export const ReportsCharts: React.FC<ReportsChartsProps> = ({
  hourlyData,
  topItemsData,
  t,
  maskedFormatPrice,
}) => {
  return (
    <div className="xl:col-span-2 space-y-6">
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <TrendingUp size={20} className="text-emerald-500" /> {t('Hourly')}
          </h3>
        </div>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgb(16, 185, 129)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="rgb(16, 185, 129)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                interval={3}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                tickFormatter={(val) => (val >= 1000 ? `${val / 1000}k` : val)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                itemStyle={{ color: 'var(--color-text-main)', fontSize: '12px', fontWeight: 'bold' }}
                labelStyle={{ color: 'var(--color-text-secondary)', fontSize: '10px', marginBottom: '4px' }}
                formatter={(val: number) => maskedFormatPrice(val)}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="rgb(16, 185, 129)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
          <Utensils size={20} className="text-orange-500" /> {t('Top Selling Items')}
        </h3>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topItemsData} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                axisLine={false}
                tickLine={false}
                width={120}
                tick={{ fontSize: 11, fill: 'var(--color-text-main)', fontWeight: 600 }}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-border)', opacity: 0.2 }}
                contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                itemStyle={{ color: 'var(--color-text-main)', fontSize: '12px', fontWeight: 'bold' }}
              />
              <Bar dataKey="value" barSize={20} radius={[0, 4, 4, 0]}>
                {topItemsData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? 'rgb(16, 185, 129)' : 'rgba(16, 185, 129, 0.6)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
