// 최소 서비스워커: 앱 설치와 오프라인 안내만 담당한다.
// 재고·주문 데이터는 절대 캐시하지 않는다 (항상 서버에서 최신 값을 받음).
const OFFLINE_URL = "/offline.html";
const CACHE = "wl-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // 화면 이동(navigate)이 네트워크 오류로 실패할 때만 오프라인 안내를 보여준다
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});
