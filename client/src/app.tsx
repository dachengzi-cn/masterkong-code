import { Suspense, lazy } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';

import Layout from './components/Layout';
import NotFound from './pages/NotFound/NotFound';
import { Skeleton } from '@/components/ui/skeleton';

const PageLoader = () => <Skeleton className="h-[calc(100vh-60px)] w-full" />;

const HomePage = lazy(() => import('./pages/HomePage/HomePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage/DashboardPage'));
const DashboardOverviewPage = lazy(() => import('./pages/DashboardPage/DashboardOverviewPage'));
const DashboardBrandSpecPage = lazy(() => import('./pages/DashboardPage/DashboardBrandSpecPage'));
const CustomerPage = lazy(() => import('./pages/CustomerPage/CustomerPage'));
const CustomerListPage = lazy(() => import('./pages/CustomerListPage/CustomerListPage'));
const ExpensePage = lazy(() => import('./pages/ExpensePage/ExpensePage'));
const DataManagePage = lazy(() => import('./pages/DataManagePage/DataManagePage'));
const ServiceAnalysisPage = lazy(() => import('./pages/ServiceAnalysisPage/ServiceAnalysisPage'));
const ExpiryExpensePage = lazy(() => import('./pages/ExpiryExpensePage/ExpiryExpensePage'));
const AtpExpensePage = lazy(() => import('./pages/AtpExpensePage/AtpExpensePage'));
const OverstockPage = lazy(() => import('./pages/OverstockPage/OverstockPage'));
const CapabilityPage = lazy(() => import('./pages/CapabilityPage/CapabilityPage'));

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Suspense fallback={<PageLoader />}><HomePage /></Suspense>} />
        <Route path="data" element={<Suspense fallback={<PageLoader />}><DataManagePage /></Suspense>} />
        <Route path="customers" element={<Suspense fallback={<PageLoader />}><CustomerPage /></Suspense>} />
        <Route path="customer-list" element={<Suspense fallback={<PageLoader />}><CustomerListPage /></Suspense>} />
        <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><DashboardOverviewPage /></Suspense>} />
        <Route path="dashboard/overview" element={<Suspense fallback={<PageLoader />}><DashboardOverviewPage /></Suspense>} />
        <Route path="dashboard/cumulative" element={<Suspense fallback={<PageLoader />}><DashboardPage mode="cumulative" /></Suspense>} />
        <Route path="dashboard/daily" element={<Suspense fallback={<PageLoader />}><DashboardPage mode="daily" /></Suspense>} />
        <Route path="dashboard/brand-spec" element={<Suspense fallback={<PageLoader />}><DashboardBrandSpecPage /></Suspense>} />
        <Route path="dashboard/cumulative/:datasetId" element={<Suspense fallback={<PageLoader />}><DashboardPage mode="cumulative" /></Suspense>} />
        <Route path="dashboard/daily/:datasetId" element={<Suspense fallback={<PageLoader />}><DashboardPage mode="daily" /></Suspense>} />
        <Route path="expense" element={<Suspense fallback={<PageLoader />}><ExpensePage /></Suspense>} />
        <Route path="expense/expiry" element={<Suspense fallback={<PageLoader />}><ExpiryExpensePage /></Suspense>} />
        <Route path="expense/atp" element={<Suspense fallback={<PageLoader />}><AtpExpensePage /></Suspense>} />
        <Route path="expense/overstock" element={<Suspense fallback={<PageLoader />}><OverstockPage /></Suspense>} />
        <Route path="service-analysis" element={<Suspense fallback={<PageLoader />}><ServiceAnalysisPage /></Suspense>} />
        <Route path="capability" element={<Suspense fallback={<PageLoader />}><CapabilityPage /></Suspense>} />
        <Route path="expiry-expense" element={<Navigate to="/expense/expiry" replace />} />
        <Route path="atp-expense" element={<Navigate to="/expense/atp" replace />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
