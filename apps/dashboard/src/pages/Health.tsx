import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import RefreshButton from '../components/RefreshButton';
import type { HealthStatus } from '@iwan/shared';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Health() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthStatus>('/health'),
    refetchInterval: 30_000,
  });

  if (isLoading) return <p className="text-neutral-500">Ladowanie...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">Status Bota</h3>
        <RefreshButton onClick={() => refetch()} loading={isFetching} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Status">
          <StatusBadge status={data?.status === 'ok' ? 'ok' : data?.status === 'degraded' ? 'warning' : 'error'} label={data?.status ?? 'unknown'} />
        </Card>
        <Card label="Uptime">
          <span className="text-xl font-semibold text-neutral-900">{formatUptime(data?.uptime ?? 0)}</span>
        </Card>
        <Card label="Redis">
          <StatusBadge status={data?.redis ? 'ok' : 'error'} label={data?.redis ? 'Connected' : 'Disconnected'} />
        </Card>
        <Card label="Scheduled Jobs">
          <span className="text-xl font-semibold text-neutral-900">{data?.jobCount ?? 0}</span>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card label="Version">
          <span className="text-sm text-neutral-700">{data?.version ?? '-'}</span>
        </Card>
        <Card label="Last Check">
          <span className="text-sm text-neutral-700">{data?.timestamp ? new Date(data.timestamp).toLocaleString('pl-PL') : '-'}</span>
        </Card>
      </div>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-0 rounded-lg shadow-sm p-5">
      <p className="text-xs text-neutral-500 mb-2 uppercase tracking-wide">{label}</p>
      {children}
    </div>
  );
}
