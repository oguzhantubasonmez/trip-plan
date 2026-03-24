PROJE DOSYASI: RouteWise (Social & Intelligent Travel Planner)

**Revizyon (aktivite planlayıcı):** Ana ekranda “Arkadaşlarım ve gruplar” merkezi; rota oluştururken Google Places ile il/ilçe/işletme/adres araması ve ilk durak; duraklar arası mesafe/süre (Directions veya Haversine); durak başına ekstra masraf ve kalış süresi özeti; rota bazlı araç/tüketim/yakıt fiyatı; plan özeti (yakıt + ekstra + genel toplam, kişi başı); editörlerin durak değişikliklerini **öneri** olarak göndermesi ve rota sahibinin onaylaması. Ayrıntılı ücret/API bilgisi: `mobile/ÜCRETLER_VE_API.md`.

---
1. Proje Özeti ve Vizyon
RouteWise, kullanıcıların sadece bir rota çizmekle kalmayıp, bu rotayı arkadaş gruplarıyla demokratik ve interaktif bir şekilde yönetebildiği bir mobil uygulamadır. Uygulama; lojistik hesaplamaları (yakıt, zaman, mesafe), akıllı mekan önerilerini ve grup içi onay mekanizmalı sosyal özellikleri bir araya getirir.

2. Kimlik Doğrulama ve Sosyal Giriş Katmanı
Uygulamanın sosyal çekirdeğini oluşturmak için şu yapı kurulmalıdır:

Telefon Numarası ile Giriş (OTP): Şifresiz, hızlı kayıt süreci. (Firebase Phone Auth tercih edilmeli).

Şeffaf İzin Yönetimi (Onboarding): Uygulama ilk açıldığında, rehber izninin neden istendiğini açıklayan şık bir bilgilendirme ekranı gelmelidir.

"Arkadaşlarını rotana kolayca ekleyebilmen ve rehberindeki kişilerin planlarını görebilmen için kişi listene erişmek istiyoruz. Verilerin asla üçüncü taraflarla paylaşılmaz."

Rehber Senaryosu: Rehberdeki numaralar taranır, Firestore'daki kullanıcılarla eşleştirilir ve kullanıcıya "Uygulamayı kullanan arkadaşların" listesi sunulur.

3. Temel Fonksiyonel Özellikler
A. Akıllı Rota ve Lojistik
Sürükle-Bırak Duraklar: Google Maps/Mapbox üzerinde noktalar belirlenir. Sıralama değiştikçe toplam KM ve varış süreleri anlık güncellenir.

Yakıt ve Maliyet Analizi: Kullanıcının profilindeki araç verilerine (örneğin: 100km/7lt dizel) göre, güncel yakıt fiyatları üzerinden toplam yol maliyeti hesaplanır.

Zaman Çizelgesi: Her durak için giriş-çıkış saatleri manuel veya tahmini olarak belirlenebilir.

B. Sosyal İşbirliği ve Yetki Seviyeleri
Admin (Oluşturucu): Tüm rotayı kontrol eder.

Editor (Düzenleyici): Yeni durak veya mekan önerisi ekleyebilir. Editörün eklediği duraklar admin onayına (onay/red) düşer ve onaylandığında tüm grupta güncellenir.

Viewer (İzleyici): Sadece planı ve detayları görür, yorum yapabilir.

RSVP Sistemi: Davetliler "Katılıyorum/Belki/Katılamıyorum" seçer. Maliyet hesapları (kişi başı düşen pay) sadece "Katılıyorum" diyenlere göre dinamik bölünür.

4. Kullanıcı Senaryosu (UX Akışı)
Senaryo: 4 arkadaş (Mert, Selin, Can, Derya) hafta sonu Bolu gezisi planlıyor.

Giriş: Mert telefonuna gelen SMS koduyla saniyeler içinde giriş yapar.

Davet: Mert rehberini taratır, Selin ve Can'ı listeden seçip "Editör" olarak ekler. Henüz uygulamayı kullanmayan Derya'ya WhatsApp üzerinden davet linki gönderir.

Öneri ve Onay: Selin, rota üzerine "X Kahvaltı Salonu"nu ekler. Mert'in ekranına bir bildirim düşer: "Selin bir öneride bulundu (+12 km, +45 dk). Onaylıyor musun?". Mert onayladığında, tüm grubun bütçesi ve takvimi güncellenir.

Maliyet Takibi: Derya son dakika "Katılamıyorum" dediğinde, uygulama konaklama ve yakıt maliyetini otomatik olarak 4 yerine 3 kişiye bölerek herkese yeni "Kişi Başı Ödeme" miktarını gösterir.

5. Teknik Mimari (Tech Stack)
Frontend: Flutter veya React Native (Cross-platform mobil uyum).

Backend: Firebase (Auth, Firestore, Cloud Functions).

API'lar: Google Maps SDK (Harita), Google Places API (Mekan arama/öneri), Google Directions API (Rota hesabı).

Tasarım: Modern, minimalist, temiz boşluklar ve pastel tonlar.

6. Veritabanı (Firestore) Şeması
Users: uid, phoneNumber, displayName, avatar, carConsumption, friends[]

Trips: tripId, adminId, title, startDate, endDate, totalDistance, totalFuelCost, attendees[]

Stops: stopId, tripId, locationName, coords, arrivalTime, cost, status (pending/approved)

Comments: commentId, stopId, userId, message, timestamp