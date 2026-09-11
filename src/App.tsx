import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell, MorePage } from "@/components/AppShell";
import { Gate } from "@/pages/Gate";
import { HomePage } from "@/pages/HomePage";
import { IntelligencePage } from "@/pages/IntelligencePage";
import { PartiesPage } from "@/pages/PartiesPage";
import { PartyProfilePage } from "@/pages/PartyProfilePage";
import { CollectionsPage } from "@/pages/CollectionsPage";
import { CostsPage, CostItemPage } from "@/pages/CostsPage";
import { WorkersPage, WorkerProfilePage } from "@/pages/WorkersPage";
import { TreasuryPage } from "@/pages/TreasuryPage";
import { OrdersPage } from "@/pages/OrdersPage";
import { OrderDetailPage } from "@/pages/OrderDetailPage";
import { PlanningPage } from "@/pages/PlanningPage";
import { CostingPage } from "@/pages/CostingPage";
import { DashboardPage } from "@/pages/DashboardPage";
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
        <Route path="/planning" element={<PlanningPage />} />
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
          path="/parties"
          element={
            <Finance>
              <PartiesPage />
            </Finance>
          }
        />
        <Route
          path="/parties/:id"
          element={
            <Finance>
              <PartyProfilePage />
            </Finance>
          }
        />
        <Route
          path="/dashboard"
          element={
            <Finance>
              <DashboardPage />
            </Finance>
          }
        />
        <Route
          path="/costing"
          element={
            <Finance>
              <CostingPage />
            </Finance>
          }
        />
        <Route
          path="/intelligence"
          element={
            <Finance>
              <IntelligencePage />
            </Finance>
          }
        />
        <Route path="/clients" element={<Navigate to="/parties" replace />} />
        <Route path="/clients/:id" element={<LegacyClient />} />
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

/** الروابط القديمة للعملاء بتفضل شغالة بعد ما بقوا جهات تعامل */
function LegacyClient() {
  const { id } = useParams();
  return <Navigate to={`/parties/${id}`} replace />;
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
