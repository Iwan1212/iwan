import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import DataTable from '../components/DataTable';
import RefreshButton from '../components/RefreshButton';

interface DigestEntry {
  id?: number;
  channel_id?: string;
  deal_id?: number;
  last_ts?: string;
  content_hash?: string;
  updated_at?: string;
}

export default function DealDigests() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['deal-digests'],
    queryFn: () => apiGet<DigestEntry[]>('/deals/digests'),
  });

  if (isLoading) return <p className="text-neutral-500">Ladowanie...</p>;

  const columns = [
    { key: 'channel_id', header: 'Channel' },
    {
      key: 'deal_id',
      header: 'Deal ID',
      render: (row: DigestEntry) => String(row.deal_id ?? '-'),
    },
    {
      key: 'last_ts',
      header: 'Last TS',
      render: (row: DigestEntry) => row.last_ts ?? '-',
    },
    {
      key: 'content_hash',
      header: 'Hash',
      render: (row: DigestEntry) => (
        <span className="text-xs font-mono text-neutral-600">{row.content_hash?.slice(0, 12) ?? '-'}</span>
      ),
    },
    {
      key: 'updated_at',
      header: 'Updated',
      render: (row: DigestEntry) => row.updated_at ? new Date(row.updated_at).toLocaleString('pl-PL') : '-',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{data?.length ?? 0} digest entries</p>
        <RefreshButton onClick={() => refetch()} loading={isFetching} />
      </div>
      <div className="bg-neutral-0 rounded-lg shadow-sm overflow-hidden">
        <DataTable columns={columns} data={data ?? []} />
      </div>
    </div>
  );
}
