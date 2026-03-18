// Komponent statusowy z kolorami Momentum
interface Props {
  status: 'ok' | 'warning' | 'error' | 'idle';
  label?: string;
}

const styles: Record<string, string> = {
  ok: 'bg-green text-green-darker',
  warning: 'bg-sand text-sand-darker',
  error: 'bg-blue-dark text-white',
  idle: 'bg-neutral-200 text-neutral-700',
};

export default function StatusBadge({ status, label }: Props) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? styles.idle}`}>
      {label ?? status}
    </span>
  );
}
