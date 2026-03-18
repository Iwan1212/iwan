// Przycisk ręcznego odświeżania z Momentum green CTA
interface Props {
  onClick: () => void;
  loading?: boolean;
}

export default function RefreshButton({ onClick, loading }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center px-3 py-1.5 bg-green text-green-darker text-sm font-medium rounded hover:bg-green-light transition-colors disabled:opacity-50"
    >
      {loading ? 'Odswiezam...' : 'Odswiez'}
    </button>
  );
}
