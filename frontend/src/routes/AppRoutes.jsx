import { Routes, Route } from 'react-router-dom';
import HomePage from '../pages/home/HomePage';
import ProfileSetupPage from '../pages/profile/ProfileSetupPage';
import ProfileEditPage from '../pages/profile/ProfileEditPage';
import MyProfilePage from '../pages/profile/MyProfilePage';
import ProfileViewersPage from '../pages/profile/ProfileViewersPage';
import LikedByPage from '../pages/profile/LikedByPage';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/profile/setup" element={<ProfileSetupPage />} />
      <Route path="/profile/edit" element={<ProfileEditPage />} />
      <Route path="/profile/me" element={<MyProfilePage />} />
      <Route path="/profile/viewers" element={<ProfileViewersPage />} />
      <Route path="/profile/liked-by" element={<LikedByPage />} />
    </Routes>
  );
}

export default AppRoutes;
