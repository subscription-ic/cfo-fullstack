import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ArrowLeft, TrendingUp } from 'lucide-react';

export default function PostCallAnalysis() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>

        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto rounded-xl bg-gradient-to-br from-[#ED232A] to-[#FF3B47] flex items-center justify-center mb-4">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-semibold text-[#8B1319] mb-2">Post-Call Analysis</h1>
          <p className="text-slate-600">
            Track market response and analyst reactions post-earnings
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Stock Price Movement (7-day)</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-500">
              Coming soon — daily close vs index, abnormal-return decomposition.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sentiment Evolution</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-500">
              Coming soon — multi-source sentiment trend over the 7 days after the call.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Analyst Rating Changes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-500">
              Coming soon — upgrades, downgrades, and target-price revisions by firm.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>FII / DII Flow Tracking</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-500">
              Coming soon — institutional flow into the stock around the call window.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
