import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { Button } from '../components/Button';

const DEPARTMENTS = [
  { value: '', label: 'All departments (view everything)' },
  { value: 'Solid Waste Management', label: 'Solid Waste Management' },
  { value: 'Water Board', label: 'Water Board' },
  { value: 'Pollution Control Board', label: 'Pollution Control Board' },
  { value: 'Sewerage Board', label: 'Sewerage Board' },
  { value: 'General Municipal Office', label: 'General Municipal Office' },
];

export default function MunicipalLogin() {
  const navigate = useNavigate();
  const { session, setSession } = useSession();

  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');

  function continueToDashboard() {
    setSession({
      ...session,
      role: 'municipal',
      employeeId: employeeId.trim() || 'unverified',
      department: department || null,
    });
    navigate('/municipal/dashboard');
  }

  return (
    <div className="flex flex-col justify-center min-h-screen p-6 relative">
      <button
        className="absolute top-6 left-6 text-[var(--text-muted)] text-sm flex items-center gap-1 bg-transparent border-none cursor-pointer"
        onClick={() => navigate('/')}
      >
        ← switch role
      </button>

      <div className="max-w-[380px] w-full mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: 'var(--accent-live-dim)' }}
          >
            🏛️
          </div>
          <div className="eyebrow">MUNICIPAL ACCESS</div>
        </div>

        <h1 className="font-display text-[26px] mb-2">
          Sign in to the
          <br />
          triage queue
        </h1>
        <p className="text-[var(--text-muted)] text-sm mb-10">
          Auth isn't wired up yet — this is a placeholder that routes straight through, same as
          the citizen side. 🛠️
        </p>

        <div className="mb-5">
          <label className="text-[13px] font-semibold text-[var(--text-muted)] mb-2 block">
            Employee ID
          </label>
          <input
            type="text"
            placeholder="e.g. GHMC-4471"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none"
            style={{
              background: 'var(--bg-surface-raised)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          <p className="text-xs text-[var(--text-dim)] mt-2">
            Not validated yet — any value continues.
          </p>
        </div>

        <div className="mb-5">
          <label className="text-[13px] font-semibold text-[var(--text-muted)] mb-2 block">
            Department
          </label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none"
            style={{
              background: 'var(--bg-surface-raised)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <Button full onClick={continueToDashboard}>
          Enter dashboard 🚪
        </Button>
      </div>
    </div>
  );
}
