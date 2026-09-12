#!/usr/bin/env bash
#
# رفع صنعة على سيرفر CloudPanel.
#
# الاستعمال من جهازك:
#   DOMAIN=sanaa.example.com SITE_USER=sanaa SSH_TARGET=root@187.127.79.131 ./deploy/deploy.sh
#
# أو وإنت على السيرفر نفسه:
#   DOMAIN=sanaa.example.com SITE_USER=sanaa SSH_TARGET=local ./deploy/deploy.sh
#
# الأفضل البناء من جهازك: `vite build` بياخد حوالي ٢ جيجا في الذروة،
# والسيرفر عليه CloudPanel وقواعد بياناته. لو هتبني على السيرفر اتأكد إن
# فيه swap، والسكربت بيقولك لو مش موجود.
#
set -euo pipefail

DOMAIN="${DOMAIN:?لازم تحدد DOMAIN — مثال: DOMAIN=sanaa.example.com}"
SSH_TARGET="${SSH_TARGET:?لازم تحدد SSH_TARGET — مثال: SSH_TARGET=root@187.127.79.131}"
SITE_USER="${SITE_USER:?لازم تحدد SITE_USER — اسم مستخدم الموقع من CloudPanel}"
REMOTE_ROOT="/home/${SITE_USER}/htdocs/${DOMAIN}"

say() { printf "\n\033[1m▸ %s\033[0m\n" "$1"; }

LOCAL=0
[ "$SSH_TARGET" = "local" ] && LOCAL=1

# نفس الأمر يشتغل محليًا أو عبر ssh، فباقي السكربت ماينفعش يفرّق
sh_run() {
  if [ "$LOCAL" = "1" ]; then bash -c "$1"; else ssh "$SSH_TARGET" "$1"; fi
}

if [ "$LOCAL" = "1" ] && [ "$(awk '/SwapTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)" = "0" ]; then
  echo "⚠ مافيش swap على السيرفر، و`vite build` ممكن يتقتل في النص."
  echo "  لو حصل: fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"
fi

say "بناء نسخة الإنتاج"
npm ci
npm run build

# البناء لازم يطلع index.html وservice worker، وغير كده يبقى فيه حاجة غلط
for f in dist/index.html dist/sw.js; do
  [ -f "$f" ] || { echo "✗ $f مش موجود — البناء مش كامل"; exit 1; }
done
say "حجم الناتج: $(du -sh dist | cut -f1)"

say "التأكد إن مسار الموقع موجود على السيرفر"
sh_run "test -d '$REMOTE_ROOT'" || {
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
sh_run "mkdir -p '${REMOTE_ROOT}.next' && rm -rf '${REMOTE_ROOT}.next'/*"
if [ "$LOCAL" = "1" ]; then
  rsync -a --delete dist/ "${REMOTE_ROOT}.next/"
else
  rsync -az --delete dist/ "$SSH_TARGET:${REMOTE_ROOT}.next/"
fi

say "تبديل النسخة"
sh_run "$(cat <<EOF
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
)"

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
