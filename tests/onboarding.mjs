import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
/* الدومين من المصدر، مش مكتوب هنا: التأكيد لازم يقيس العنوان اللي
 * الواجهة بتبنيه فعلًا، مش قيمة اتكتبت في الاختبار وقت ما كانت صح */
/* `import.meta.dirname` مش `new URL`: الملف ده بيعرّف `const URL` تحت،
 * وده بيحجب الـURL العامة في الموديول كله */
const ROOT_DOMAIN =
  readFileSync(`${import.meta.dirname}/../src/store/account.ts`, "utf8").match(
    /VITE_APP_DOMAIN\?\.trim\(\) \|\| "([^"]+)"/,
  )?.[1] ?? "";

const URL = "http://127.0.0.1:43127";
let pass = 0;
const fails = [];
const logs = [];

const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fails.push(name);
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
};

const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1340, height: 1000 } });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(`[error] ${m.text()}`));

const store = () =>
  page.evaluate(() => ({
    accounts: JSON.parse(localStorage.getItem("sanaa.accounts.v1") ?? "[]"),
    workspaces: JSON.parse(localStorage.getItem("sanaa.workspaces.v1") ?? "[]"),
    current: JSON.parse(localStorage.getItem("sanaa.current.v1") ?? "{}"),
    keys: Object.keys(localStorage).filter((k) => k.startsWith("factory-ledger.v1")),
  }));

await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

console.log("\n— الصفحة الرئيسية —");
const landing = await page.locator("body").innerText();
ok("hero headline", landing.includes("إدارة مصنعك بالكامل من مكان واحد"));
ok("both CTAs", landing.includes("ابدأ مجانًا") && landing.includes("شاهد كيف تعمل صنعة"));
ok("features listed", (await page.locator("#features > div > div").count()) === 13, `${await page.locator("#features > div > div").count()} بند`);
ok("how it works", (await page.locator("#how .grid > div").count()) === 5);
ok("costing visual", landing.includes("إجمالي التكلفة") && landing.includes("الماركب"));
ok("final CTA", landing.includes("ابدأ إدارة مصنعك بطريقة أذكى"));

console.log("\n— خطوة ١: الحساب —");
await page.getByRole("link", { name: "ابدأ مجانًا" }).first().click();
await page.waitForURL(/signup/);
const next1 = page.getByRole("button", { name: /التالي: بيانات المصنع/ });
ok("next disabled on empty form", await next1.isDisabled());
await page.getByPlaceholder("أحمد محمود").fill("أحمد محمود");
await page.getByPlaceholder("ahmed@alnoor.com").fill("ahmed@alnoor.com");
await page.getByPlaceholder("1012345678").fill("1012345678");
const pwd = page.locator("input[autocomplete='new-password']");
await pwd.nth(0).fill("ahmed");
ok("weak password flagged", (await page.locator("body").innerText()).includes("ضعيفة"));
await pwd.nth(0).fill("Ahmed@2026");
ok("strong password met all rules", (await page.locator("body").innerText()).includes("قوية"));
await pwd.nth(1).fill("Ahmed@2025");
ok("mismatch blocks", (await page.locator("body").innerText()).includes("الكلمتين مش زي بعض") && (await next1.isDisabled()));
await pwd.nth(1).fill("Ahmed@2026");
ok("terms still required", await next1.isDisabled());
await page.locator("input[type=checkbox]").first().check();
ok("next enabled after terms", await next1.isEnabled());
await next1.click();

console.log("\n— خطوة ٢: المصنع —");
const next2 = page.getByRole("button", { name: /التالي: الـWorkspace/ });
await page.getByPlaceholder("مصنع النور للملابس الجاهزة").fill("مصنع النور للملابس الجاهزة");
ok("type required", await next2.isDisabled());
await page.getByRole("button", { name: "ملابس جاهزة", exact: true }).click();
await page.getByPlaceholder("العاشر من رمضان").fill("العاشر من رمضان");
await page.getByPlaceholder("https://alnoor.com").fill("not a url");
ok("bad website flagged", (await page.locator("body").innerText()).includes("اللينك مش مظبوط") && (await next2.isDisabled()));
await page.getByPlaceholder("https://alnoor.com").fill("https://alnoor.com");
await page.getByRole("button", { name: "51-100" }).click();
await next2.click();

console.log("\n— خطوة ٣: الـsubdomain —");
await page.waitForTimeout(600);
const slugInput = page.locator("input[placeholder='alnoor']");
ok("slug derived from arabic name", (await slugInput.inputValue()) === "alnoor", await slugInput.inputValue());
ok("url preview", (await page.locator("body").innerText()).includes(`https://alnoor.${ROOT_DOMAIN}`));
const go = page.getByRole("button", { name: /جهّز المصنع/ });
await slugInput.fill("admin");
await page.waitForTimeout(600);
ok("reserved slug refused", (await page.locator("body").innerText()).includes("محجوز للمنصة") && (await go.isDisabled()));
const sugg = await page.locator("button.latin.rounded-full").allInnerTexts();
ok("alternatives offered", sugg.length >= 3, sugg.join(" · "));
await slugInput.fill("a");
await page.waitForTimeout(600);
ok("short slug refused", (await page.locator("body").innerText()).includes("٣ حروف"));
await slugInput.fill("alnoor");
await page.waitForTimeout(600);
ok("available slug accepted", await go.isEnabled());

// الرجوع لخطوة قبلها ما بيضيّعش البيانات
await page.getByRole("button", { name: /رجوع/ }).click();
ok("step 2 kept its data", (await page.getByPlaceholder("مصنع النور للملابس الجاهزة").inputValue()) === "مصنع النور للملابس الجاهزة");
await page.getByRole("button", { name: /التالي: الـWorkspace/ }).click();
await page.waitForTimeout(600);
ok("slug survived the trip", (await page.locator("input[placeholder='alnoor']").inputValue()) === "alnoor");

console.log("\n— إنشاء المصنع —");
await page.getByRole("button", { name: /جهّز المصنع/ }).click();
await page.waitForTimeout(1200);
const after = await store();
ok("one account stored", after.accounts.length === 1, after.accounts[0]?.email);
ok("password is hashed, not stored", !JSON.stringify(after.accounts).includes("Ahmed@2026") && after.accounts[0].passwordHash.length === 64);
ok("workspace bound to factory id", after.workspaces.length === 1 && after.workspaces[0].subdomain === "alnoor" && !!after.workspaces[0].factoryId);
ok("factory data in its own key", after.keys.includes(`factory-ledger.v1:${after.workspaces[0].factoryId}`), after.keys.join(", "));
ok("onboarding answers kept", after.workspaces[0].employees === "51-100" && after.workspaces[0].city === "العاشر من رمضان" && after.workspaces[0].website === "https://alnoor.com");
ok("owner recorded", after.workspaces[0].ownerId === after.accounts[0].id);

console.log("\n— خطوة ٤ و٥ —");
const body4 = await page.locator("body").innerText();
ok("modules step asks about the work, not the screens", body4.includes("طبيعة شغلك"));
ok("modules can be turned on later", body4.includes("توقف أي قسم في أي وقت"));
ok("unbuilt modules declared", body4.includes("قريب"));
for (const m of ["القص والتشغيل", "التوريد والاستلام", "المرتجعات والإصلاحات", "المستندات والطباعة", "QR والباركود"]) {
  ok(`module «${m}» offered`, body4.includes(m));
}
ok("quality is no longer marked unbuilt", !/الجودة والفحص[\s\S]{0,90}قريب/.test(body4));
ok("select all offered", (await page.getByRole("button", { name: /اختيار الكل|شيل الكل/ }).count()) > 0);
await page.getByRole("button", { name: /شيل الكل/ }).first().click();
await page.waitForTimeout(300);
ok("clearing all blocks next", await page.getByRole("button", { name: /التالي: الفريق/ }).isDisabled());
await page.getByRole("button", { name: /اختيار الكل/ }).first().click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /الخزينة والتحصيل/ }).click();
await page.getByRole("button", { name: /التالي: الفريق/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /إضافة موظف/ }).click();
await page.getByPlaceholder("محمد سيد").fill("محمد سيد");
await page.getByPlaceholder("mohamed@alnoor.com").fill("mohamed@alnoor.com");
const roleText = await page.locator("body").innerText();
ok("role explained next to job title", roleText.includes("ميمسحش") || roleText.includes("العمال والحضور"));
await page.getByRole("button", { name: /دعوة الموظفين/ }).click();
await page.waitForTimeout(400);
const review = await page.locator("body").innerText();
ok("review screen", review.includes("مصنعك جاهز على صنعة"));
ok("workspace url shown", review.includes(`https://alnoor.${ROOT_DOMAIN}`));
ok("review counts the open sections", /قسم مفتوح/.test(review));
ok("review shows what the trade template seeded", /خام(ة|تين|ات)/.test(review) && /عملي(ة|تين|ات)/.test(review));
ok("review records the invite", /(دعوة واحدة|دعوتين|دعوات|دعوة) مسجّلة/.test(review));

console.log("\n— أول دخول —");
await page.getByRole("button", { name: /دخول إلى لوحة التحكم/ }).click();
await page.waitForTimeout(500);
await page.waitForTimeout(600);
const home = await page.locator("body").innerText();
ok("welcome card", home.includes("أهلًا بك في صنعة"));
const pctBefore = Number((home.match(/تجهيز المصنع ([٠-٩]+)٪/)?.[1] ?? "0").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)));
ok("setup progress shown", pctBefore > 0 && pctBefore < 100, `${pctBefore}٪`);
ok("invited employee kept", (await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).invites.length, `factory-ledger.v1:${after.workspaces[0].factoryId}`)) === 1);
ok("email verification offered", home.includes("أكّد إيميلك"));
ok(
  "sidebar honoured module picks",
  !(await page.locator("aside a[href='/collections']").count()) && (await page.locator("aside a[href='/costing']").count()) === 1,
  "التحصيل اتشال والتكلفة فاضلة",
);

// الخطوة بتتشال لوحدها لما البيانات تتسجّل — النسبة محسوبة مش متخزّنة
await page.goto(`${URL}/workers`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /عامل جديد|إضافة عامل/ }).first().click();
await page.waitForTimeout(200);
await page.locator("input").first().fill("سعيد علي");
await page.locator("input[inputmode='decimal'], input[inputmode='numeric']").first().fill("250");
await page.getByRole("button", { name: /^حفظ/ }).first().click();
await page.waitForTimeout(400);
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const home2 = await page.locator("body").innerText();
const pctAfter = Number((home2.match(/تجهيز المصنع ([٠-٩]+)٪/)?.[1] ?? "0").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)));
ok("progress reacts to real data", pctAfter > pctBefore, `${pctBefore}٪ → ${pctAfter}٪`);

console.log("\n— تأكيد الإيميل —");
const code = (await store()).accounts[0].verifyCode;
await page.locator("input[inputmode='numeric']").first().fill("000000");
await page.getByRole("button", { name: "تأكيد", exact: true }).click();
await page.waitForTimeout(300);
ok("wrong code rejected", !(await store()).accounts[0].emailVerified);
await page.locator("input[inputmode='numeric']").first().fill(code);
await page.getByRole("button", { name: "تأكيد", exact: true }).click();
await page.waitForTimeout(400);
ok("right code verifies", (await store()).accounts[0].emailVerified);
ok("banner disappears", !(await page.locator("body").innerText()).includes("أكّد إيميلك"));

console.log("\n— مصنع تاني لنفس الحساب —");
await page.goto(`${URL}/factories/new`, { waitUntil: "networkidle" });
await page.getByPlaceholder("مصنع النور للملابس الجاهزة").fill("مصنع الأمل للشنط");
await page.getByRole("button", { name: "شنط وجلود", exact: true }).click();
await page.getByRole("button", { name: /التالي: الـWorkspace/ }).click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /جهّز المصنع/ }).click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /التالي: الفريق/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: /تخطي الآن/ }).click();
await page.waitForTimeout(400);
const two = await store();
ok("two workspaces, two storage keys", two.workspaces.length === 2 && two.keys.length === 2, two.keys.join(", "));
ok("slugs differ", two.workspaces[0].subdomain !== two.workspaces[1].subdomain, two.workspaces.map((w) => w.subdomain).join(" · "));
await page.getByRole("button", { name: /دخول إلى لوحة التحكم/ }).click();
await page.waitForTimeout(700);
const second = await page.locator("body").innerText();
ok("new factory starts empty", second.includes("تجهيز المصنع"));
ok("second factory has no workers of the first", (await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).workers.length, two.keys.find((k) => k.includes(two.current.factoryId)))) === 0);

console.log("\n— تبديل المصنع —");
await page.locator("aside button").first().click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: /مصنع النور/ }).first().click();
await page.waitForTimeout(700);
ok("switched back", (await page.locator("aside").innerText()).includes("مصنع النور"));
ok("first factory still has its worker", (await page.locator("body").innerText()).length > 0 && (await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).workers.length, `factory-ledger.v1:${after.workspaces[0].factoryId}`)) === 1);

console.log("\n— دخول وخروج —");
await page.goto(`${URL}/settings`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /خروج من الحساب/ }).click();
await page.waitForTimeout(500);
ok("logged out lands on landing", (await page.locator("body").innerText()).includes("إدارة مصنعك بالكامل"));
await page.goto(`${URL}/login`, { waitUntil: "networkidle" });
await page.locator("input[type=email]").fill("ahmed@alnoor.com");
await page.locator("input[type=password]").fill("wrong-pass");
await page.getByRole("button", { name: "دخول" }).click();
await page.waitForTimeout(700);
ok("wrong password refused", (await page.locator("body").innerText()).includes("الإيميل أو كلمة السر غلط"));
await page.locator("input[type=password]").fill("Ahmed@2026");
await page.getByRole("button", { name: "دخول" }).click();
await page.waitForTimeout(900);
ok("two factories → picker", (await page.locator("body").innerText()).includes("اختار المصنع"));
await page.getByRole("button", { name: /مصنع الأمل/ }).first().click();
await page.waitForTimeout(800);
ok("picked factory opens", (await page.locator("aside").innerText()).includes("مصنع الأمل"));

console.log("\n— تحديد المصنع من العنوان —");
await page.goto(`${URL}/?factory=alnoor`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
ok("slug in the url resolves the tenant", (await page.locator("aside").innerText()).includes("مصنع النور"));
await page.goto(`${URL}/?factory=nope`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
ok("unknown slug says so", (await page.locator("body").innerText()).includes("مش موجود"));

console.log("\n— المصنع القديم على الجهاز —");
await page.goto(URL, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: /صاحب المصنع/ }).first().click();
await page.waitForTimeout(800);
ok("demo still works from the landing page", (await page.locator("aside").innerText()).includes("مصنع"));
const demo = await store();
ok("demo registered as a workspace", demo.workspaces.length === 1 && !demo.workspaces[0].ownerId);

console.log(`\n${pass} ok · ${fails.length} fail · ${logs.length} console errors`);
fails.forEach((f) => console.log("  FAILED:", f));
logs.slice(0, 6).forEach((l) => console.log("  ", l));
await browser.close();
process.exit(fails.length ? 1 : 0);
