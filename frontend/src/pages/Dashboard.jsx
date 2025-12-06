import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import CashierPOS from './CashierPOS';
import BranchAdmin from './BranchAdmin';
import Owner from './Owner';

const Dashboard = () => {
  const { user } = useAuth();

  const getDashboardComponent = () => {
    switch (user?.role) {
      case 'cashier':
        return <CashierPOS />;
      case 'branch_admin':
        return <BranchAdmin />;
      case 'owner':
        return <Owner />;
      default:
        return <div>Invalid user role</div>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {getDashboardComponent()}
    </div>
  );
};

export default Dashboard;