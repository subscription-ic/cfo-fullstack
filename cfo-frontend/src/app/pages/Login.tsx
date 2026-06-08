import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { TrendingUp, Lock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { login } from '../utils/api';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const u = username.trim();
    const p = password;
    if (!u || !p) {
      setFormError('Please enter both username and password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(u, p);
      if (u.toLowerCase() === 'admin') {
        localStorage.setItem('isAdmin', 'true');
      } else {
        localStorage.removeItem('isAdmin');
      }
      toast.success('Signed in');
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      const isUnauthorized =
        /401|unauthorized|invalid credentials|not authenticated/i.test(message);
      setFormError(
        isUnauthorized
          ? 'Invalid username or password. Check your credentials and try again.'
          : message,
      );
      toast.error('Could not sign in', { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#C00000] via-[#C00000] to-[#C00000] p-6">
      <Card className="w-full max-w-md shadow-2xl border-[#C00000]">
        <CardContent className="pt-8 pb-8 px-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-[#C00000] flex items-center justify-center">
                <TrendingUp className="w-9 h-9 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-semibold text-[#C00000] mb-2">
              Earnings Call Companion
            </h1>
            <p className="text-slate-600 text-sm">
              Secure access to earnings intelligence
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5" noValidate>
            {formError && (
              <div
                role="alert"
                aria-live="polite"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
              >
                {formError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-[#C00000] font-medium">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setFormError(null);
                }}
                className="border-[#d4dce6] focus:border-[#C00000] focus:ring-[#C00000]"
                autoComplete="username"
                disabled={submitting}
                aria-invalid={!!formError}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#C00000] font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFormError(null);
                }}
                className="border-[#d4dce6] focus:border-[#C00000] focus:ring-[#C00000]"
                autoComplete="current-password"
                disabled={submitting}
                aria-invalid={!!formError}
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#C00000] hover:bg-[#C00000] text-white h-11 text-base font-medium mt-6"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Lock className="w-4 h-4 mr-2" />
              )}
              Login
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#d4dce6]">
            <div className="flex items-start gap-2 text-xs text-slate-600">
              <Lock className="w-3 h-3 text-[#C00000] mt-0.5 flex-shrink-0" />
              <p>
                Dev sign-in: use the credentials configured on the API (default{' '}
                <code className="text-[#C00000]">admin</code> /{' '}
                <code className="text-[#C00000]">admin</code>).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
