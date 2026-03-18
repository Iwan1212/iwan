import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      setError('Podaj token API');
      return;
    }

    // Weryfikacja tokena — próba zapytania /api/health (nie wymaga auth)
    // i /api/config (wymaga auth) dla walidacji
    try {
      const res = await fetch('/api/scheduler/jobs', {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (res.status === 403 || res.status === 401) {
        setError('Nieprawidlowy token');
        return;
      }
      localStorage.setItem('iwan_token', token.trim());
      navigate('/');
    } catch {
      setError('Nie mozna polaczyc z API');
    }
  }

  return (
    <div className="min-h-screen bg-beige-lighter flex items-center justify-center p-4">
      <div className="bg-neutral-0 rounded-lg shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900" style={{ fontFamily: "'Inter', sans-serif" }}>
            Iwan
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Admin Dashboard</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            API Token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => { setToken(e.target.value); setError(''); }}
            className="w-full px-3 py-2 border border-neutral-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue focus:border-blue"
            placeholder="Wklej token..."
            autoFocus
          />
          {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          <button
            type="submit"
            className="w-full mt-4 px-4 py-2.5 bg-green text-green-darker font-medium text-sm rounded hover:bg-green-light transition-colors"
          >
            Zaloguj
          </button>
        </form>
      </div>
    </div>
  );
}
