import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { TrendingUp, Lock } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.toLowerCase() === 'admin') {
      localStorage.setItem('isAdmin', 'true');
    } else {
      localStorage.removeItem('isAdmin');
    }
    // Simple authentication - navigate to dashboard
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#8B1319] via-[#C11B22] to-[#ED232A] p-6">
      <Card className="w-full max-w-md shadow-2xl border-[#C11B22]">
        <CardContent className="pt-8 pb-8 px-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-[#ED232A] flex items-center justify-center">
                <TrendingUp className="w-9 h-9 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-semibold text-[#8B1319] mb-2">
              Earnings Call Companion
            </h1>
            <p className="text-slate-600 text-sm">
              Secure access to earnings intelligence
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-[#8B1319] font-medium">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-[#d4dce6] focus:border-[#ED232A] focus:ring-[#ED232A]"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[#8B1319] font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-[#d4dce6] focus:border-[#ED232A] focus:ring-[#ED232A]"
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full bg-[#ED232A] hover:bg-[#C11B22] text-white h-11 text-base font-medium mt-6"
            >
              <Lock className="w-4 h-4 mr-2" />
              Login
            </Button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 pt-6 border-t border-[#d4dce6]">
            <div className="flex items-start gap-2 text-xs text-slate-600">
              <Lock className="w-3 h-3 text-[#ED232A] mt-0.5 flex-shrink-0" />
              <p>
                Secure, encrypted connection. All data is confidential and protected.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
