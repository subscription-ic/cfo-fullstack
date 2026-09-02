import { Outlet, useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { TrendingUp, LogOut, Shield } from 'lucide-react';
import { companyInfo } from '../data/mockData';
import { Toaster } from '../components/ui/sonner';

export default function AdminLayout() {
  const navigate = useNavigate();

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
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--acu-accent)] border border-[var(--acu-spring)]/40">
                <Shield className="w-4 h-4 text-[var(--acu-spring)]" />
                <span className="text-white text-sm font-medium">Admin Access</span>
              </div>
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