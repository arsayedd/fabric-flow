import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell, MorePage } from "@/components/AppShell";
import { Gate } from "@/pages/Gate";
import { HomePage } from "@/pages/HomePage";
import { ClientsPage, ClientProfilePage } from "@/pages/ClientsPage";
import { CollectionsPage } from "@/pages/CollectionsPage";
import { CostsPage, CostItemPage } from "@/pages/CostsPage";
import { WorkersPage, WorkerProfilePage } from "@/pages/WorkersPage";
import { TreasuryPage } from "@/pages/TreasuryPage";
import { OrdersPage } from "@/pages/OrdersPage";
import { OrderDetailPage } from "@/pages/OrderDetailPage";
import { ProductsPage, ProductDetailPage } from "@/pages/ProductsPage";
import { MaterialsPage, MaterialDetailPage } from "@/pages/MaterialsPage";
import { AuditPage, SettingsPage, StaffPage } from "@/pages/StaffPage";
import { useFactory } from "@/store/context";
import type { ReactNode } from "react";

export default function App() {
  const { session, db } = useFactory();
  if (!session || !db.factory) return <Gate />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/workers" element={<WorkersPage />} />
        <Route path="/workers/:id" element={<WorkerProfilePage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/materials" element={<MaterialsPage />} />
        <Route path="/materials/:id" element={<MaterialDetailPage />} />
        <Route
          path="/collections"
          element={
            <Finance>
              <CollectionsPage />
            </Finance>
          }
        />
        <Route
          path="/clients"
          element={
            <Finance>
              <ClientsPage />
            </Finance>
          }
        />
        <Route
          path="/clients/:id"
          element={
            <Finance>
              <ClientProfilePage />
            </Finance>
          }
        />
        <Route
          path="/costs"
          element={
            <Finance>
              <CostsPage />
            </Finance>
          }
        />
        <Route
          path="/costs/:id"
          element={
            <Finance>
              <CostItemPage />
            </Finance>
          }
        />
        <Route
          path="/treasury"
          element={
            <Finance>
              <TreasuryPage />
            </Finance>
          }
        />
        <Route
          path="/staff"
          element={
            <Owner>
              <StaffPage />
            </Owner>
          }
        />
        <Route
          path="/audit"
          element={
            <Owner>
              <AuditPage />
            </Owner>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Finance({ children }: { children: ReactNode }) {
  const { can } = useFactory();
  if (!can.finance) return <Navigate to="/" replace />;
  return children;
}

function Owner({ children }: { children: ReactNode }) {
  const { can } = useFactory();
  if (!can.staff) return <Navigate to="/" replace />;
  return children;
}
