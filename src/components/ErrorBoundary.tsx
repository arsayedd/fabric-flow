import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

/**
 * الحاجز اللي بيمنع «الشاشة البيضا».
 *
 * ريأكت مافيهاش رندر ناقص: أول استثناء جوه أي كومبوننت بيفكّ الشجرة كلها
 * لحد أقرب حاجز. ومن غير حاجز خالص، الشجرة اللي بتتفكّ هي التطبيق —
 * فالمستخدم بيشوف صفحة بيضا فاضية، من غير رسالة ولا زرار ولا قائمة،
 * وماينفعش يرجع منها غير بـRefresh. وده بالظبط شكوى «لما بدخل على أي
 * صفحة بحصل كراش ولازم اعمل ريلود».
 *
 * فالحاجز مش بيصلّح سبب العطل — بيمنع العطل الواحد من إنه يوقّف النظام
 * كله ويخلّي الـRefresh هو المخرج الوحيد.
 */
type Props = {
  children: ReactNode;
  /** `page` بيسيب القائمة والشِل شغّالين حوالين الخطأ */
  scope: "app" | "page";
};

type State = { error: Error | null };

class Boundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    /* الكونسول هو الحاجة الوحيدة اللي بتوصلنا من جهاز المستخدم دلوقتي.
       ولازم يفضل كامل — الرسالة لوحدها مابتقولش الكومبوننت اللي وقع. */
    console.error("[sanaa] عطل في الواجهة:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <Crashed error={error} scope={this.props.scope} onRetry={this.reset} />;
  }
}

/**
 * الحاجز بيفضل فاتح على الخطأ لحد ما حد يصفّره. ومن غير التصفير مع تغيير
 * العنوان، أول عطل في صفحة كان بيخلّي كل الصفحات بعدها تعرض نفس الخطأ —
 * يعني القائمة شغّالة والضغط عليها مالوش فايدة، وهو نفس الإحساس اللي
 * بنحاول نخلص منه. والـ`key` بيعمل حاجز جديد مع كل مسار.
 */
export function ErrorBoundary({ children, scope = "page" }: { children: ReactNode; scope?: Props["scope"] }) {
  const { pathname } = useLocation();
  return (
    <Boundary key={scope === "page" ? pathname : "app"} scope={scope}>
      {children}
    </Boundary>
  );
}

function Crashed({ error, scope, onRetry }: { error: Error; scope: Props["scope"]; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className={`mx-auto w-full max-w-xl rounded-2xl border border-amber-300 bg-white p-5 text-right ${
        scope === "app" ? "mt-16" : "mt-2"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-2 text-amber-700">
          <AlertTriangle size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-medium text-[#0F1720]">الشاشة دي وقعت</h2>
          <p className="mt-1 text-[13px] leading-6 text-slate-600">
            {scope === "page"
              ? "باقي النظام شغّال — تقدر تفتح أي قسم تاني من القائمة على طول. وبياناتك زي ما هي، العطل في العرض مش في الدفتر."
              : "حاول تاني، ولو العطل اتكرر ابعتلنا التفاصيل اللي تحت."}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0F1720] px-4 py-2 text-[13px] text-white"
            >
              <RotateCcw size={15} />
              جرّب تاني
            </button>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-[13px] text-[#0F1720]"
            >
              <Home size={15} />
              الرئيسية
            </Link>
          </div>

          {/* التفاصيل مقفولة مش مخفية: المستخدم مش محتاجها، واللي بيصلّح محتاجها */}
          <details className="mt-4">
            <summary className="cursor-pointer text-[13px] text-slate-500">تفاصيل للمبرمج</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-slate-50 p-3 text-left text-[11px] leading-5 text-slate-700">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
