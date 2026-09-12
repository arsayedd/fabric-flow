#!/usr/bin/env bash
#
# شهادة wildcard لـ`*.sanaa.cloud` — عشان أي مصنع يشتغل على عنوانه من
# غير أي خطوة على السيرفر.
#
#   CF_TOKEN=xxxxx SSH_TARGET=sanaa-srv ./deploy/wildcard.sh
#
# ## قبل ما تشغّله: الـDNS لازم يبقى على Cloudflare
#
# الـwildcard لازم تحقق **DNS-01** — Let's Encrypt مابتقبلش HTTP-01
# لشهادة wildcard. ويعني certbot لازم يقدر يكتب سجل TXT لوحده، يعني
# محتاج API للـDNS.
#
# والـDNS دلوقتي على Hostinger (`nova.dns-parking.com`)، و**مافيش إضافة
# certbot لـHostinger** — لا في apt ولا رسمية. الموجود في apt: Cloudflare
# وDigitalOcean وGoogle وLinode وOVH وRFC2136 وغيرهم.
#
# فالطريق الأنضف: ننقل الـDNS لـCloudflare (مجاني)، وبعدها الشهادة
# أمر واحد وبتتجدد لوحدها مع `certbot.timer` اللي شغّال أصلًا.
#
# الخطوات على Cloudflare:
#   ١) Add a site → sanaa.cloud (خطة Free)
#   ٢) Cloudflare بيستورد السجلات الحالية — **راجعها** وتأكد إن فيها:
#        A   @        -> 187.127.79.131
#        A   *        -> 187.127.79.131
#        A   www      -> 187.127.79.131
#      وخلّي الـProxy **Off** (سهم رمادي) على الأقل في الأول: الـproxy
#      بيخفي IP السيرفر وبيغيّر شكل الشهادات، ومحتاج مراجعة لوحدها.
#   ٣) في Hostinger غيّر الـnameservers للي Cloudflare بيقولهم
#   ٤) استنى الـNS تتحول (بيبان في Cloudflare)
#   ٥) اعمل توكن: My Profile → API Tokens → Create → Edit zone DNS،
#      وحدّده على zone `sanaa.cloud` بس
#
# التوكن **مابيتحطّش في الشات ولا في الريبو**. حطّه في Secrets وشغّل
# السكربت، وهو بيكتبه على السيرفر في ملف لرووت بس (٦٠٠).
#
set -euo pipefail

DOMAIN="${DOMAIN:-sanaa.cloud}"
SITE_USER="${SITE_USER:-sanaa}"
SSH_TARGET="${SSH_TARGET:?لازم تحدد SSH_TARGET — أو SSH_TARGET=local}"
CF_TOKEN="${CF_TOKEN:?لازم تحدد CF_TOKEN — توكن Cloudflare بصلاحية Edit zone DNS}"
EMAIL="${LE_EMAIL:-admin@${DOMAIN}}"
LINEAGE="${DOMAIN}-wildcard"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
say() { printf "\n\033[1m▸ %s\033[0m\n" "$1"; }

LOCAL=0
[ "$SSH_TARGET" = "local" ] && LOCAL=1
sh_run() {
  if [ "$LOCAL" = "1" ]; then bash -c "$1"; else ssh "$SSH_TARGET" "$1"; fi
}

say "التأكد إن الـDNS على Cloudflare"
NS="$(dig +short NS "$DOMAIN" | tr '\n' ' ')"
echo "  nameservers: ${NS:-مافيش}"
if ! printf '%s' "$NS" | grep -qi cloudflare; then
  cat <<'EOF'
✗ الـnameservers لسه مش على Cloudflare.

  الـwildcard لازم تحقق DNS-01، وده محتاج API للـDNS. ومافيش إضافة
  certbot لـHostinger. الخطوات مكتوبة فوق في أول الملف ده.

  ولحد ما ده يحصل، كل صاب دومين محتاج شهادته بـ:
     SLUG=<الاسم> SSH_TARGET=<السيرفر> ./deploy/subdomain.sh
EOF
  exit 1
fi

say "تركيب إضافة Cloudflare في certbot"
# apt مش pip: الـcertbot هنا بتاع النظام وبيجدّد شهادات ١٣ موقع تاني
# على السيرفر ده. تركيب حزمة بايثون بـpip جوه بيئة النظام بيقدر يكسر
# الاعتماديات ويوقّع تجديد مواقع ملهاش علاقة بصنعة.
sh_run "DEBIAN_FRONTEND=noninteractive apt-get install -y python3-certbot-dns-cloudflare >/dev/null && certbot plugins 2>/dev/null | grep -q dns-cloudflare && echo '  تمام — الإضافة ظهرت في certbot'"

say "كتابة التوكن على السيرفر"
# بيتكتب على السيرفر مباشرة بصلاحية ٦٠٠. وcertbot بيرفض يشتغل لو
# الملف مقروء لغير الرووت أصلًا.
printf 'dns_cloudflare_api_token = %s\n' "$CF_TOKEN" | sh_run "install -d -m 700 /root/.secrets && cat > /root/.secrets/cloudflare.ini && chmod 600 /root/.secrets/cloudflare.ini && echo '  اتكتب في /root/.secrets/cloudflare.ini'"

say "طلب الشهادة"
sh_run "$(cat <<EOF
set -eu
if [ -d /etc/letsencrypt/live/${LINEAGE} ]; then
  echo '  فيه شهادة wildcard بالفعل — بنجدّدها لو قربت تنتهي'
  certbot renew --cert-name ${LINEAGE} --non-interactive || true
else
  certbot certonly \
    --dns-cloudflare \
    --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
    --dns-cloudflare-propagation-seconds 30 \
    --cert-name ${LINEAGE} \
    -d '*.${DOMAIN}' -d '${DOMAIN}' \
    --non-interactive --agree-tos -m ${EMAIL} --no-eff-email
fi
openssl x509 -in /etc/letsencrypt/live/${LINEAGE}/fullchain.pem -noout -ext subjectAltName
EOF
)"

say "بلوك نجينكس الجامع"
if [ "$LOCAL" = "1" ]; then
  install -d -m 755 /etc/nginx/sanaa-subdomains.d
  install -m 644 "${HERE}/nginx/sanaa-catchall.conf" /etc/nginx/sanaa-subdomains.d/000-catchall.conf
else
  sh_run "install -d -m 755 /etc/nginx/sanaa-subdomains.d"
  scp -q "${HERE}/nginx/sanaa-catchall.conf" "$SSH_TARGET:/etc/nginx/sanaa-subdomains.d/000-catchall.conf"
fi

# `nginx -t` قبل الـreload: السيرفر ده فيه مواقع تانية شغّالة، وreload
# بإعداد غلط بيوقّعها كلها مش صنعة بس
sh_run "nginx -t && systemctl reload nginx"

say "الاتأكد — اسم عشوائي المفروض يفتح ويقول إن الـworkspace مش موجود"
PROBE="probe-$(date +%s)"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://${PROBE}.${DOMAIN}/" || true)"
echo "  https://${PROBE}.${DOMAIN}/  →  $CODE"
if [ "$CODE" = "200" ]; then
  say "تم. أي صاب دومين على ${DOMAIN} بيفتح من غير أي خطوة على السيرفر"
else
  echo "✗ مارد ٢٠٠ — شوف /home/${SITE_USER}/logs/nginx/subdomains-error.log"
  exit 1
fi
