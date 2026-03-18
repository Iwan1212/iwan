import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import DataTable from '../components/DataTable';
import RefreshButton from '../components/RefreshButton';

interface ErrorEntry {
  id?: number;
  source: string;
  message: string;
  details: string | null;
  created_at: string;
}

export default function Errors() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['errors'],
    queryFn: () => apiGet<ErrorEntry[]>('/errors'),
  });

  if (isLoading) return <p className="text-neutral-500">Ladowanie...</p>;

  const columns = [
    {
      key: 'created_at',
      header: 'Timestamp',
      render: (row: ErrorEntry) => new Date(row.created_at).toLocaleString('pl-PL'),
    },
    { key: 'source', header: 'Source' },
    { key: 'message', header: 'Message' },
    {
      key: 'details',
      header: 'Details',
      render: (row: ErrorEntry) => (
        <span className="text-xs text-neutral-600 max-w-xs truncate block">{row.details ?? '-'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{data?.length ?? 0} recent errors</p>
        <RefreshButton onClick={() => refetch()} loading={isFetching} />
      </div>
      <div className="bg-neutral-0 rounded-lg shadow-sm overflow-hidden">
        <DataTable columns={columns} data={data ?? []} />
      </div>
    </div>
  );
}
