import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { DataProvider } from './data.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Backlog from './pages/Backlog.jsx';
import Roadmap from './pages/Roadmap.jsx';
import Settings from './pages/Settings.jsx';

function Shell() {
  const { token } = useAuth();
  if (!token) return <Login />;
  return (
    <DataProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/backlog" element={<Backlog />} />
          <Route path="/backlog/:clientId" element={<Backlog />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/roadmap/:clientId" element={<Roadmap />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/clients" element={<Navigate to="/settings" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
