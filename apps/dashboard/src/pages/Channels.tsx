import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import DataTable from '../components/DataTable';
import RefreshButton from '../components/RefreshButton';

interface ChannelInfo {
  channel: string;
  channel_name: string | null;
  count: number;
}

export default function Channels() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['channels'],
    queryFn: () => apiGet<ChannelInfo[]>('/channels'),
  });

  if (isLoading) return <p className="text-neutral-500">Ladowanie...</p>;

  const columns = [
    { key: 'channel', header: 'Channel ID' },
    {
      key: 'channel_name',
      header: 'Name',
      render: (row: ChannelInfo) => row.channel_name ?? '-',
    },
    {
      key: 'count',
      header: 'Messages',
      render: (row: ChannelInfo) => String(row.count),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{data?.length ?? 0} channels</p>
        <RefreshButton onClick={() => refetch()} loading={isFetching} />
      </div>
      <div className="bg-neutral-0 rounded-lg shadow-sm overflow-hidden">
        <DataTable columns={columns} data={data ?? []} />
      </div>
    </div>
  );
}
