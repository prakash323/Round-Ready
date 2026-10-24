import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/layout";
import { OfficerRoute, ProtectedRoute } from "./components/protected-route";
import { CalendarPage } from "./pages/calendar";
import { DashboardPage } from "./pages/dashboard";
import { DriveDetailPage } from "./pages/drive-detail";
import { DriveEditPage } from "./pages/drive-edit";
import { DriveNewPage } from "./pages/drive-new";
import { DrivesPage } from "./pages/drives";
import { LoginPage } from "./pages/login";
import { PrepareIndexPage } from "./pages/prepare-index";
import { PreparePage } from "./pages/prepare";
import { NotFoundPage } from "./pages/not-found";
import { PolicyPage } from "./pages/policy";
import { ProfilePage } from "./pages/profile";
import { SimulatePage } from "./pages/simulate";

/**
 * The routes, mapped one-for-one from the App Router pages they replace.
 *
 * `/drives/new` is declared before `/drives/:id` so "new" is never read as a
 * drive id.
 */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/drives" element={<DrivesPage />} />

          {/* Publishing to the batch. Hidden from students here and refused
              for them on the server, which is the half that actually counts.
              Declared before `/drives/:id` to keep the "new" rule above
              obvious at a glance. */}
          <Route element={<OfficerRoute />}>
            <Route path="/drives/new" element={<DriveNewPage />} />
            <Route path="/drives/:id/edit" element={<DriveEditPage />} />
            <Route path="/policy" element={<PolicyPage />} />
          </Route>

          <Route path="/drives/:id" element={<DriveDetailPage />} />
          {/* Static segments before the dynamic one, so "new" and "jd" are
              never read as a drive id. */}
          <Route path="/prepare" element={<PrepareIndexPage />} />
          <Route path="/prepare/new" element={<PreparePage />} />
          <Route path="/prepare/jd/:jdId" element={<PreparePage />} />
          <Route path="/prepare/:driveId" element={<PreparePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/simulate" element={<SimulatePage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
