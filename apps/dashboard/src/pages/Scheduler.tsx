import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api/client';
import DataTable from '../components/DataTable';
import RefreshButton from '../components/RefreshButton';
import type { SchedulerJobInfo } from '@iwan/shared';

export default function Scheduler() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['scheduler-jobs'],
    queryFn: () => apiGet<SchedulerJobInfo[]>('/scheduler/jobs'),
  });

  const trigger = useMutation({
    mutationFn: (name: string) => apiPost(`/scheduler/jobs/${name}/trigger`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduler-jobs'] }),
  });

  if (isLoading) return <p className="text-neutral-500">Ladowanie...</p>;

  const columns = [
    { key: 'name', header: 'Job' },
    { key: 'expression', header: 'Cron' },
    {
      key: 'lastRun',
      header: 'Last Run',
      render: (row: SchedulerJobInfo) => row.lastRun ? new Date(row.lastRun).toLocaleString('pl-PL') : '-',
    },
    {
      key: 'lastDurationMs',
      header: 'Duration',
      render: (row: SchedulerJobInfo) => row.lastDurationMs != null ? `${row.lastDurationMs}ms` : '-',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: SchedulerJobInfo) => (
        <button
          onClick={() => trigger.mutate(row.name)}
          disabled={trigger.isPending}
          className="px-2 py-1 text-xs bg-green text-green-darker rounded hover:bg-green-light transition-colors disabled:opacity-50"
        >
          Run now
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{data?.length ?? 0} jobs registered</p>
        <RefreshButton onClick={() => refetch()} loading={isFetching} />
      </div>
      <div className="bg-neutral-0 rounded-lg shadow-sm overflow-hidden">
        <DataTable columns={columns} data={data ?? []} />
      </div>
    </div>
  );
}
