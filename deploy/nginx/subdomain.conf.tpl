#
# قالب بلوك HTTPS لصاب دومين مصنع واحد.
# `deploy/subdomain.sh` بيحط مكان SLUG وبيكتب الناتج في
# `/etc/nginx/sanaa-subdomains.d/SLUG.conf`.
#
# الملفات المقدَّمة هي **نفس** ملفات الدومين الأصلي — مفيش نسخة لكل
# مصنع. تحديد المصنع بيحصل جوه التطبيق من الـhostname.
#

server {
  listen 443 quic;
  listen 443 ssl;
  listen [::]:443 quic;
  listen [::]:443 ssl;
  http2 on;
  http3 off;

  server_name SLUG.sanaa.cloud;

  ssl_certificate     /etc/letsencrypt/live/SLUG.sanaa.cloud/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/SLUG.sanaa.cloud/privkey.pem;

  root /home/sanaa/htdocs/sanaa.cloud;

  access_log /home/sanaa/logs/nginx/sub-SLUG-access.log main;
  error_log /home/sanaa/logs/nginx/sub-SLUG-error.log;

  include /etc/nginx/global_settings;
  include /etc/nginx/sanaa-app.inc;
}
