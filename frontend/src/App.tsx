import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./lib/v2/auth";
import V2RequireAuth from "./components/v2/RequireAuth";

// ──────────────────────────────────────────────────────────
// 🌐 say-6 브랜드 사이트 (마케팅 + 사업소개)
// ──────────────────────────────────────────────────────────
import HomePage from "./pages/brand/HomePage";
import ProductPage from "./pages/brand/ProductPage";
import ProductEcgPage from "./pages/brand/ProductEcgPage";
import ProductCxrPage from "./pages/brand/ProductCxrPage";
import ProductLabPage from "./pages/brand/ProductLabPage";
import TechnologyPage from "./pages/brand/TechnologyPage";
import TeamPage from "./pages/brand/TeamPage";
import ContactPage from "./pages/brand/ContactPage";

// ──────────────────────────────────────────────────────────
// 🩺 Live Demo (실제 시스템 — 로그인부터 소견서까지)
// ──────────────────────────────────────────────────────────
import V2LoginPage from "./pages/v2/LoginPage";
import V2AuthCallbackPage from "./pages/v2/AuthCallbackPage";
import V2WorklistPage from "./pages/v2/WorklistPage";
import V2PatientDetailPage from "./pages/v2/PatientDetailPage";
import V2PatientResultsPage from "./pages/v2/PatientResultsPage";
import V2ReportEditorPage from "./pages/v2/ReportEditorPage";
import V2ReportViewerPage from "./pages/v2/ReportViewerPage";
import V2TriagePage from "./pages/v2/TriagePage";
import V2AdminDashboardPage from "./pages/v2/AdminDashboardPage";
import V2ReportListPage from "./pages/v2/ReportListPage";

// ──────────────────────────────────────────────────────────
// 📦 Legacy EMR (기존 12페이지 — 점진적으로 v2로 마이그레이션 예정)
// ──────────────────────────────────────────────────────────
import Layout from "./components/Layout";
import MonitorPage from "./pages/MonitorPage";
import DashboardPage from "./pages/DashboardPage";
import ArchivePage from "./pages/ArchivePage";
import TriagePage from "./pages/TriagePage";
import PatientSearchPage from "./pages/PatientSearchPage";
import NotesPage from "./pages/NotesPage";
import RecordsPage from "./pages/RecordsPage";
import LabQueuePage from "./pages/LabQueuePage";
import ImagingQueuePage from "./pages/ImagingQueuePage";
import PrescriptionPage from "./pages/PrescriptionPage";
import ConsultPage from "./pages/ConsultPage";
import PatientCallPage from "./pages/PatientCallPage";
import StatsPage from "./pages/StatsPage";

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        {/* ─────────────────────────────────────────────
            say-6 브랜드 사이트 (마케팅)
            ───────────────────────────────────────────── */}
        <Route path="/"              element={<HomePage />} />
        <Route path="/product"       element={<ProductPage />} />
        <Route path="/product/ecg"   element={<ProductEcgPage />} />
        <Route path="/product/cxr"   element={<ProductCxrPage />} />
        <Route path="/product/lab"   element={<ProductLabPage />} />
        <Route path="/technology"    element={<TechnologyPage />} />
        <Route path="/team"          element={<TeamPage />} />
        <Route path="/contact"       element={<ContactPage />} />

        {/* ─────────────────────────────────────────────
            Live Demo — 실제 say-6 시스템
            ───────────────────────────────────────────── */}
        <Route path="/demo"               element={<V2LoginPage />} />
        <Route path="/demo/login"         element={<V2LoginPage />} />
        <Route path="/demo/auth/callback" element={<V2AuthCallbackPage />} />

        <Route path="/demo/triage" element={
          <V2RequireAuth><V2TriagePage /></V2RequireAuth>
        } />
        <Route path="/demo/worklist" element={
          <V2RequireAuth><V2WorklistPage /></V2RequireAuth>
        } />
        <Route path="/demo/dashboard" element={
          <V2RequireAuth><V2AdminDashboardPage /></V2RequireAuth>
        } />
        <Route path="/demo/reports" element={
          <V2RequireAuth><V2ReportListPage /></V2RequireAuth>
        } />
        <Route path="/demo/patient/:id" element={
          <V2RequireAuth><V2PatientDetailPage /></V2RequireAuth>
        } />
        <Route path="/demo/patient/:id/results" element={
          <V2RequireAuth><V2PatientResultsPage /></V2RequireAuth>
        } />
        <Route path="/demo/patient/:id/report" element={
          <V2RequireAuth roles={["doctor"]}><V2ReportEditorPage /></V2RequireAuth>
        } />
        <Route path="/demo/patient/:id/report/view" element={
          <V2RequireAuth><V2ReportViewerPage /></V2RequireAuth>
        } />

        {/* ─────────────────────────────────────────────
            Legacy EMR — 추후 v2 디자인으로 마이그레이션
            ───────────────────────────────────────────── */}
        <Route element={<Layout />}>
          <Route path="/legacy/monitor"        element={<MonitorPage />} />
          <Route path="/legacy/triage"         element={<TriagePage />} />
          <Route path="/legacy/dashboard"      element={<DashboardPage />} />
          <Route path="/legacy/archive"        element={<ArchivePage />} />
          <Route path="/legacy/patients"       element={<PatientSearchPage />} />
          <Route path="/legacy/notes"          element={<NotesPage />} />
          <Route path="/legacy/records"        element={<RecordsPage />} />
          <Route path="/legacy/records/:mrn"   element={<RecordsPage />} />
          <Route path="/legacy/lab-queue"      element={<LabQueuePage />} />
          <Route path="/legacy/imaging-queue"  element={<ImagingQueuePage />} />
          <Route path="/legacy/prescriptions"  element={<PrescriptionPage />} />
          <Route path="/legacy/consult"        element={<ConsultPage />} />
          <Route path="/legacy/call"           element={<PatientCallPage />} />
          <Route path="/legacy/stats"          element={<StatsPage />} />
        </Route>

        {/* 알 수 없는 경로 → 홈 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}
