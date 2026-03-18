import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Health from './pages/Health';
import Scheduler from './pages/Scheduler';
import Errors from './pages/Errors';
import Cache from './pages/Cache';
import Channels from './pages/Channels';
import DealDigests from './pages/DealDigests';
import Workforce from './pages/Workforce';
import Config from './pages/Config';

function isAuthenticated(): boolean {
  return !!localStorage.getItem('iwan_token');
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Health />} />
        <Route path="scheduler" element={<Scheduler />} />
        <Route path="errors" element={<Errors />} />
        <Route path="cache" element={<Cache />} />
        <Route path="channels" element={<Channels />} />
        <Route path="deals" element={<DealDigests />} />
        <Route path="workforce" element={<Workforce />} />
        <Route path="config" element={<Config />} />
      </Route>
    </Routes>
  );
}
