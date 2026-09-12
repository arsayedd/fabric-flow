#!/usr/bin/env bash
#
# بيفتح صاب دومين لمصنع: شهادة + بلوك نجينكس.
#
#   SLUG=alnoor SSH_TARGET=root@187.127.79.131 ./deploy/subdomain.sh
#
# وينفع أكتر من واحد مرة واحدة:
#   SLUG="alnoor ahmed nour" SSH_TARGET=sanaa-srv ./deploy/subdomain.sh
#
# أو وإنت على السيرفر:
#   SLUG=alnoor SSH_TARGET=local ./deploy/subdomain.sh
#
# ## ده الطريق الاحتياطي، مش الأساسي
#
# لو `*.sanaa.cloud` عندها شهادة wildcard (`deploy/wildcard.sh`)، أي
# مصنع بيشتغل على عنوانه من غير أي خطوة هنا. السكربت ده للحالة اللي
# مافيهاش wildcard: كل صاب دومين محتاج شهادته بإيدك.
#
# وحدّه اللي لازم تعرفه: Let's Encrypt بتسمح بـ٥٠ شهادة للدومين في
# الأسبوع، فالطريق ده سقفه ٥٠ مصنع جديد في الأسبوع.
#
# الشرط الوحيد قبل التشغيل: سجل DNS للـslug (أو wildcard `*`) يشاور على
# السيرفر. السكربت بيتأكد من ده الأول، لأن التحقق بيفشل من غيره وLet's
# Encrypt بتحسب المحاولة الفاشلة في حدودها.
#
# بيشيل الشهادة والبلوك؟ لأ. الحذف يدوي بقصد: `certbot delete` + مسح
# الملف — عشان مايحصلش إن سكربت رفع يقفل صاب دومين شغّال بالغلط.
#
set -euo pipefail

SLUG="${SLUG:?لازم تحدد SLUG — مثال: SLUG=alnoor}"
DOMAIN="${DOMAIN:-sanaa.cloud}"
SITE_USER="${SITE_USER:-sanaa}"
SSH_TARGET="${SSH_TARGET:?لازم تحدد SSH_TARGET — أو SSH_TARGET=local}"
EMAIL="${LE_EMAIL:-admin@${DOMAIN}}"


HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf "\n\033[1m▸ %s\033[0m\n" "$1"; }

LOCAL=0
[ "$SSH_TARGET" = "local" ] && LOCAL=1
sh_run() {
  if [ "$LOCAL" = "1" ]; then bash -c "$1"; else ssh "$SSH_TARGET" "$1"; fi
}

# كل الأسماء بتتفحص **قبل** أي شغل على السيرفر: أوحش حاجة إننا نطلب
# شهادتين وننهار على التالت ونسيب الحالة في النص
for s in $SLUG; do
  # الـslug لازم يبقى حرف/رقم/شرطة — أي حاجة تانية بتدخل في اسم ملف
  # وفي `server_name`، وماينفعش نسيبها تتكتب من غير فحص
  if ! printf '%s' "$s" | grep -qE '^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$'; then
    echo "✗ الـslug لازم يكون حروف لاتيني صغيرة وأرقام وشرطة: '$s'"
    exit 1
  fi
done

say "التأكد إن الأسماء بتشاور على السيرفر"
WANT="$(sh_run "curl -s -4 https://api.ipify.org || hostname -I | awk '{print \$1}'")"
echo "  السيرفر هو: $WANT"
for s in $SLUG; do
  GOT="$(dig +short "${s}.${DOMAIN}" | tail -1)"
  echo "  ${s}.${DOMAIN} → ${GOT:-مافيش}"
  if [ -z "$GOT" ]; then
    echo "✗ مافيش سجل DNS لـ${s}.${DOMAIN}. ضيف سجل A للـslug، أو سجل wildcard:"
    echo "    A   *   ->  $WANT"
    exit 1
  fi
done

for s in $SLUG; do
  HOST="${s}.${DOMAIN}"

  say "الشهادة — $HOST"
  sh_run "$(cat <<EOF
set -eu
mkdir -p /var/www/letsencrypt
if [ -d /etc/letsencrypt/live/${HOST} ]; then
  echo '  فيه شهادة بالفعل — مش بنطلب واحدة جديدة'
else
  certbot certonly --webroot -w /var/www/letsencrypt \
    -d ${HOST} --non-interactive --agree-tos -m ${EMAIL} --no-eff-email
fi
EOF
)"

  say "بلوك نجينكس — $HOST"
  sed "s|SLUG|${s}|g" "${HERE}/nginx/subdomain.conf.tpl" > "/tmp/sanaa-sub-${s}.conf"
  if [ "$LOCAL" = "1" ]; then
    install -m 644 "/tmp/sanaa-sub-${s}.conf" "/etc/nginx/sanaa-subdomains.d/${s}.conf"
  else
    scp -q "/tmp/sanaa-sub-${s}.conf" "$SSH_TARGET:/etc/nginx/sanaa-subdomains.d/${s}.conf"
  fi
done

# `nginx -t` قبل الـreload: الملف ده جوه سيرفر فيه مواقع تانية شغّالة،
# وreload بإعداد غلط بيوقّعها كلها مش صنعة بس
sh_run "nginx -t && systemctl reload nginx"

say "الاتأكد"
BAD=0
for s in $SLUG; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://${s}.${DOMAIN}/" || true)"
  echo "  https://${s}.${DOMAIN}/  →  $CODE"
  if [ "$CODE" != "200" ]; then
    echo "    ✗ مارد ٢٠٠ — شوف /home/${SITE_USER}/logs/nginx/sub-${s}-error.log"
    BAD=1
  fi
done
[ "$BAD" = "0" ] || exit 1

say "تم"
