import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Landmark } from 'lucide-react';
import { EmailOtpForm } from '../components/EmailOtpForm';

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
  const [department, setDepartment] = useState('');

  return (
    <div className="flex flex-col justify-center min-h-screen p-6 relative">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft size={15} strokeWidth={2.25} />
        Switch role
      </button>

      <div className="max-w-[380px] w-full mx-auto">
        <div className="auth-badge auth-badge--municipal">
          <Landmark size={22} strokeWidth={2} />
        </div>
        <div className="eyebrow mb-3">MUNICIPAL ACCESS</div>

        <h1 className="font-display text-[26px] mb-2">Sign in to the triage queue</h1>
        <p className="text-[var(--text-muted)] text-sm mb-6">
          Same verified-email sign-in as the citizen side — pick a department to filter your
          queue, or leave it on all departments.
        </p>

        <label className="form-label">Department</label>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="form-input mb-6"
        >
          {DEPARTMENTS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>

        <EmailOtpForm
          role="municipal"
          department={department || null}
          onSuccess={() => navigate('/municipal/dashboard')}
        />
      </div>
    </div>
  );
}