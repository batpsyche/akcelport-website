import { Routes, Route, Navigate } from 'react-router';
import { RequireAuth } from '@/lib/auth';
import { Shell } from '@/components/layout/Shell';
import { LoginPage } from '@/pages/LoginPage';
import { SetPasswordPage } from '@/pages/SetPasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { ProductEditPage } from '@/pages/ProductEditPage';
import { FamiliesPage } from '@/pages/FamiliesPage';
import { FamilyEditPage } from '@/pages/FamilyEditPage';
import { DownloadsPage } from '@/pages/DownloadsPage';
import { DownloadEditPage } from '@/pages/DownloadEditPage';
import { PagesPage } from '@/pages/PagesPage';
import { PageEditPage } from '@/pages/PageEditPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { RedirectsPage } from '@/pages/RedirectsPage';
import { MediaPage } from '@/pages/MediaPage';
import { UsersPage } from '@/pages/UsersPage';
import { PublishPage } from '@/pages/PublishPage';
import { ActivityPage } from '@/pages/ActivityPage';
import { AccountPage } from '@/pages/AccountPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="/" element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/new" element={<ProductEditPage />} />
        <Route path="products/:id" element={<ProductEditPage />} />
        <Route path="families" element={<FamiliesPage />} />
        <Route path="families/new" element={<FamilyEditPage />} />
        <Route path="families/:id" element={<FamilyEditPage />} />
        <Route path="downloads" element={<DownloadsPage />} />
        <Route path="downloads/new" element={<DownloadEditPage />} />
        <Route path="downloads/:id" element={<DownloadEditPage />} />
        <Route path="pages" element={<PagesPage />} />
        <Route path="pages/:key" element={<PageEditPage />} />
        <Route path="settings" element={<RequireAuth admin><SettingsPage /></RequireAuth>} />
        <Route path="redirects" element={<RequireAuth admin><RedirectsPage /></RequireAuth>} />
        <Route path="media" element={<MediaPage />} />
        <Route path="users" element={<RequireAuth admin><UsersPage /></RequireAuth>} />
        <Route path="publish" element={<PublishPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
