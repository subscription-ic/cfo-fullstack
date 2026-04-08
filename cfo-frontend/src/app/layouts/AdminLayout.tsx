import { Outlet, useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { TrendingUp, LogOut, Shield } from 'lucide-react';
import { companyInfo } from '../data/mockData';
import { Toaster } from '../components/ui/sonner';

export default function AdminLayout() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f5f7fa]">
      {/* Top Navigation */}
      <header className="bg-[#002850] border-b border-[#003d70] sticky top-0 z-50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Company */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-[#ED232A]" />
                <div>
                  <h1 className="text-white text-xl font-semibold">Earnings Intelligence Copilot</h1>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E31837]/10 border border-[#E31837]/20">
                <Shield className="w-4 h-4 text-[#E31837]" />
                <span className="text-[#E31837] text-sm font-medium">Admin Access</span>
              </div>
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