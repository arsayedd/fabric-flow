#!/usr/bin/env bash
#
# رفع صنعة على سيرفر CloudPanel.
#
# الاستعمال:
#   DOMAIN=sanaa.example.com SITE_USER=sanaa SSH_TARGET=root@187.127.79.131 ./deploy/deploy.sh
#
# بيبني محليًا وبيرفع الناتج بس. البناء مابيحصلش على السيرفر بقصد:
# سيرفر ٤ جيجا بيقع تحت `vite build`، والبناء المحلي كمان معناه إن اللي
# بيتعدّي على السيرفر ملفات ثابتة متأكد إنها بنت صح.
#
set -euo pipefail

DOMAIN="${DOMAIN:?لازم تحدد DOMAIN — مثال: DOMAIN=sanaa.example.com}"
SSH_TARGET="${SSH_TARGET:?لازم تحدد SSH_TARGET — مثال: SSH_TARGET=root@187.127.79.131}"
SITE_USER="${SITE_USER:?لازم تحدد SITE_USER — اسم مستخدم الموقع من CloudPanel}"
REMOTE_ROOT="/home/${SITE_USER}/htdocs/${DOMAIN}"

say() { printf "\n\033[1m▸ %s\033[0m\n" "$1"; }

say "بناء نسخة الإنتاج"
npm ci
npm run build

# البناء لازم يطلع index.html وservice worker، وغير كده يبقى فيه حاجة غلط
for f in dist/index.html dist/sw.js; do
  [ -f "$f" ] || { echo "✗ $f مش موجود — البناء مش كامل"; exit 1; }
done
say "حجم الناتج: $(du -sh dist | cut -f1)"

say "التأكد إن مسار الموقع موجود على السيرفر"
ssh "$SSH_TARGET" "test -d '$REMOTE_ROOT'" || {
  echo "✗ $REMOTE_ROOT مش موجود على السيرفر."
  echo "  اعمل الموقع الأول من CloudPanel: Sites → Add Site → Static Site،"
  echo "  وبعدها شغّل السكربت تاني."
  exit 1
}

#
# الرفع بنسخة جانبية وبعدها تبديل، مش كتابة فوق القديم.
#
# لو رفعنا فوق الموجود، فيه ثانية أو اتنين الـindex.html الجديد بيشاور
# على ملفات assets لسه ماوصلتش — واللي فاتح النظام في اللحظة دي بيشوف
# شاشة بيضا. التبديل بـmv بياخد جزء من الثانية.
#
STAMP="$(date +%Y%m%d-%H%M%S)"
say "رفع الملفات (نسخة $STAMP)"
ssh "$SSH_TARGET" "mkdir -p '${REMOTE_ROOT}.next' && rm -rf '${REMOTE_ROOT}.next'/*"
rsync -az --delete dist/ "$SSH_TARGET:${REMOTE_ROOT}.next/"

say "تبديل النسخة"
ssh "$SSH_TARGET" bash -s <<EOF
set -euo pipefail
if [ -d '${REMOTE_ROOT}' ]; then
  rm -rf '${REMOTE_ROOT}.prev-${STAMP}'
  mv '${REMOTE_ROOT}' '${REMOTE_ROOT}.prev-${STAMP}'
fi
mv '${REMOTE_ROOT}.next' '${REMOTE_ROOT}'
chown -R ${SITE_USER}:${SITE_USER} '${REMOTE_ROOT}'
# نسختين قديمتين بس بيتساب للرجوع السريع
ls -dt '${REMOTE_ROOT}'.prev-* 2>/dev/null | tail -n +3 | xargs -r rm -rf
nginx -t && systemctl reload nginx
EOF

say "التأكد إن الموقع بيرد"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://${DOMAIN}/" || true)"
DEEP="$(curl -s -o /dev/null -w '%{http_code}' "https://${DOMAIN}/orders" || true)"
echo "  /        → $CODE"
echo "  /orders  → $DEEP   (لازم ٢٠٠ — لو ٤٠٤ يبقى سطر try_files ناقص في الـvhost)"

if [ "$CODE" = "200" ] && [ "$DEEP" = "200" ]; then
  say "تم. صنعة شغّالة على https://${DOMAIN}"
else
  echo "✗ فيه حاجة مش مظبوطة — شوف deploy/cloudpanel-vhost.conf وdocs/deploy.md"
  exit 1
fi
