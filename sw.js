const CACHE_NAME = 'capturephotoirose-pwa-v1';
const urlsToCache = [
	'./',
	'./images/wide1.jpg',
	'./images/wide2.jpg',
	'./images/narrow.jpg',
	'./manifest.json',
	'./index.html',
	'./icons',
	'./icons/Logo_irose_cs-128x128.png',
	'./icons/Logo_irose_cs-115x115.png',
	'./icons/Logo_irose_cs-512x512.png',
	'./icons/Logo_irose_cs.svg',
	'./icons/Logo_irose_cs-64x64.png',
	'./icons/Logo_irose_cs-48x48.png',
	'./icons/Logo_irose_cs-144x144.png',
	'./icons/Logo_irose_cs-256x256.png',
	'./irose.js',
	'./sw.js',
	'./code.html',
	'./capture.irose.css'
];

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then(cache => {
				return cache.addAll(urlsToCache);
			})
	);
});

self.addEventListener('fetch', event => {
	event.respondWith(
		caches.match(event.request)
			.then(response => {
				if (response) {
					return response;
				}
				return fetch(event.request)
					.then(response => {
						if (!response || response.status !== 200 || response.type !== 'basic') {
							return response;
						}
						const responseToCache = response.clone();
						caches.open(CACHE_NAME)
							.then(cache => {
								cache.put(event.request, responseToCache);
							});
						return response;
					});
			})
	);
});

self.addEventListener('sync', event => {
	if (event.tag === 'sync-inventory') {
		event.waitUntil(syncInventory());
	}
});

async function syncInventory() {
	// Cette fonction serait implémentée dans une application réelle
	// Elle communiquerait avec le client via postMessage
	self.clients.matchAll().then(clients => {
		clients.forEach(client => {
			client.postMessage({ action: 'sync-requested' });
		});
	});
}
