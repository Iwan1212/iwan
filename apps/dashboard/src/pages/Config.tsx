import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import RefreshButton from '../components/RefreshButton';

export default function Config() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['config'],
    queryFn: () => apiGet<Record<string, string | undefined>>('/config'),
  });

  if (isLoading) return <p className="text-neutral-500">Ladowanie...</p>;

  const entries = Object.entries(data ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">Feature flags and configuration (read-only)</p>
        <RefreshButton onClick={() => refetch()} loading={isFetching} />
      </div>
      <div className="bg-neutral-0 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-darker text-white">
              <th className="px-4 py-3 text-left font-medium">Key</th>
              <th className="px-4 py-3 text-left font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key} className="border-b border-neutral-100">
                <td className="px-4 py-3 font-mono text-xs">{key}</td>
                <td className="px-4 py-3">
                  {value === 'true' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green text-green-darker">enabled</span>
                  ) : value === 'false' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-200 text-neutral-700">disabled</span>
                  ) : (
                    <span className="text-neutral-700">{value ?? <span className="text-neutral-400">not set</span>}</span>
                  )}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-8 text-center text-neutral-500">No config available</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
