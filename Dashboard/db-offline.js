// ============================================================
// RoomDesk — db-offline.js
// Manejador de IndexedDB para modo offline
// Ubica este archivo en: /Dashboard/db-offline.js
// ============================================================

const OfflineDB = (() => {

  const DB_NAME    = 'roomdesk-offline';
  const DB_VERSION = 1;
  let db = null;

  // Tablas de datos y cola de sincronización
  const STORES = ['rooms', 'reservations', 'guests', 'consumptions'];

  // ============================================================
  // INIT — abre (o crea) la base de datos IndexedDB
  // ============================================================
  async function init() {
    if (db) return db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const database = event.target.result;

        // Un store por tabla de Supabase
        STORES.forEach(name => {
          if (!database.objectStoreNames.contains(name)) {
            database.createObjectStore(name, { keyPath: 'id' });
          }
        });

        // Cola de sincronización — guarda operaciones pendientes
        if (!database.objectStoreNames.contains('sync_queue')) {
          const queue = database.createObjectStore('sync_queue', {
            keyPath: 'queueId',
            autoIncrement: true
          });
          queue.createIndex('timestamp', 'timestamp', { unique: false });
        }

        console.log('[OfflineDB] Base de datos creada/actualizada');
      };

      request.onsuccess = event => {
        db = event.target.result;
        console.log('[OfflineDB] Conectado a IndexedDB');
        resolve(db);
      };

      request.onerror = event => {
        console.error('[OfflineDB] Error abriendo IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // ============================================================
  // HELPER — transacción de lectura/escritura
  // ============================================================
  function getStore(storeName, mode = 'readonly') {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror  = () => reject(request.error);
    });
  }

  // ============================================================
  // SNAPSHOT — guardar y leer datos completos de una tabla
  // ============================================================

  // Guarda un array de registros reemplazando el contenido anterior
  async function saveSnapshot(table, dataArray) {
    if (!db) await init();
    if (!Array.isArray(dataArray) || dataArray.length === 0) return;

    return new Promise((resolve, reject) => {
      const tx    = db.transaction(table, 'readwrite');
      const store = tx.objectStore(table);

      tx.oncomplete = () => {
        console.log(`[OfflineDB] Snapshot guardado: ${table} (${dataArray.length} registros)`);
        resolve();
      };
      tx.onerror = () => reject(tx.error);

      // Limpia y reescribe
      store.clear();
      dataArray.forEach(item => store.put(item));
    });
  }

  // Lee todos los registros de una tabla
  async function getSnapshot(table) {
    if (!db) await init();

    return new Promise((resolve, reject) => {
      const request = getStore(table).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror   = () => reject(request.error);
    });
  }

  // ============================================================
  // SYNC QUEUE — cola de operaciones pendientes
  // ============================================================

  /**
   * Agrega una operación a la cola
   * @param {string} action  - 'create' | 'update' | 'delete'
   * @param {string} table   - nombre de la tabla en Supabase
   * @param {object} payload - datos a sincronizar
   * @param {string} [localId] - ID temporal para registros creados offline
   */
  async function addToQueue(action, table, payload, localId = null) {
    if (!db) await init();

    const entry = {
      action,
      table,
      payload,
      localId,
      timestamp:   Date.now(),
      propertyId:  localStorage.getItem('property_id') || null
    };

    const store   = getStore('sync_queue', 'readwrite');
    const queueId = await promisifyRequest(store.add(entry));
    console.log(`[OfflineDB] En cola: ${action} en ${table} (queueId: ${queueId})`);
    return queueId;
  }

  // Lee toda la cola ordenada por timestamp
  async function getQueue() {
    if (!db) await init();
    return new Promise((resolve, reject) => {
      const request = getStore('sync_queue').getAll();
      request.onsuccess = () => resolve(
        (request.result || []).sort((a, b) => a.timestamp - b.timestamp)
      );
      request.onerror = () => reject(request.error);
    });
  }

  // Elimina un item de la cola después de sincronizarlo
  async function removeFromQueue(queueId) {
    if (!db) await init();
    const store = getStore('sync_queue', 'readwrite');
    return promisifyRequest(store.delete(queueId));
  }

  // Limpia toda la cola (después de sync exitoso)
  async function clearQueue() {
    if (!db) await init();
    const store = getStore('sync_queue', 'readwrite');
    return promisifyRequest(store.clear());
  }

  // Cuenta cuántos items hay en cola
  async function getQueueCount() {
    if (!db) await init();
    return new Promise((resolve, reject) => {
      const request = getStore('sync_queue').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror   = () => reject(request.error);
    });
  }

  // ============================================================
  // OPERACIONES LOCALES — para actuar sobre IndexedDB directo
  // (se usan para reflejar cambios mientras se está offline)
  // ============================================================

  async function putLocal(table, record) {
    if (!db) await init();
    const store = getStore(table, 'readwrite');
    return promisifyRequest(store.put(record));
  }

  async function deleteLocal(table, id) {
    if (!db) await init();
    const store = getStore(table, 'readwrite');
    return promisifyRequest(store.delete(id));
  }

  // ============================================================
  // API PÚBLICA
  // ============================================================
  return {
    init,
    saveSnapshot,
    getSnapshot,
    addToQueue,
    getQueue,
    removeFromQueue,
    clearQueue,
    getQueueCount,
    putLocal,
    deleteLocal
  };

})();
