/**
 * الحساب والمصنع كـ Tenant.
 *
 * القاعدة المعمارية اللي اتفقنا عليها: **المصنع = Tenant = Workspace**،
 * والـSubdomain مش شكل في الـURL؛ ده مفتاح تحديد المصنع.
 * فعشان كده الـSubdomain مربوط بـ`factoryId` في سجل مستقل، والتحويل دايمًا
 * `hostname → subdomain → factoryId → بيانات المصنع` — مش `الاسم → البيانات`.
 *
 * حدود النسخة المحلية (مكتوبة صريح في الواجهة كمان):
 * - بيانات كل مصنع في مفتاح مستقل في المتصفح، فالعزل حقيقي بين المصانع على الجهاز.
 * - الـSubdomain الحقيقي محتاج DNS و backend؛ محليًا بنعرضه ونحترمه في التحويل
 *   عن طريق `?factory=slug` أو الاختيار، والـresolver نفسه هو اللي الـbackend
 *   هيستخدمه بعد كده من الـhostname.
 * - تشفير كلمة السر هنا PBKDF2 في المتصفح: بيحمي من فتح الـstorage بالعين،
 *   ومش بديل عن مصادقة على سيرفر. مكتوب في الواجهة.
 */

const ACCOUNTS_KEY = "sanaa.accounts.v1";
const WORKSPACES_KEY = "sanaa.workspaces.v1";
const CURRENT_KEY = "sanaa.current.v1";
/** مفتاح بيانات المصنع القديم — أول مصنع اتسجّل قبل نظام الحسابات */
export const LEGACY_DB_KEY = "factory-ledger.v1";

export type UserAccount = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  countryCode: string;
  /** PBKDF2-SHA256 */
  passwordHash: string;
  salt: string;
  emailVerified: boolean;
  /** كود التأكيد — في النسخة المحلية بيتعرض في الواجهة بدل الإيميل */
  verifyCode: string | null;
  verifySentAt: string | null;
  termsAcceptedAt: string;
  createdAt: string;
};

/** الدول اللي بنسأل عنها — الكود بيتخزن مستقل عن الرقم عشان يتصل بيه بعد كده */
export const COUNTRIES: { name: string; dial: string }[] = [
  { name: "مصر", dial: "+20" },
  { name: "السعودية", dial: "+966" },
  { name: "الإمارات", dial: "+971" },
  { name: "الكويت", dial: "+965" },
  { name: "قطر", dial: "+974" },
  { name: "البحرين", dial: "+973" },
  { name: "عُمان", dial: "+968" },
  { name: "الأردن", dial: "+962" },
  { name: "المغرب", dial: "+212" },
  { name: "تونس", dial: "+216" },
  { name: "الجزائر", dial: "+213" },
  { name: "ليبيا", dial: "+218" },
  { name: "السودان", dial: "+249" },
  { name: "العراق", dial: "+964" },
  { name: "سوريا", dial: "+963" },
  { name: "لبنان", dial: "+961" },
  { name: "فلسطين", dial: "+970" },
  { name: "تركيا", dial: "+90" },
  { name: "دولة أخرى", dial: "+" },
];

export type EmployeeBand = "1-10" | "11-25" | "26-50" | "51-100" | "101-250" | "251-500" | "500+";

export const EMPLOYEE_BANDS: EmployeeBand[] = ["1-10", "11-25", "26-50", "51-100", "101-250", "251-500", "500+"];

/** أنشطة المصنع — أكتر من نشاط مسموح */
export const FACTORY_TYPES = [
  "ملابس جاهزة",
  "ملابس أطفال",
  "ملابس حريمي",
  "ملابس رجالي",
  "ملابس رياضية",
  "ملابس داخلية",
  "يونيفورم وملابس عمل",
  "جينز",
  "ملابس محجبات",
  "نسيج",
  "Private Label",
  "شنط وجلود",
  "أحذية",
  "مفروشات وأخشاب",
  "أغذية وتعبئة",
  "نشاط آخر",
] as const;

export type FactoryType = (typeof FACTORY_TYPES)[number];

/**
 * نشاط المصنع بيحدّد القوالب اللي بتتجهّز معاه (وحدات، فئات، خامات، عمليات).
 * المستخدم بيختار أكتر من نشاط، فبناخد أول نشاط ليه قالب ونستخدمه أساسًا.
 */
export const TYPE_INDUSTRY: Record<string, "apparel" | "bags" | "shoes" | "furniture" | "accessories" | "food" | "custom"> = {
  "ملابس جاهزة": "apparel",
  "ملابس أطفال": "apparel",
  "ملابس حريمي": "apparel",
  "ملابس رجالي": "apparel",
  "ملابس رياضية": "apparel",
  "ملابس داخلية": "apparel",
  "يونيفورم وملابس عمل": "apparel",
  جينز: "apparel",
  "ملابس محجبات": "apparel",
  نسيج: "apparel",
  "Private Label": "apparel",
  "شنط وجلود": "bags",
  أحذية: "shoes",
  "مفروشات وأخشاب": "furniture",
  "أغذية وتعبئة": "food",
  "نشاط آخر": "custom",
};

export function industryOf(types: string[]): "apparel" | "bags" | "shoes" | "furniture" | "accessories" | "food" | "custom" {
  for (const t of types) {
    const hit = TYPE_INDUSTRY[t];
    if (hit && hit !== "custom") return hit;
  }
  return "custom";
}

/**
 * الموديولات اللي المصنع بيديرها — بتحدّد شكل القائمة الجانبية.
 *
 * الاختيار هنا **مش تفضيل شكلي**. هو إجابة على سؤال «طبيعة شغلك إيه»،
 * والقائمة بتتبنى عليه. وعشان كده الليستة دي **مش بتتقفل على حد**: أي
 * قسم بيتفتح أو بيتوقف أي وقت من الإعدادات.
 *
 * والقاعدة اللي بتحكم `MODULE_READY`: **مابنعرضش اختيار لشاشة مش
 * موجودة.** والنهارده الـ١٨ كلهم `true` — مفيش قسم في شاشة التجهيز
 * مطفي ولا مكتوب عليه «قريبًا»، وكل قسم المستخدم يختاره بيفتح شاشاته
 * الحقيقية وبيدخل في اللوحة والتنبيهات والتصدير والطباعة.
 *
 * الحقل نفسه باقي عشان أي قسم جديد يتضاف بعدين، فيبان مطفي بصراحة
 * لحد ما يخلص. (الجودة قعدت `false` بعد ما مركز الجودة اتبنى، فالمستخدم
 * كان بيتقال له «لسه مش مبني» عن حاجة شغّالة — أسوأ نوع من الكذب: كذب
 * بيقلّل من النظام.)
 */
export const MODULE_KEYS = [
  "production",
  "cutting",
  "planning",
  "inventory",
  "supply",
  "purchasing",
  "workers",
  "parties",
  "sales",
  "finance",
  "costing",
  "quality",
  "returns",
  "machines",
  "documents",
  "codes",
  "reports",
  "automation",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABEL: Record<ModuleKey, string> = {
  production: "الإنتاج وأوامر التشغيل",
  cutting: "القص والتشغيل",
  planning: "التخطيط والطاقة",
  inventory: "المخزون والخامات",
  supply: "التوريد والاستلام",
  purchasing: "المشتريات والموردين",
  workers: "العمال والحضور",
  parties: "العملاء والتجار",
  sales: "البيع والتسليم",
  finance: "الخزينة والتحصيل",
  costing: "التكلفة والربحية",
  quality: "الجودة والفحص",
  returns: "المرتجعات والإصلاحات",
  machines: "الماكينات والصيانة",
  documents: "المستندات والطباعة",
  codes: "QR والباركود",
  reports: "التقارير والتحليلات",
  automation: "الأتمتة والذكاء الاصطناعي",
};

/**
 * إيه اللي بيتفتح بالظبط لما تختار القسم ده.
 *
 * السطر ده مش زينة. «المخزون» كلمة ماتقولش إن جواها الجرد والهالك،
 * والمستخدم اللي بيختار من ١٨ خانة محتاج يعرف إيه اللي بيدخل وإيه
 * اللي بيقف — مش يجرّب ويشوف.
 */
export const MODULE_ABOUT: Record<ModuleKey, string> = {
  production: "أوامر الإنتاج، متابعة العمليات، شاشة أرض المصنع، ومحطة العامل",
  cutting: "الفرشات والتكتيك، والباندلات اللي الإنتاج بيتحسب عليها بالقطعة",
  planning: "طاقة الخطوط، جدولة الأوامر، واحتياج الخامات قبل ما ينفد",
  inventory: "الخامات وأرصدتها وحركاتها وأسعارها، والجرد والهالك",
  supply: "أوامر التوريد والاستلام الجزئي والدفعات والاستدعاء",
  purchasing: "الموردين وفواتير المشتريات والورش الخارجية",
  workers: "العمال والحضور والأجر بالقطعة والسلف",
  parties: "جهات التعامل بأدوارها، ملف العميل ٣٦٠، وذكاء العملاء",
  sales: "الموديلات، التوريد للعميل، والفواتير",
  finance: "الخزينة والحسابات والتحصيل والمستحق",
  costing: "ورقة تكلفة الموديل، الربحية، وسعر التعادل",
  quality: "الفحص والعيوب وتحليل الأسباب وتكلفة الجودة الرديئة",
  returns: "مرتجعات العملاء والموردين، الشكاوى، وأوامر الإصلاح",
  machines: "الماكينات وحالتها، تذاكر الأعطال، الصيانة الدورية، وتكلفة التوقف",
  documents: "دفتر المستندات، مركز التصدير، ومحرّك الطباعة",
  codes: "ليبلات QR وباركود لكل كيان، وسلسلة التتبّع",
  reports: "غرفة التحكم، صحة المصنع، واستنتاجات صنعة",
  automation: "اسأل صنعة بالعامية والجواب من دفترك، وقواعد حساسية التنبيهات",
};

/**
 * مبني فعلًا؟ — والـتمانتاشر كلهم `true` النهارده. الخريطة باقية عشان أي قسم
 * جديد يتضاف يبقى `false` لحد ما يشتغل end-to-end، فيترشّح من شاشة التجهيز
 * بدل ما يتعرض كارت مطفي بوعد.
 */
export const MODULE_READY: Record<ModuleKey, boolean> = {
  production: true,
  cutting: true,
  planning: true,
  inventory: true,
  supply: true,
  purchasing: true,
  workers: true,
  parties: true,
  sales: true,
  finance: true,
  costing: true,
  quality: true,
  returns: true,
  machines: true,
  documents: true,
  codes: true,
  reports: true,
  automation: true,
};

/** مجموعات الاختيار — ١٨ خانة في عمود واحد بتبقى قايمة، مش قرار */
export const MODULE_GROUPS: { label: string; keys: ModuleKey[] }[] = [
  { label: "التشغيل", keys: ["production", "cutting", "planning", "machines"] },
  { label: "الخامات والتوريد", keys: ["inventory", "supply", "purchasing"] },
  { label: "الناس", keys: ["workers", "parties"] },
  { label: "الفلوس", keys: ["sales", "finance", "costing"] },
  { label: "الجودة والتتبّع", keys: ["quality", "returns", "codes"] },
  { label: "الورق والتحليل", keys: ["documents", "reports", "automation"] },
];

/**
 * توسيع اختيارات مصنع قديم.
 *
 * الموديولات كانت اتناشر، وبقت تمانتاشر. والستة الجداد **مكانوا
 * ظاهرين فعلًا** للمصانع القديمة: القص كان تحت الإنتاج، والتوريد تحت
 * المشتريات، والمرتجعات والمستندات والأكواد مكانوا مربوطين بأي اختيار
 * أصلًا — يعني ظاهرين للكل.
 *
 * فلو قرينا قايمة قديمة زي ما هي، **المستخدم بيصحى يلاقي شاشات
 * اختفت** — وهو ماعملش حاجة. عشان كده بنوسّعها عند القراءة.
 *
 * والتوسيع بيتحدد بـ`modulesV`، مش بتخمين على محتوى القايمة: لو
 * خمّنّا «القايمة مافيهاش `documents` يعني قديمة»، يبقى المستخدم
 * اللي **قافل** المستندات بإرادته هنرجّعها له كل مرة. العلامة بتتكتب
 * أول ما الاختيارات تتحفظ من الإعدادات أو من التجهيز.
 */
export const MODULES_VERSION = 2;

export function effectiveModules(w: Pick<Workspace, "modules" | "modulesV"> | null): ModuleKey[] {
  if (!w) return [];
  const saved = w.modules ?? [];
  if (!saved.length) return [];
  if ((w.modulesV ?? 1) >= MODULES_VERSION) return saved;

  const out = new Set<ModuleKey>(saved);
  if (out.has("production")) out.add("cutting");
  if (out.has("purchasing")) out.add("supply");
  // دول مكانوا ظاهرين للكل قبل ما يبقى لهم خانة
  out.add("returns");
  out.add("documents");
  out.add("codes");
  return MODULE_KEYS.filter((k) => out.has(k));
}

export type Workspace = {
  factoryId: string;
  /** مفتاح بيانات المصنع في المتصفح — العزل بيحصل هنا */
  dbKey: string;
  name: string;
  subdomain: string;
  types: string[];
  industry: string;
  website: string;
  country: string;
  city: string;
  address: string;
  employees: EmployeeBand | null;
  employeesExact: number | null;
  monthlyCapacity: number | null;
  productionLines: number | null;
  branches: number | null;
  logo: string | null;
  modules: ModuleKey[];
  /**
   * نسخة قايمة الموديولات. غايب = قايمة اتحفظت قبل ما الستة الجداد
   * يبقى لهم خانة، فبتتوسّع عند القراءة (`effectiveModules`).
   */
  modulesV?: number;
  ownerId: string;
  /** المستخدمين اللي ليهم وصول: حساب → دور */
  access: { userId: string; role: "owner" | "accountant" | "supervisor" }[];
  createdAt: string;
  lastAccessAt: string | null;
};

export type CurrentState = { userId: string | null; factoryId: string | null; remember: boolean };

/** سجل workspace فاضي — الحقول الاختيارية كلها null بدل أصفار وهمية */
export function blankWorkspace(factoryId: string, dbKey: string, name: string, subdomain: string): Workspace {
  return {
    factoryId,
    dbKey,
    name,
    subdomain,
    types: [],
    industry: "custom",
    website: "",
    country: "",
    city: "",
    address: "",
    employees: null,
    employeesExact: null,
    monthlyCapacity: null,
    productionLines: null,
    branches: null,
    logo: null,
    modules: [],
    modulesV: MODULES_VERSION,
    ownerId: "",
    access: [],
    createdAt: new Date().toISOString(),
    lastAccessAt: null,
  };
}

/** أول slug متاح: الاسم، وبعده الاسم-٢ وهكذا */
export function freeSlug(name: string, workspaces: Workspace[]): string {
  const base = slugify(name) || "factory";
  let slug = base;
  for (let i = 2; slugState(slug, workspaces) !== "free"; i++) slug = `${base}-${i}`;
  return slug;
}

/* ── التخزين ────────────────────────────────────────────────── */

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadAccounts(): UserAccount[] {
  return read<UserAccount[]>(ACCOUNTS_KEY, []);
}

export function saveAccounts(rows: UserAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(rows));
}

export function loadWorkspaces(): Workspace[] {
  return read<Workspace[]>(WORKSPACES_KEY, []);
}

export function saveWorkspaces(rows: Workspace[]) {
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(rows));
}

export function loadCurrent(): CurrentState {
  return read<CurrentState>(CURRENT_KEY, { userId: null, factoryId: null, remember: true });
}

export function saveCurrent(state: CurrentState) {
  localStorage.setItem(CURRENT_KEY, JSON.stringify(state));
}

export function dbKeyOf(factoryId: string): string {
  return `${LEGACY_DB_KEY}:${factoryId}`;
}

/* ── كلمة السر ──────────────────────────────────────────────── */

export type PasswordCheck = {
  upper: boolean;
  lower: boolean;
  digit: boolean;
  symbol: boolean;
  length: boolean;
  ok: boolean;
  score: 0 | 1 | 2 | 3;
  label: "ضعيفة" | "متوسطة" | "قوية";
};

export function checkPassword(value: string): PasswordCheck {
  const upper = /[A-Z]/.test(value);
  const lower = /[a-z]/.test(value);
  const digit = /\d/.test(value);
  const symbol = /[^\w\s]/.test(value);
  const length = value.length >= 8;
  const met = [upper, lower, digit, symbol, length].filter(Boolean).length;
  const ok = met === 5;
  const score: 0 | 1 | 2 | 3 = value.length === 0 ? 0 : ok ? 3 : met >= 3 ? 2 : 1;
  return { upper, lower, digit, symbol, length, ok, score, label: score >= 3 ? "قوية" : score === 2 ? "متوسطة" : "ضعيفة" };
}

const enc = new TextEncoder();

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** PBKDF2 — بديل محلي مؤقت لتخزين الهاش على السيرفر، مش بديل للمصادقة نفسها */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password: string, account: UserAccount): Promise<boolean> {
  const hash = await hashPassword(password, account.salt);
  return hash === account.passwordHash;
}

export function sixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/* ── الحساب التجريبي ───────────────────────────────────────── */

/**
 * حساب جاهز للدخول التجريبي من شاشة تسجيل الدخول.
 *
 * التجربة الأساسية بزرار الدور من الصفحة الرئيسية، والحساب ده موجود
 * لسبب واحد: إن شاشة تسجيل الدخول نفسها تبقى قابلة للتجربة. اللي عايز
 * يشوف النظام مش لازم يعمل حساب.
 *
 * **الباسورد معروض في الواجهة، وده مقصود.** هو مفتاح لمساحة تجريبية
 * على نفس الجهاز مش أكتر: الداتا مولّدة، والمساحة معلّمة `demo: true`،
 * وأي حد فاتح الصفحة شايف الكلمتين. لو الحساب ده كان بيوصل لمساحة
 * حقيقية يبقى الحكاية تبقى تانية خالص — وعشان كده هو **مربوط بالمصنع
 * التجريبي وبس**، ومابيتعملش لو الجهاز فيه مساحة بنفس الإيميل.
 *
 * الهاش متحسوب مسبقًا بنفس دوال `hashPassword` (PBKDF2-SHA256، ١٢٠ ألف
 * دورة) عشان البداية تفضل متزامنة: لو حسبناه وقت التشغيل، شاشة الدخول
 * هتفتح قبل ما الحساب يبقى موجود، فأول محاولة دخول هتفشل.
 */
export const DEMO_LOGIN = {
  email: "demo@sanaa.app",
  password: "Sanaa@2026",
  salt: "5a6e61616164656d6f73616c7430303031",
  hash: "7976c35398bf4a5228288aab87cd6fa70348dc72f54b6ec59e00ed0c9e3c57dc",
};

const DEMO_USER_ID = "u-demo";

function demoAccount(): UserAccount {
  const now = new Date().toISOString();
  return {
    id: DEMO_USER_ID,
    fullName: "مستخدم تجريبي",
    email: DEMO_LOGIN.email,
    phone: "1000000000",
    countryCode: "+20",
    passwordHash: DEMO_LOGIN.hash,
    salt: DEMO_LOGIN.salt,
    // متأكد من الأول: شاشة تأكيد الإيميل مالهاش لازمة في تجربة
    emailVerified: true,
    verifyCode: null,
    verifySentAt: null,
    termsAcceptedAt: now,
    createdAt: now,
  };
}

/**
 * بيتأكد إن الحساب التجريبي وسجل مساحته موجودين، ومابيلمسش غير كده.
 *
 * **مابيكتبش دفتر المصنع** — الـ٧٩٢ سجل بتتولد أول مرة الحساب يدخل
 * فعلًا. يعني اللي فاتح الصفحة وعمل مصنعه الحقيقي على طول مابيتكتبلهوش
 * داتا تجريبية في المتصفح من غير ما يطلبها.
 */
export function ensureDemoLogin(
  accounts: UserAccount[],
  workspaces: Workspace[],
  demoFactoryId: string,
  demoDbKey: string,
  demo: { name: string; industry: string },
): { accounts: UserAccount[]; workspaces: Workspace[] } {
  const taken = accounts.some((a) => a.email === DEMO_LOGIN.email && a.id !== DEMO_USER_ID);
  const hasAccount = accounts.some((a) => a.id === DEMO_USER_ID);
  const hasWorkspace = workspaces.some((w) => w.factoryId === demoFactoryId);
  if (taken || (hasAccount && hasWorkspace)) return { accounts, workspaces };

  const nextAccounts = hasAccount ? accounts : [...accounts, demoAccount()];
  if (!hasAccount) saveAccounts(nextAccounts);

  let nextWorkspaces = workspaces;
  if (!hasWorkspace) {
    nextWorkspaces = [
      ...workspaces,
      {
        ...blankWorkspace(demoFactoryId, demoDbKey, demo.name, "alnoor-demo"),
        industry: demo.industry,
        ownerId: DEMO_USER_ID,
        access: [{ userId: DEMO_USER_ID, role: "owner" as const }],
        modules: [...MODULE_KEYS],
        modulesV: MODULES_VERSION,
      },
    ];
    saveWorkspaces(nextWorkspaces);
  } else if (!workspaces.find((w) => w.factoryId === demoFactoryId)?.ownerId) {
    // المساحة اتعملت من زرار التجربة قبل الحساب، فمالهاش مالك: بنربطها
    nextWorkspaces = workspaces.map((w) =>
      w.factoryId === demoFactoryId
        ? { ...w, ownerId: DEMO_USER_ID, access: [{ userId: DEMO_USER_ID, role: "owner" as const }] }
        : w,
    );
    saveWorkspaces(nextWorkspaces);
  }

  return { accounts: nextAccounts, workspaces: nextWorkspaces };
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value.trim());
}

export function isUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const u = new URL(value.trim().startsWith("http") ? value.trim() : `https://${value.trim()}`);
    return !!u.hostname.includes(".");
  } catch {
    return false;
  }
}

/* ── الـSubdomain ──────────────────────────────────────────── */

export const ROOT_DOMAIN = "sanaa.app";

/** كلمات محجوزة: مسارات المنصة نفسها */
export const RESERVED_SLUGS = [
  "www",
  "app",
  "api",
  "admin",
  "dashboard",
  "login",
  "signup",
  "auth",
  "account",
  "billing",
  "help",
  "support",
  "docs",
  "status",
  "mail",
  "static",
  "cdn",
  "assets",
  "sanaa",
  "factory",
  "demo",
  "test",
  "new",
];

/** كلمات بتتشال من اسم المصنع عشان الـslug يطلع مختصر */
const STOP_WORDS = ["مصنع", "شركة", "مؤسسة", "ورشة", "مجموعة", "للملابس", "للإنتاج", "الجاهزة", "factory", "company", "group", "for"];

const AR_MAP: Record<string, string> = {
  ا: "a", أ: "a", إ: "e", آ: "a", ب: "b", ت: "t", ث: "th", ج: "g", ح: "h", خ: "kh",
  د: "d", ذ: "z", ر: "r", ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z",
  ع: "a", غ: "gh", ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", و: "w",
  ي: "y", ى: "a", ة: "a", ئ: "y", ء: "", ؤ: "w",
};

/**
 * اسم المصنع → slug لاتيني.
 * «مصنع النور للملابس الجاهزة» → `alnoor`
 * بنشيل الكلمات العامة الأول، وبعدها نترجم الحروف، وبعدها ننضّف.
 */
export function slugify(name: string): string {
  let words = name
    .trim()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .split(/[\s\-_]+/)
    .filter(Boolean)
    // الكلمات اللي بتبدأ بـ«لل» وصف للنشاط («للملابس»، «للشنط»)، فاسم الـworkspace
    // بياخد الاسم المميّز بس
    .filter((w) => !STOP_WORDS.includes(w) && !/^لل/.test(w));
  if (!words.length) words = name.trim().split(/\s+/).filter(Boolean);

  const latin = words
    .slice(0, 2)
    .map((w) =>
      [...w]
        .map((ch, i, all) => {
          // الواو والياء في وسط الكلمة حروف مدّ مش حروف ساكنة: «النور» = alnoor مش alnwr
          const mid = i > 0 && i < all.length - 1;
          if (ch === "و") return mid ? "oo" : "w";
          if (ch === "ي") return mid ? "i" : "y";
          if (AR_MAP[ch] !== undefined) return AR_MAP[ch];
          return /[a-z0-9]/i.test(ch) ? ch.toLowerCase() : "-";
        })
        .join(""),
    )
    .join("-");

  return latin
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

export type SlugState = "empty" | "short" | "invalid" | "reserved" | "taken" | "free";

export function slugRule(slug: string): Exclude<SlugState, "taken" | "free"> | null {
  if (!slug) return "empty";
  if (slug.length < 3) return "short";
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) return "invalid";
  if (RESERVED_SLUGS.includes(slug)) return "reserved";
  return null;
}

export const SLUG_MESSAGE: Record<SlugState, string> = {
  empty: "اكتب اسم للـworkspace",
  short: "لازم ٣ حروف على الأقل",
  invalid: "حروف إنجليزي صغيرة وأرقام وشرطة بس، وميبدأش أو يخلص بشرطة",
  reserved: "الاسم ده محجوز للمنصة",
  taken: "الاسم ده مستخدم بالفعل",
  free: "متاح",
};

export function slugState(slug: string, workspaces: Workspace[], selfId?: string): SlugState {
  const rule = slugRule(slug);
  if (rule) return rule;
  const taken = workspaces.some((w) => w.subdomain === slug && w.factoryId !== selfId);
  return taken ? "taken" : "free";
}

/** بدائل لما الاسم يكون محجوز أو مستخدم */
export function slugSuggestions(base: string, workspaces: Workspace[], hints: string[] = []): string[] {
  const seeds = [
    ...hints.map((h) => `${base}-${slugify(h)}`),
    `${base}-eg`,
    `${base}-factory`,
    `${base}-garments`,
    `${base}-1`,
  ];
  const out: string[] = [];
  for (const s of seeds) {
    const clean = s.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
    if (slugState(clean, workspaces) === "free" && !out.includes(clean)) out.push(clean);
    if (out.length === 3) break;
  }
  return out;
}

export function workspaceUrl(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`;
}

/* ── تحديد الـTenant ───────────────────────────────────────── */

export type TenantHit = { workspace: Workspace; via: "hostname" | "query" | "session" } | null;

/**
 * ترتيب التحديد: الـhostname الأول (ده اللي الـbackend هيستخدمه)، بعده `?factory=`
 * للتجربة محليًا، وبعده آخر مصنع مختار. لو الـslug مش معروف بنرجّع null عشان
 * الواجهة تقول «الـworkspace ده مش موجود» بدل ما تفتح مصنع تاني بالغلط.
 */
export function resolveTenant(
  hostname: string,
  search: string,
  workspaces: Workspace[],
  current: CurrentState,
): TenantHit {
  const labels = hostname.split(".");
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  if (!isIp && labels.length >= 3 && !hostname.startsWith("www.")) {
    const found = workspaces.find((w) => w.subdomain === labels[0]);
    if (found) return { workspace: found, via: "hostname" };
  }
  const wanted = new URLSearchParams(search).get("factory");
  if (wanted) {
    const found = workspaces.find((w) => w.subdomain === wanted || w.factoryId === wanted);
    return found ? { workspace: found, via: "query" } : null;
  }
  const last = workspaces.find((w) => w.factoryId === current.factoryId);
  return last ? { workspace: last, via: "session" } : null;
}

export function accessibleWorkspaces(workspaces: Workspace[], userId: string | null): Workspace[] {
  if (!userId) return [];
  return workspaces
    .filter((w) => w.ownerId === userId || w.access.some((a) => a.userId === userId))
    .sort((a, b) => (b.lastAccessAt ?? b.createdAt).localeCompare(a.lastAccessAt ?? a.createdAt));
}

export function roleIn(workspace: Workspace, userId: string): "owner" | "accountant" | "supervisor" {
  if (workspace.ownerId === userId) return "owner";
  return workspace.access.find((a) => a.userId === userId)?.role ?? "supervisor";
}

/* ── المسمّى الوظيفي مقابل الصلاحية ────────────────────────── */

/**
 * المسمّيات كتير، والصلاحيات تلاتة. بنعرض المسمّى الوظيفي وبنقول جنبه
 * الصلاحية اللي بتترتب عليه — عشان محدش يتخيّل إن «مدير مصنع» ليه صلاحيات
 * إضافية مش موجودة في النظام فعلًا.
 */
export const JOB_TITLES: { title: string; role: "owner" | "accountant" | "supervisor" }[] = [
  { title: "مدير المصنع", role: "accountant" },
  { title: "مدير الإنتاج", role: "supervisor" },
  { title: "محاسب", role: "accountant" },
  { title: "موارد بشرية", role: "supervisor" },
  { title: "مدير المخزن", role: "supervisor" },
  { title: "مبيعات", role: "accountant" },
  { title: "مراقبة جودة", role: "supervisor" },
  { title: "مشرف خط", role: "supervisor" },
  { title: "عامل", role: "supervisor" },
];

export const ROLE_EXPLAIN: Record<"owner" | "accountant" | "supervisor", string> = {
  owner: "كل حاجة: مسح، استعادة نسخة، موظفين، سجل تعديلات",
  accountant: "يشوف ويسجّل ويعدّل كل الحسابات — بس ميمسحش",
  supervisor: "العمال والحضور وأوامر الإنتاج بس",
};
