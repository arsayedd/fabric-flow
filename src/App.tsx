import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AppShell, MorePage } from "@/components/AppShell";
import { Gate } from "@/pages/Gate";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { SignupWizard } from "@/pages/SignupWizard";
import { FactoryPickerPage } from "@/pages/FactoryPickerPage";
import { TenantMissingPage } from "@/pages/TenantMissingPage";
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
  const { session, db, account } = useFactory();
  // الـslug اللي في العنوان مش معروف: بنقولها، مش بنفتح مصنع تاني بالغلط
  if (account.missing) return <TenantMissingPage slug={account.missing} />;
  const inApp = !!session && !!db.factory;

  return (
    <Routes>
      {/*
        رحلة التجهيز مسجّلة برّه الشرط، فلما المصنع بيتعمل في نص الرحلة
        (آخر خطوة ٣) الـwizard مايتقفلش والبيانات مابتضيعش.
      */}
      <Route path="/signup" element={<SignupWizard />} />
      <Route path="/signup/factory" element={<SignupWizard mode="factory" />} />
      <Route path="/factories/new" element={<SignupWizard mode="factory" />} />
      {inApp ? appRoutes() : publicRoutes(!!account.user)}
    </Routes>
  );
}

/** فراغمنت مش كومبوننت: الـRoutes مابتقبل غير Route أو Fragment */
function publicRoutes(hasAccount: boolean) {
  // حساب داخل من غير مصنع مفتوح: بيختار المصنع
  if (hasAccount)
    return (
      <>
        <Route path="/factories" element={<FactoryPickerPage />} />
        <Route path="*" element={<Navigate to="/factories" replace />} />
      </>
    );
  return (
    <>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot" element={<ForgotPasswordPage />} />
      <Route path="/device" element={<Gate />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </>
  );
}

function appRoutes() {
  return (
    <>
      <Route path="/factories" element={<FactoryPickerPage />} />
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
    </>
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
