# الرفع على السيرفر والدومين

**صنعة شغّالة على <https://sanaa.cloud>.**

السيرفر: Ubuntu 24.04 عليه CloudPanel — `187.127.79.131`. وعليه مواقع
تانية شغّالة، فكل حاجة هنا محدودة على موقع `sanaa.cloud` وبس.

صنعة النهارده **تطبيق ثابت**: البناء بيطلع ملفات HTML و JS و CSS، مافيش
عملية شغّالة على السيرفر ولا بورت بيسمع. يعني مافيش حاجة تقع في نص الليل.
بس خُد بالك من نتيجة واحدة مهمة:

> **البيانات لسه في المتصفح.** كل مصنع متخزّن في `localStorage` على الجهاز
> اللي بيفتح منه. يعني لو فتحت من لابتوبك ومن موبايلك، دول **مصنعين
> مختلفين** مش نفس المصنع. الرفع على الدومين خلّى النظام متاح من أي مكان،
> مش خلّى البيانات مشتركة. المشاركة دي هي بالظبط شغلة Supabase —
> [supabase.md](./supabase.md).

---

## اللي مركّب دلوقتي

| الحاجة | القيمة |
|---|---|
| الدومين | `sanaa.cloud` + `www.sanaa.cloud` (بيحوّل على الأصلي) |
| سجل A | `sanaa.cloud` و `www` → `187.127.79.131` |
| نوع الموقع في CloudPanel | Static Site |
| مستخدم الموقع | `sanaa` |
| مسار الملفات | `/home/sanaa/htdocs/sanaa.cloud` |
| الشهادة | Let's Encrypt، بتتجدد لوحدها |
| صاب دومين المصانع | `*` → نفس السيرفر · [subdomains.md](./subdomains.md) |
| كلمة سر مستخدم الموقع | على السيرفر في `/root/sanaa-site-credentials.txt` (صلاحية ٦٠٠) |

كلمة السر دي اتولّدت على السيرفر نفسه ومافاتتش في أي مكان تاني. لو
احتجتها: `ssh root@187.127.79.131 cat /root/sanaa-site-credentials.txt`،
أو غيّرها من اللوحة.

---

## التحديث بعد أي تعديل

سطر واحد من جهازك:

```bash
DOMAIN=sanaa.cloud SITE_USER=sanaa SSH_TARGET=root@187.127.79.131 ./deploy/deploy.sh
```

السكربت بيبني محليًا، بيرفع نسخة جانبية، وبعدين **بيبدّل** المجلد بحركة
واحدة. التبديل ده مش تفاصيل: لو كتبنا فوق القديم، فيه ثانية أو اتنين
الـ`index.html` الجديد بيطلب ملفات لسه ماوصلتش، واللي فاتح النظام في
اللحظة دي بيشوف شاشة بيضا. وبيسيب آخر نسختين للرجوع السريع.

وفي الآخر بيتأكد بنفسه إن `/` و`/orders` الاتنين بيردوا ٢٠٠، وبيفشل لو لأ.

ومستخدم فاتح النظام وقت التحديث؟ السيرفس ووركر بيلاقي نسخة جديدة ويحدّث
نفسه، والبيانات في متصفحه مابتتلمسش.

### البناء محليًا مش على السيرفر

بقصد. السيرفر ده عليه مواقع شغّالة، و`vite build` بياخد حوالي ٢ جيجا رام
في الذروة. لو مضطر تبني عليه، نفس السكربت بيشتغل هناك:

```bash
DOMAIN=sanaa.cloud SITE_USER=sanaa SSH_TARGET=local ./deploy/deploy.sh
```

---

## الاتأكد إنه شغّال

الاختبار بيفتح الدومين بمتصفح حقيقي ويجرّب ٣٨ حاجة — الدخول التجريبي،
الـRefresh جوه الشاشات، الخط، سيرفس ووركر، الهيدرز، الموبايل:

```bash
SANAA_URL=https://sanaa.cloud node tests/live-site.mjs
```

ولو عايز تتأكد بإيدك:

```bash
curl -sI https://sanaa.cloud/         # 200 · Cache-Control: no-store
curl -sI https://sanaa.cloud/orders   # 200 — لو 404 يبقى try_files ناقص
curl -sI https://sanaa.cloud/sw.js    # لازم Cache-Control: no-store
```

وفي المتصفح: افتح الدومين، اضغط **دخول تجريبي → صاحب المصنع**، وشوف مصنع
النور والشريط الأصفر. أو ادخل بالحساب المعروض على الشاشة نفسها. وبعدها
اعمل Refresh وإنت جوه `/orders` — لازم تفضل في نفس الشاشة.

---

## إعداد نجينكس — أهم خطوة، ومعمولة

القالب الجاهز للموقع الثابت في CloudPanel **مش كفاية** لصنعة، لسببين
الاتنين بيخلّوا نظام سليم يبان مكسور:

1. مافيهوش `location /` خالص، فأي مسار جوه صنعة (`/orders`, `/health`)
   بياخد ٤٠٤ أول Refresh. الصفحة الرئيسية تفتح عادي، وأول ما حد يحدّث
   وهو جوه شاشة تضيع.
2. بيحط `expires max` على أي حاجة بتنتهي بـ`.js`، وده بيشمل `sw.js`.
   سيرفس ووركر متكاش معناه مستخدم قاعد على نسخة قديمة من النظام ومش
   عارف — أسوأ حاجة تحصل في نظام بيمشي عليه فلوس مصنع.

الإعداد المرفوع هو [`deploy/cloudpanel-vhost.conf`](../deploy/cloudpanel-vhost.conf)
وفيه كمان: نوع صح لملف الـmanifest، `=404` على ملفات البناء الناقصة،
والهيدرز الأمنية موصولة على الصفحات نفسها كمان (وفي نجينكس أي
`location` بيحط `add_header` بيرمي اللي فوقه، فدي كانت بتتكسر بسهولة).

لو احتجت تعدّله:

```bash
DOMAIN=sanaa.cloud ./deploy/vhost.sh
```

وحُط الناتج في **Sites → sanaa.cloud → Vhost** بدل اللي موجود. اللوحة هي
اللي بتعمل `nginx -t` وترفض الحفظ لو فيه غلطة — فهي الطريق الآمن، ولازم
تكون هي المصدر عشان تعديلاتك مايتكتبش فوقها.

---

## لو عايز ترفع من الأول على دومين تاني

```bash
# ١) سجل A للدومين و www → 187.127.79.131، واستنى ينتشر
dig +short YOUR-DOMAIN.com

# ٢) الموقع (Static مش Node.js)
ssh root@187.127.79.131 \
  "clpctl site:add:static --domainName=YOUR-DOMAIN.com --siteUser=USER --siteUserPassword='...'"

# ٣) الشهادة
ssh root@187.127.79.131 \
  "clpctl lets-encrypt:install:certificate --domainName=YOUR-DOMAIN.com --subjectAlternativeName=www.YOUR-DOMAIN.com"

# ٤) الـvhost — من اللوحة
DOMAIN=YOUR-DOMAIN.com ./deploy/vhost.sh

# ٥) الرفع
DOMAIN=YOUR-DOMAIN.com SITE_USER=USER SSH_TARGET=root@187.127.79.131 ./deploy/deploy.sh

# ٦) الاتأكد
SANAA_URL=https://YOUR-DOMAIN.com node tests/live-site.mjs
```

---

## حاجتين أمان على السيرفر نفسه

مش جزء من صنعة، بس ليها لازمة لأن السيرفر ده عليه مواقع شغّالة:

1. **لوحة CloudPanel على ٨٤٤٣ مفتوحة للدنيا كلها.** قفلها على IP بيتك أو
   المكتب — Admin Area → Security → IP Address Restriction. أو:
   ```bash
   ufw allow from YOUR.IP.HERE to any port 8443 proto tcp
   ufw deny 8443
   ```
2. **الدخول بـroot بكلمة سر لسه مفتوح.** بعد ما تتأكد إن المفتاح بيدخل:
   ```bash
   # /etc/ssh/sshd_config → PasswordAuthentication no
   systemctl reload ssh
   ```
