import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import GradebookPage from "./pages/admin/GradebookPage";
import StudentsPage from "./pages/admin/StudentsPage";
import TeamsPage from "./pages/admin/TeamsPage";
import PhasesPage from "./pages/admin/PhasesPage";
import GradesPage from "./pages/admin/GradesPage";
import WeeklyGradebookPage from "./pages/admin/WeeklyGradebookPage";
import CoachingPage from "./pages/admin/CoachingPage";
import AlertsPage from "./pages/admin/AlertsPage";
import TvSettingsPage from "./pages/admin/TvSettingsPage";
import MetaSkillsPage from "./pages/admin/MetaSkillsPage";
import TvV2View from "./pages/tv/TvV2View";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/login" replace />} />

      <Route path="/tv" element={<TvV2View />} />

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="gradebook" element={<GradebookPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="phases" element={<PhasesPage />} />
        <Route path="grades" element={<GradesPage />} />
        <Route path="weekly-gradebook" element={<WeeklyGradebookPage />} />
        <Route path="coaching" element={<CoachingPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="meta-skills" element={<MetaSkillsPage />} />
        <Route path="tv-settings" element={<TvSettingsPage />} />
      </Route>
    </Routes>
  );
}
