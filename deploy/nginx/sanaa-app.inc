#
# قواعد صنعة في نجينكس — الملف ده بيتضمّن جوه كل بلوك `server` بيقدّم
# النظام: الدومين الأصلي، وكل صاب دومين مصنع.
#
# ليه ملف مشترك: كل العناوين دي بتقدّم **نفس الملفات** بالظبط. لو كل
# بلوك كاتب قواعده لوحده، أول تعديل هيتعمل في واحد ويُنسى في التاني،
# وتبقى عندك صاب دومين بيتصرّف غير الدومين الأصلي — وده أوحش نوع عطل،
# لأنه بيبان عند ناس معيّنين بس.
#
# بيتنسخ على السيرفر في `/etc/nginx/sanaa-app.inc` من `deploy/deploy.sh`.
#
# المتغيّر `$sanaa_cache_control` متعرّف في vhost الدومين الأصلي (بلوك
# `map`)، وهو متغيّر عام على مستوى http فبيشتغل هنا عادي.
#

index index.html;

add_header Cache-Control $sanaa_cache_control always;

# الكاميرا مسموحة لأن مركز المسح بيقرأ QR منها
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;

#
# الملفات التلاتة دي ممنوع تتكاش، ودي أهم حاجة في الملف.
#
# سيرفس ووركر متكاش معناه إن المستخدم يفضل شايف نسخة قديمة من النظام
# بعد أي تحديث ومش بيعرف — وده أسوأ حاجة تحصل في نظام بيمشي عليه فلوس
# مصنع. وقالب CloudPanel الجاهز بيحط `expires max` على أي حاجة بتنتهي
# بـ.js، وده بيشمل sw.js. المطابقة بـ`location =` بتكسب على أي regex في
# نجينكس، فالبلوكات دي بتعدّي على القالب.
#
location = /sw.js {
  expires off;
  add_header Cache-Control "no-store, no-cache, must-revalidate" always;
}

location = /registerSW.js {
  expires off;
  add_header Cache-Control "no-store, no-cache, must-revalidate" always;
}

# ونجينكس مايعرفش الامتداد ده، وكان بيطلعه octet-stream فالمتصفح
# مابيقراش بيانات التطبيق منه
location = /manifest.webmanifest {
  default_type application/manifest+json;
  expires off;
  add_header Cache-Control "no-store, no-cache, must-revalidate" always;
}

# أسماء ملفات البناء فيها هاش، فأي تعديل بيغيّر الاسم — الكاش الطويل
# آمن، و`=404` عشان ملف ناقص يبان ٤٠٤ مش يرجّع الـindex مكانه
location ~* ^.+\.(css|js|jpg|jpeg|gif|png|ico|gz|svg|svgz|ttf|otf|woff|woff2|eot|mp4|ogg|ogv|webm|webp|zip|swf)$ {
  add_header Access-Control-Allow-Origin "*";
  add_header alt-svc 'h3=":443"; ma=86400';
  expires max;
  access_log off;
  try_files $uri =404;
}

#
# صنعة تطبيق صفحة واحدة: المسارات جواه (`/orders`، `/health`) مش ملفات
# على الديسك. قالب CloudPanel مافيهوش `location /` خالص، فأي مسار غير
# `/` كان بياخد ٤٠٤ — يعني أول Refresh جوه أي شاشة الصفحة تضيع. السطر
# ده بيرجّع الطلب للتطبيق وهو يقرر يعرض إيه.
#
location / {
  try_files $uri $uri/ /index.html;
}
