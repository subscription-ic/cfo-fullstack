import { createBrowserRouter } from "react-router";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import HistoricalIntelligenceHub from "./pages/HistoricalIntelligenceHub";
import EarningsCallStrategist from "./pages/EarningsCallStrategist";
import CFOLayout from "./layouts/CFOLayout";
import AdminLayout from "./layouts/AdminLayout";
import QuarterlyIntelligenceHub from "./pages/cfo/QuarterlyIntelligenceHub";
import EarningsCallSimulator from "./pages/cfo/EarningsCallSimulator";
import PredictionVsActual from "./pages/admin/PredictionVsActual";
import AdminDashboard from "./pages/admin/AdminDashboard";
import PostCallAnalysis from "./pages/PostCallAnalysis";
import NotFound from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Login />,
  },
  {
    path: "/dashboard",
    element: <Dashboard />,
  },
  {
    path: "/intelligence-hub",
    element: <HistoricalIntelligenceHub />,
  },
  {
    path: "/strategist",
    element: <EarningsCallStrategist />,
  },
  {
    path: "/simulator",
    element: <EarningsCallStrategist />,
  },
  {
    path: "/debrief",
    element: <PredictionVsActual />,
  },
  {
    path: "/post-call-analysis",
    element: <PostCallAnalysis />,
  },
  {
    path: "/cfo",
    element: <CFOLayout />,
    children: [
      { index: true, element: <QuarterlyIntelligenceHub /> },
      { path: "simulator", element: <EarningsCallSimulator /> },
    ],
  },
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminDashboard /> },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
]);