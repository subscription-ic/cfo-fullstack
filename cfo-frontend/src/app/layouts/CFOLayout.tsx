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
    <div className="min-h-screen bg-[var(--acu-paper2)]">
      {/* Top Navigation */}
      <header className="bg-[var(--acu-navy)] border-b border-[var(--acu-accent)] sticky top-0 z-50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Company */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-[var(--acu-spring)]" />
                <div>
                  <h1 className="acu-display font-normal text-white text-xl">Earnings Intelligence Copilot</h1>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-4">
              <Button
                variant={isActive('/cfo') ? 'secondary' : 'ghost'}
                onClick={() => navigate('/cfo')}
                className={isActive('/cfo') ? 'bg-[var(--acu-accent)] text-white cursor-pointer' : 'text-white/70 hover:text-white hover:bg-[var(--acu-accent)] cursor-pointer transition-colors duration-250'}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Intelligence Hub
              </Button>
              <Button
                variant={isActive('/cfo/simulator') ? 'secondary' : 'ghost'}
                onClick={() => navigate('/cfo/simulator')}
                className={isActive('/cfo/simulator') ? 'bg-[var(--acu-accent)] text-white cursor-pointer' : 'text-white/70 hover:text-white hover:bg-[var(--acu-accent)] cursor-pointer transition-colors duration-250'}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Call Simulator
              </Button>
              <div className="w-px h-8 bg-[var(--acu-accent)] mx-2" />
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="text-white/70 hover:text-white hover:bg-[var(--acu-accent)] cursor-pointer transition-colors duration-250"
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