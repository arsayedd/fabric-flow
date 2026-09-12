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
import { AlertsPage, TasksPage } from "@/pages/InboxPage";
import { HelpPage } from "@/pages/HelpPage";
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
import { CuttingPage } from "@/pages/CuttingPage";
import { ProductionPage } from "@/pages/ProductionPage";
import { FloorPage } from "@/pages/FloorPage";
import { StationPage } from "@/pages/StationPage";
import { ScanPage } from "@/pages/ScanPage";
import { LabelsPage } from "@/pages/LabelsPage";
import { TracePage } from "@/pages/TracePage";
import { OutsourcingPage } from "@/pages/OutsourcingPage";
import { CostingPage } from "@/pages/CostingPage";
import { CommandPage } from "@/pages/CommandPage";
import { ProductsPage, ProductDetailPage } from "@/pages/ProductsPage";
import { MaterialsPage, MaterialDetailPage } from "@/pages/MaterialsPage";
import { AuditPage, SettingsPage, StaffPage } from "@/pages/StaffPage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { ExportsPage } from "@/pages/ExportsPage";
import { VerifyPage } from "@/pages/VerifyPage";
import { useFactory } from "@/store/context";
import type { PermModule } from "@/store/permissions";
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
      {/* التحقق من مستند مفتوح بلا تسجيل دخول: الورقة بتتسلّم لناس بره النظام */}
      <Route path="/verify/:number" element={<VerifyPage />} />
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
        {guarded("/tasks", "parties", <TasksPage />)}
        {guarded("/alerts", "reports", <AlertsPage />)}
        <Route path="/help" element={<HelpPage />} />
        {guarded("/workers", "workers", <WorkersPage />)}
        {guarded("/workers/:id", "workers", <WorkerProfilePage />)}
        {guarded("/orders", "production", <OrdersPage />)}
        {guarded("/orders/:id", "production", <OrderDetailPage />)}
        {guarded("/cutting", "production", <CuttingPage />)}
        {guarded("/production", "production", <ProductionPage />)}
        {guarded("/floor", "production", <FloorPage />)}
        {guarded("/station", "production", <StationPage />)}
        {guarded("/outsourcing", "purchasing", <OutsourcingPage />)}
        {guarded("/planning", "planning", <PlanningPage />)}
        {guarded("/products", "sales", <ProductsPage />)}
        {guarded("/products/:id", "sales", <ProductDetailPage />)}
        {guarded("/materials", "inventory", <MaterialsPage />)}
        {guarded("/materials/:id", "inventory", <MaterialDetailPage />)}
        {guarded("/collections", "finance", <CollectionsPage />)}
        {guarded("/treasury", "finance", <TreasuryPage />)}
        {guarded("/parties", "parties", <PartiesPage />)}
        {guarded("/parties/:id", "parties", <PartyProfilePage />)}
        {guarded("/intelligence", "parties", <IntelligencePage />)}
        {/* الصلاحية هنا على مستوى القسم مش الصفحة: المشرف بيفتحها ويشوف وضع أرض المصنع بس */}
        <Route path="/dashboard" element={<CommandPage />} />
        {guarded("/costing", "costing", <CostingPage />)}
        {guarded("/costs", "purchasing", <CostsPage />)}
        {guarded("/costs/:id", "purchasing", <CostItemPage />)}
        {/*
          مفتوحين للكل زي غرفة التحكم: الصلاحية جوه الصفحة على كل جدول
          وكل نوع مستند لوحده. لو قفلناهم على موديول واحد، المشرف اللي
          شغلته قايمة على ورق الإنتاج مكانش هيوصل لورقه.
        */}
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/exports" element={<ExportsPage />} />
        {/*
          المسح والطباعة والتتبع مفتوحين لنفس السبب: الكود اللي في إيد
          العامل ممكن يكون لأي حاجة، والشاشة هي اللي بتقيس صلاحية النوع
          اللي طلع منه — قفلها على موديول واحد كان هيمنع نص المصنع.
        */}
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/labels" element={<LabelsPage />} />
        <Route path="/trace/:kind/:id" element={<TracePage />} />
        {guarded("/staff", "staff", <StaffPage />)}
        {guarded("/audit", "audit", <AuditPage />)}
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/clients" element={<Navigate to="/parties" replace />} />
        <Route path="/clients/:id" element={<LegacyClient />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </>
  );
}

/**
 * الصفحة نفسها بتتحقق من الصلاحية، مش القائمة بس.
 * اللي يكتب العنوان بإيده بيتحوّل للرئيسية بدل ما يشوف بيانات مش من حقه —
 * ودي نفس الخانة اللي في مصفوفة الصلاحيات، مش شرط تاني مكتوب في مكان تاني.
 */
function guarded(path: string, module: PermModule, page: ReactNode) {
  return <Route path={path} element={<Guard module={module}>{page}</Guard>} />;
}

function Guard({ module, children }: { module: PermModule; children: ReactNode }) {
  const { can } = useFactory();
  if (!can.do(module, "view")) return <Navigate to="/" replace />;
  return children;
}

/** الروابط القديمة للعملاء بتفضل شغالة بعد ما بقوا جهات تعامل */
function LegacyClient() {
  const { id } = useParams();
  return <Navigate to={`/parties/${id}`} replace />;
}
