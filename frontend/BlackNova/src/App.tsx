
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { BrowseEvents } from './pages/BrowseEvents';
import { ManageEvents } from './pages/ManageEvents';
import { MyTickets } from './pages/MyTickets';
import { Wallet } from './pages/Wallet';
import './App.css';

function App() {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/" 
          element={!isAuthenticated ? <Home /> : <Navigate to="/dashboard" replace />} 
        />

        <Route 
          path="/login" 
          element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" replace />} 
        />
        
        <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
        
        {/* Buyer Routes */}
        <Route 
          path="/events" 
          element={
            isAuthenticated && user?.role === 'buyer' 
              ? <Layout><BrowseEvents /></Layout> 
              : <Navigate to="/dashboard" replace />
          } 
        />
        <Route 
          path="/tickets" 
          element={
            isAuthenticated && user?.role === 'buyer' 
              ? <Layout><MyTickets /></Layout> 
              : <Navigate to="/dashboard" replace />
          } 
        />

        {/* Organizer Routes */}
        <Route 
          path="/manage/*" 
          element={
            isAuthenticated && user?.role === 'organizer' 
              ? <Layout><ManageEvents /></Layout> 
              : <Navigate to="/dashboard" replace />
          } 
        />
        
        {/* Shared Routes */}
        <Route path="/wallet" element={<Layout><Wallet /></Layout>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;