#!/usr/bin/env bash
#
# بيطبع إعداد نجينكس جاهز للصق في CloudPanel، بالدومين واسم المستخدم بتاعك.
#
#   DOMAIN=sanaa.example.com SITE_USER=sanaa ./deploy/vhost.sh
#
# بنطبعه بدل ما نكتبه على السيرفر بقصد: الـvhost في CloudPanel بيتعدّل من
# اللوحة، واللوحة هي اللي بتعمل `nginx -t` وترفض الحفظ لو فيه غلطة. أي
# تعديل بإيدينا على الملف من ورا اللوحة ممكن يتكتب فوقه.
#
set -euo pipefail

DOMAIN="${DOMAIN:?لازم تحدد DOMAIN — مثال: DOMAIN=sanaa.example.com}"
SITE_USER="${SITE_USER:?لازم تحدد SITE_USER — اسم مستخدم الموقع من CloudPanel}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sed -e "s|SITE_USER|${SITE_USER}|g" -e "s|DOMAIN|${DOMAIN}|g" "${HERE}/cloudpanel-vhost.conf"
