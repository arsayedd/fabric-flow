#!/usr/bin/env bash
#
# بيطبع إعداد نجينكس جاهز للصق في CloudPanel، بالدومين بتاعك محطوط.
#
#   DOMAIN=sanaa.cloud ./deploy/vhost.sh
#
# بنطبعه بدل ما نكتبه على السيرفر بقصد: الـvhost في CloudPanel بيتعدّل من
# اللوحة، واللوحة هي اللي بتعمل `nginx -t` وترفض الحفظ لو فيه غلطة. أي
# تعديل بإيدينا على الملف من ورا اللوحة ممكن يتكتب فوقه.
#
# علامات `{{root}}` و`{{ssl_certificate}}` وغيرها بتتسبب زي ما هي —
# CloudPanel هو اللي بيحلّها لوحده وقت ما يولّد الـvhost.
#
set -euo pipefail

DOMAIN="${DOMAIN:?لازم تحدد DOMAIN — مثال: DOMAIN=sanaa.cloud}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sed "s|DOMAIN|${DOMAIN}|g" "${HERE}/cloudpanel-vhost.conf"
