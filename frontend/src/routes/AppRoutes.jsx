import { Routes, Route } from 'react-router-dom';

import ProtectedRoute       from '../components/auth/ProtectedRoute';

import HomePage             from '../pages/home/HomePage';
import LoginPage            from '../pages/auth/LoginPage';
import RegisterPage         from '../pages/auth/RegisterPage';
import VerifyEmailPage      from '../pages/auth/VerifyEmailPage';
import ForgotPasswordPage   from '../pages/auth/ForgetPasswordPage';
import ResetPasswordPage    from '../pages/auth/ResetPasswordPage';

import ProfileSetupPage     from '../pages/profile/ProfileSetupPage';
import ProfileEditPage      from '../pages/profile/ProfileEditPage';
import MyProfilePage        from '../pages/profile/MyProfilePage';
import ProfileViewersPage   from '../pages/profile/ProfileViewersPage';
import LikedByPage          from '../pages/profile/LikedByPage';

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/"                element={<HomePage />} />
      <Route path="/login"           element={<LoginPage />} />
      <Route path="/register"        element={<RegisterPage />} />
      <Route path="/verify-email"    element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password"  element={<ResetPasswordPage />} />

      {/* Protected */}
      <Route path="/profile/setup"    element={<ProtectedRoute><ProfileSetupPage /></ProtectedRoute>} />
      <Route path="/profile/edit"     element={<ProtectedRoute><ProfileEditPage /></ProtectedRoute>} />
      <Route path="/profile/me"       element={<ProtectedRoute><MyProfilePage /></ProtectedRoute>} />
      <Route path="/profile/viewers"  element={<ProtectedRoute><ProfileViewersPage /></ProtectedRoute>} />
      <Route path="/profile/liked-by" element={<ProtectedRoute><LikedByPage /></ProtectedRoute>} />
    </Routes>
  );
}

export default AppRoutes;
