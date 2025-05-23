// irose.js - Script principal de l'application Capture Photo iRose

// Définition du namespace principal de l'application
const iRoseApp = (() => {
    // Variables globales
    let db;
    let stream;
    const dbName = 'inventoryDB';
    const dbVersion = 1;
    const objectStoreName = 'captures';
    const serverUrl = 'https://inventory.neoviz.fr/api/torpp/capture';
    let isOnline = navigator.onLine;
    let deferredPrompt;
    
    // Éléments DOM
    let camdiv, video, canvas, captureBtn, syncBtn, pendingCount;
    let cameraStatus, locationStatus, storageStatus, networkStatus, installStatus;
    let gallery, notification, installBtn;
    
    // Fonction d'initialisation principale
    async function init() {
        // Initialiser les références aux éléments DOM
        initDomReferences();
        
        // Initialiser les composants de l'application
        await initDatabase();
        initNetworkStatus();
        await initCamera();
        await loadGallery();
        updatePendingCount();
        
        // Initialiser les gestionnaires d'événements
        initEventListeners();
        
        // Initialiser l'installation de la PWA
        initPwaInstallation();
        
        // Essayer de synchroniser si en ligne
        if (isOnline) {
            syncData();
        }
    }
    
    // Récupérer les références aux éléments DOM
    function initDomReferences() {
        camdiv = document.getElementById('camera-container');
        video = document.getElementById('video');
        canvas = document.getElementById('canvas');
        captureBtn = document.getElementById('captureBtn');
        syncBtn = document.getElementById('syncBtn');
        pendingCount = document.getElementById('pendingCount');
        cameraStatus = document.getElementById('cameraStatus');
        locationStatus = document.getElementById('locationStatus');
        storageStatus = document.getElementById('storageStatus');
        networkStatus = document.getElementById('networkStatus');
        installStatus = document.getElementById('installStatus');
        gallery = document.getElementById('gallery');
        notification = document.getElementById('notification');
        installBtn = document.getElementById('installBtn');
    }
    
    // Initialiser la base de données IndexedDB
    async function initDatabase() {
        try {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(dbName, dbVersion);
                
                request.onupgradeneeded = (event) => {
                    db = event.target.result;
                    
                    if (!db.objectStoreNames.contains(objectStoreName)) {
                        const store = db.createObjectStore(objectStoreName, { keyPath: 'id', autoIncrement: true });
                        store.createIndex('syncStatus', 'syncStatus', { unique: false });
                        store.createIndex('timestamp', 'timestamp', { unique: false });
                    }
                };
                
                request.onsuccess = (event) => {
                    db = event.target.result;
                    storageStatus.textContent = 'Prêt';
                    resolve();
                };
                
                request.onerror = (event) => {
                    console.error('Erreur d\'ouverture de la base de données:', event.target.error);
                    storageStatus.textContent = 'Erreur';
                    showNotification('Erreur d\'accès à la base de données locale');
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('Erreur lors de l\'initialisation de la base de données:', error);
            storageStatus.textContent = 'Erreur';
            showNotification('Erreur d\'initialisation de la base de données');
        }
    }
    
    // Initialiser la caméra
    async function initCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            cameraStatus.textContent = 'Active';
            // captureBtn.disabled = false;
            
            return new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    resolve();
                };
            });
        } catch (error) {
            console.error('Erreur d\'accès à la caméra:', error);
            cameraStatus.textContent = 'Erreur d\'accès';
            if (captureBtn) captureBtn.disabled = true;
            showNotification('Erreur d\'accès à la caméra');
            
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.textContent = 'Impossible d\'accéder à la caméra. Veuillez vérifier les permissions.';
            document.querySelector('.camera-container').appendChild(errorMessage);
        }
    }
    
    // Surveiller l'état du réseau
    function initNetworkStatus() {
        updateNetworkStatus();
        
        window.addEventListener('online', () => {
            isOnline = true;
            updateNetworkStatus();
            syncData();
        });
        
        window.addEventListener('offline', () => {
            isOnline = false;
            updateNetworkStatus();
        });
    }
    
    // Mettre à jour l'affichage de l'état du réseau
    function updateNetworkStatus() {
        networkStatus.textContent = isOnline ? 'En ligne' : 'Hors ligne';
        if (isOnline) {
            syncBtn.disabled = false;
        } else {
            syncBtn.disabled = true;
        }
    }
    
    // Obtenir la géolocalisation
    async function getLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                locationStatus.textContent = 'Non supportée';
                resolve(null);
                return;
            }
            
            locationStatus.textContent = 'En cours...';
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };
                   locationStatus.textContent = 'Obtenue';
                    resolve(location);
                },
                (error) => {
                    console.error('Erreur de géolocalisation:', error);
                    locationStatus.textContent = 'Erreur';
                    showNotification('Erreur d\'accès à la géolocalisation');
                    resolve(null);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }
    
    // Capturer une photo
    async function capturePhoto() {
        try {
            // Dessiner l'image de la vidéo sur le canvas
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convertir le canvas en blob
            const photoBlob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/jpeg', 0.85);
            });
            
            // Obtenir la géolocalisation
            const location = await getLocation();
            
            // Préparer les données à sauvegarder
            const timestamp = new Date();
            const captureData = {
                photo: photoBlob,
                location: location,
                timestamp: timestamp,
                syncStatus: 'pending'
            };
            
            // Sauvegarder dans IndexedDB
            await saveCapture(captureData);
            
            // Mettre à jour la galerie
            await loadGallery();
            
            // Essayer de synchroniser si en ligne
            if (isOnline) {
                syncData();
            }
            
            showNotification('Photo capturée avec succès');
        } catch (error) {
            console.error('Erreur lors de la capture:', error);
            showNotification('Erreur lors de la capture');
        }
    }
    
    // Sauvegarder une capture dans IndexedDB
    async function saveCapture(captureData) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([objectStoreName], 'readwrite');
            const store = transaction.objectStore(objectStoreName);
            const request = store.add(captureData);
            
            request.onsuccess = () => {
                updatePendingCount();
                resolve();
            };
            
            request.onerror = (event) => {
                console.error('Erreur lors de la sauvegarde:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
async function loadGallery() {
    try {
        gallery.innerHTML = '';
        
        const captures = await getAllCaptures();
        captures.sort((a, b) => b.timestamp - a.timestamp);
        
        // Afficher les 6 plus récentes captures
        const recentCaptures = captures.slice(0, 6);
        
        for (const capture of recentCaptures) {
            const photoUrl = URL.createObjectURL(capture.photo);
            
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.dataset.id = capture.id; // Stocker l'ID de la capture dans l'élément
            
            const img = document.createElement('img');
            img.src = photoUrl;
            img.alt = `Photo du ${new Date(capture.timestamp).toLocaleString()}`;
            
            const badge = document.createElement('div');
            badge.className = `sync-badge ${capture.syncStatus === 'pending' ? 'sync-pending' : 'sync-complete'}`;
            
            // Créer l'icône de corbeille (initialement cachée)
            const deleteIcon = document.createElement('div');
            deleteIcon.className = 'delete-icon hidden';
            deleteIcon.innerHTML = '<i class="fas fa-trash"></i>'; // Utilise Font Awesome, ajoutez-le si nécessaire
            deleteIcon.addEventListener('click', (event) => {
                event.stopPropagation(); // Empêche le click de se propager à l'item
                deleteCapture(capture.id);
            });
            
            item.appendChild(img);
            item.appendChild(badge);
            item.appendChild(deleteIcon);
            gallery.appendChild(item);
            
            // Ajouter un gestionnaire d'événements pour afficher/masquer l'icône de suppression
            item.addEventListener('click', () => {
                // Cacher toutes les icônes de suppression
                document.querySelectorAll('.delete-icon').forEach(icon => {
                    icon.classList.add('hidden');
                });
                
                // Afficher l'icône de suppression de cet élément
                deleteIcon.classList.toggle('hidden');
            });
        }
    } catch (error) {
        console.error('Erreur lors du chargement de la galerie:', error);
    }
}

// Fonction pour supprimer une capture
async function deleteCapture(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette photo ?')) {
        try {
            await new Promise((resolve, reject) => {
                const transaction = db.transaction([objectStoreName], 'readwrite');
                const store = transaction.objectStore(objectStoreName);
                const request = store.delete(id);
                
                request.onsuccess = () => {
                    resolve();
                };
                
                request.onerror = (event) => {
                    console.error('Erreur lors de la suppression:', event.target.error);
                    reject(event.target.error);
                };
            });
            
            // Recharger la galerie et mettre à jour le compteur
            await loadGallery();
            await updatePendingCount();
            showNotification('Photo supprimée avec succès');
        } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            showNotification('Erreur lors de la suppression');
        }
    }
}
    
    // Récupérer toutes les captures depuis IndexedDB
    async function getAllCaptures() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([objectStoreName], 'readonly');
            const store = transaction.objectStore(objectStoreName);
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = (event) => {
                console.error('Erreur lors de la récupération des captures:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // Récupérer les captures en attente de synchronisation
    async function getPendingCaptures() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([objectStoreName], 'readonly');
            const store = transaction.objectStore(objectStoreName);
            const index = store.index('syncStatus');
            const request = index.getAll('pending');
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = (event) => {
                console.error('Erreur lors de la récupération des captures en attente:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // Mettre à jour le compteur de captures en attente
    async function updatePendingCount() {
        try {
            const pendingCaptures = await getPendingCaptures();
            pendingCount.textContent = pendingCaptures.length;
            
            if (pendingCaptures.length > 0 && isOnline) {
                syncBtn.disabled = false;
            } else {
                syncBtn.disabled = true;
            }
        } catch (error) {
            console.error('Erreur lors de la mise à jour du compteur:', error);
        }
    }
    
    // Synchroniser les données avec le serveur
    async function syncData() {
        if (!isOnline) {
            showNotification('Pas de connexion internet');
            return;
        }
        
        try {
            const pendingCaptures = await getPendingCaptures();
            
            if (pendingCaptures.length === 0) {
                showNotification('Aucune donnée à synchroniser');
                return;
            }
            
            let syncedCount = 0;
            
            for (const capture of pendingCaptures) {
                const formData = new FormData();
                formData.append('photo', capture.photo);
                formData.append('timestamp', capture.timestamp.toISOString());
                
                if (capture.location) {
                    formData.append('latitude', capture.location.latitude);
                    formData.append('longitude', capture.location.longitude);
                    formData.append('accuracy', capture.location.accuracy);
                }
                
                try {
                    const response = await fetch(serverUrl, {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (response.ok) {
                        await updateCaptureStatus(capture.id, 'synced');
                        syncedCount++;
                    } else {
                        console.error('Erreur de synchronisation:', response.statusText);
                    }
                } catch (error) {
                    console.error('Erreur réseau lors de la synchronisation:', error);
                }
            }
            
            await loadGallery();
            await updatePendingCount();
            
            if (syncedCount > 0) {
                showNotification(`${syncedCount} photo(s) synchronisée(s)`);
            } else {
                showNotification('Échec de la synchronisation');
            }
        } catch (error) {
            console.error('Erreur lors de la synchronisation:', error);
            showNotification('Erreur de synchronisation');
        }
    }
    
    // Mettre à jour le statut de synchronisation d'une capture
    async function updateCaptureStatus(id, status) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([objectStoreName], 'readwrite');
            const store = transaction.objectStore(objectStoreName);
            const request = store.get(id);
            
            request.onsuccess = () => {
                const data = request.result;
                data.syncStatus = status;
                
                const updateRequest = store.put(data);
                
                updateRequest.onsuccess = () => {
                    resolve();
                };
                
                updateRequest.onerror = (event) => {
                    console.error('Erreur lors de la mise à jour du statut:', event.target.error);
                    reject(event.target.error);
                };
            };
            
            request.onerror = (event) => {
                console.error('Erreur lors de la récupération de la capture:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // Afficher une notification
    function showNotification(message) {
        notification.textContent = message;
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
    
    // Enregistrer le Service Worker
    function initServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', async () => {
                try {
                    await navigator.serviceWorker.register('sw.js');
                    console.log('Service Worker enregistré avec succès');
                } catch (error) {
                    console.error('Erreur lors de l\'enregistrement du Service Worker:', error);
                }
            });
            
            // Écouter les messages du Service Worker
            navigator.serviceWorker.addEventListener('message', event => {
                if (event.data && event.data.action === 'sync-requested') {
                    syncData();
                }
            });
        }
    }
    
    // Enregistrer pour la synchronisation en arrière-plan
    async function registerBackgroundSync() {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.sync.register('sync-inventory');
                console.log('Synchronisation en arrière-plan enregistrée');
            } catch (error) {
                console.error('Erreur lors de l\'enregistrement de la synchronisation en arrière-plan:', error);
            }
        }
    }
    
    // Initialiser l'installation de la PWA
    function initPwaInstallation() {
        window.addEventListener('beforeinstallprompt', (e) => {
            // Empêcher l'affichage automatique de la bannière d'installation
            e.preventDefault();
            
            // Stocker l'événement pour l'utiliser plus tard
            deferredPrompt = e;
            
            // Mettre à jour l'état d'installation
            installStatus.textContent = 'Disponible';
            
            // Afficher le bouton d'installation
            installBtn.style.display = 'block';
            
            console.log('L\'application peut être installée');
        });

        // Détecter si l'app est déjà installée
        window.addEventListener('appinstalled', (e) => {
            // Mettre à jour l'état d'installation
            installStatus.textContent = 'Installée';
            
            // Cacher le bouton d'installation
            installBtn.style.display = 'none';
            
            // Effacer le deferredPrompt
            deferredPrompt = null;
            
            console.log('Application installée avec succès');
        });
    }
    
    // Gérer le bouton d'installation
    async function handleInstallClick() {
        if (deferredPrompt) {
            // Afficher l'invite d'installation
            deferredPrompt.prompt();
            
            // Attendre que l'utilisateur réponde à l'invite
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`L'utilisateur a ${outcome === 'accepted' ? 'accepté' : 'refusé'} l'installation`);
            
            // Nous ne pouvons utiliser deferredPrompt qu'une seule fois
            deferredPrompt = null;
            
            // Cacher le bouton d'installation
            installBtn.style.display = 'none';
            installStatus.textContent = outcome === 'accepted' ? 'Installée' : 'Refusée';
        } else {
            console.log("Pas de deferredPrompt disponible");
        }
    }
    
    // Initialiser les gestionnaires d'événements
    function initEventListeners() {
        // Événements de capture et de synchronisation
        captureBtn.addEventListener('click', capturePhoto);
        syncBtn.addEventListener('click', syncData);
        installBtn.addEventListener('click', handleInstallClick);
        
        // Détection de l'orientation et redimensionnement
        window.addEventListener('resize', () => {
            if (stream && video.srcObject) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
        });
    }
    
    // Initialiser le Service Worker et l'enregistrement pour la PWA
    initServiceWorker();
    
    // Exposer les fonctions publiques
    return {
        init,
        capturePhoto,
        syncData,
        showNotification,
        deleteCapture
    };
})();
