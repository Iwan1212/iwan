import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import RefreshButton from '../components/RefreshButton';
import type { CacheStats } from '@iwan/shared';

export default function Cache() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['cache-stats'],
    queryFn: () => apiGet<CacheStats>('/cache/stats'),
  });

  if (isLoading) return <p className="text-neutral-500">Ladowanie...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">Redis Cache</h3>
        <RefreshButton onClick={() => refetch()} loading={isFetching} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Status">
          <StatusBadge status={data?.connected ? 'ok' : 'error'} label={data?.connected ? 'Connected' : 'Disconnected'} />
        </Card>
        <Card label="Memory Usage">
          <span className="text-xl font-semibold text-neutral-900">{data?.usedMemory ?? '-'}</span>
        </Card>
        <Card label="Key Count">
          <span className="text-xl font-semibold text-neutral-900">{data?.keyCount ?? 0}</span>
        </Card>
        <Card label="Connected Clients">
          <span className="text-xl font-semibold text-neutral-900">{data?.connectedClients ?? 0}</span>
        </Card>
      </div>

      <div className="bg-neutral-0 rounded-lg shadow-sm p-5">
        <p className="text-xs text-neutral-500 mb-2 uppercase tracking-wide">Redis Uptime</p>
        <span className="text-sm text-neutral-700">
          {data?.uptimeSeconds ? `${Math.floor(data.uptimeSeconds / 86400)}d ${Math.floor((data.uptimeSeconds % 86400) / 3600)}h` : '-'}
        </span>
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
