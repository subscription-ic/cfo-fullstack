import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { BarChart3, Sparkles, LineChart, ArrowRight, Target } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const isAdmin = localStorage.getItem('isAdmin') === 'true';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-end mb-4">
          {isAdmin && (
            <Button 
              onClick={() => navigate('/admin')}
              className="bg-[#ED232A] hover:bg-[#C11B22] text-white"
            >
              Go to Admin Panel
            </Button>
          )}
        </div>
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-semibold text-[#8B1319] mb-3">
            Earnings Call Companion
          </h1>
          <p className="text-slate-600 text-lg">
            Select a module to begin
          </p>
        </div>

        {/* Three Cards */}
        <div className="grid grid-cols-3 gap-6">
          {/* Historical Intelligence Hub */}
          <Card 
            className="border-[#ED232A]/30 hover:border-[#ED232A] hover:shadow-xl transition-all cursor-pointer group bg-white"
            onClick={() => navigate('/intelligence-hub')}
          >
            <CardHeader className="space-y-4 pb-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#ED232A] to-[#FF3B47] flex items-center justify-center group-hover:scale-110 transition-transform">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
              <div>
                <CardTitle className="text-[#8B1319] text-2xl mb-2">
                  Historical Intelligence Hub
                </CardTitle>
                <CardDescription className="text-slate-600 text-base">
                  Explore past earnings calls with detailed analysis and insights
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4 border-t border-slate-100">
              <ul className="space-y-3 mb-6">
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  Quarter-by-quarter review
                </li>
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  Questions & attendee tracking
                </li>
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  Sentiment & theme analysis
                </li>
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  AI-generated summaries
                </li>
              </ul>
              <div className="flex items-center text-[#ED232A] font-medium group-hover:gap-3 transition-all">
                Access Hub
                <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </CardContent>
          </Card>

          {/* Earnings Call Simulator */}
          <Card 
            className="border-[#ED232A]/30 hover:border-[#ED232A] hover:shadow-xl transition-all cursor-pointer group bg-white"
            onClick={() => navigate('/simulator')}
          >
            <CardHeader className="space-y-4 pb-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#ED232A] to-[#FF3B47] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Target className="w-8 h-8 text-white" />
              </div>
              <div>
                <CardTitle className="text-[#8B1319] text-2xl mb-2">
                  Earnings Call Simulator
                </CardTitle>
                <CardDescription className="text-slate-600 text-base">
                  Prepare for upcoming calls with AI-predicted questions
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4 border-t border-slate-100">
              <ul className="space-y-3 mb-6">
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  24 Predicted Questions
                </li>
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  Interactive Q&A simulator
                </li>
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  Rehearsal Mode Ready
                </li>
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  Custom Question Builder
                </li>
              </ul>
              <div className="flex items-center text-[#ED232A] font-medium group-hover:gap-3 transition-all">
                Start Simulator
                <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </CardContent>
          </Card>

          {/* Performance Debrief */}
          <Card 
            className="border-[#ED232A]/30 hover:border-[#ED232A] hover:shadow-xl transition-all cursor-pointer group bg-white"
            onClick={() => navigate('/debrief')}
          >
            <CardHeader className="space-y-4 pb-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#ED232A] to-[#FF3B47] flex items-center justify-center group-hover:scale-110 transition-transform">
                <LineChart className="w-8 h-8 text-white" />
              </div>
              <div>
                <CardTitle className="text-[#8B1319] text-2xl mb-2">
                  Performance Debrief
                </CardTitle>
                <CardDescription className="text-slate-600 text-base">
                  Review performance and improve for future calls
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4 border-t border-slate-100">
              <ul className="space-y-3 mb-6">
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  Predictions vs actuals
                </li>
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  Response effectiveness
                </li>
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  Areas for improvement
                </li>
                <li className="flex items-center text-sm text-slate-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mr-3" />
                  Post-call analytics
                </li>
              </ul>
              <div className="flex items-center text-[#ED232A] font-medium group-hover:gap-3 transition-all">
                View Debrief
                <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-slate-500 text-sm">
          Secure & Confidential • Enterprise-Grade Intelligence
        </div>
      </div>
    </div>
  );
}
