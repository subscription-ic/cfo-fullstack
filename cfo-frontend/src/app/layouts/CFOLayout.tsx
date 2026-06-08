import { Outlet, useNavigate, useLocation } from 'react-router';
import { Button } from '../components/ui/button';
import { TrendingUp, BarChart3, Sparkles, LogOut } from 'lucide-react';
import { companyInfo } from '../data/mockData';
import { Toaster } from '../components/ui/sonner';

export default function CFOLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-[#f5f7fa]">
      {/* Top Navigation */}
      <header className="bg-[#002850] border-b border-[#003d70] sticky top-0 z-50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Company */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-[#C00000]" />
                <div>
                  <h1 className="text-white text-xl font-semibold">Earnings Intelligence Copilot</h1>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-4">
              <Button
                variant={isActive('/cfo') ? 'secondary' : 'ghost'}
                onClick={() => navigate('/cfo')}
                className={isActive('/cfo') ? 'bg-[#003d70] text-white' : 'text-slate-300 hover:text-white hover:bg-[#003d70]'}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Intelligence Hub
              </Button>
              <Button
                variant={isActive('/cfo/simulator') ? 'secondary' : 'ghost'}
                onClick={() => navigate('/cfo/simulator')}
                className={isActive('/cfo/simulator') ? 'bg-[#003d70] text-white' : 'text-slate-300 hover:text-white hover:bg-[#003d70]'}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Call Simulator
              </Button>
              <div className="w-px h-8 bg-[#003d70] mx-2" />
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="text-slate-300 hover:text-white hover:bg-[#003d70]"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        <Outlet />
      </main>
      
      <Toaster position="top-right" />
    </div>
  );
}