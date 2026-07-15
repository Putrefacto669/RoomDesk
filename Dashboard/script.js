// ============================================================
// RoomDesk — script.js con modo offline integrado
// ============================================================

// ADVERTENCIA: Reemplazar SUPABASE_ANON_KEY por el anon key real
// desde Supabase Dashboard → Settings → API
const SUPABASE_URL      = 'https://unkbcfqmgvfmxyvlcqpc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua2JjZnFtZ3ZmbXh5dmxjcXBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkyNjU4NCwiZXhwIjoyMDk1NTAyNTg0fQ.PwFyFmRzp0MjPwHZj685oWW4d0a3nTlV1ZTUP8Rmy78';
const supabaseClient    = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentPropertyId = localStorage.getItem('property_id') || 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

document.addEventListener('DOMContentLoaded', async () => {

    // ============================================================
    // 1. SESIÓN
    // ============================================================
    async function checkSupabaseSession() {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) { localStorage.clear(); window.location.href = '../Login/index.html'; return false; }
            localStorage.setItem('session_active', 'true');
            localStorage.setItem('user_email', session.user.email);
            const { data: userProfile } = await supabaseClient.from('usuarios').select('name, role, property_id').eq('id', session.user.id).single();
            if (userProfile) {
                localStorage.setItem('user_name', userProfile.name);
                localStorage.setItem('user_role', userProfile.role);
                localStorage.setItem('property_id', userProfile.property_id);
                currentPropertyId = userProfile.property_id;
            }
            return true;
        } catch (error) {
            console.error('Error de sesión:', error);
            // Si falla por falta de red, intentamos verificar desde localStorage
            if (!navigator.onLine && localStorage.getItem('session_active') === 'true') {
                console.log('[Offline] Sesión válida desde localStorage, continuando offline');
                return true;
            }
            localStorage.clear();
            window.location.href = '../Login/index.html';
            return false;
        }
    }

    const isAuth = await checkSupabaseSession();
    if (!isAuth) return;

    // Inicializar IndexedDB offline
    try {
        await OfflineDB.init();
        console.log('[Offline] IndexedDB lista');
    } catch (e) {
        console.warn('[Offline] IndexedDB no disponible:', e.message);
    }

    // ============================================================
    // 2. LOGOUT
    // ============================================================
    let sessionCheckInterval = null;

    async function logout() {
        if (sessionCheckInterval) { clearInterval(sessionCheckInterval); sessionCheckInterval = null; }
        try { await supabaseClient.auth.signOut(); } catch (e) { console.error('Error logout:', e); }
        finally { localStorage.clear(); window.location.href = '../Login/index.html'; }
    }

    let logoutBtn = document.getElementById('logout-btn');
    if (!logoutBtn) {
        logoutBtn = document.createElement('button');
        logoutBtn.id = 'logout-btn';
        logoutBtn.className = 'logout-button';
        logoutBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Cerrar Sesión</span>`;
        const nav = document.getElementById('nav');
        if (nav) nav.appendChild(logoutBtn); else document.body.appendChild(logoutBtn);
    }
    logoutBtn.addEventListener('click', logout);

    // ============================================================
    // 3. TIMEOUT DE SESIÓN
    // ============================================================
    let sessionTimeout;
    function resetSessionTimeout() {
        clearTimeout(sessionTimeout);
        sessionTimeout = setTimeout(() => { alert('Tu sesión ha expirado por inactividad'); logout(); }, 30 * 60 * 1000);
    }
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(e =>
        document.addEventListener(e, resetSessionTimeout, { passive: true })
    );
    resetSessionTimeout();

    sessionCheckInterval = setInterval(() => {
        if (localStorage.getItem('session_active') !== 'true') logout();
    }, 5000);

    // ============================================================
    // 4. BADGE DE ESTADO OFFLINE
    // ============================================================
    async function updateOfflineBadge() {
        const badge = document.getElementById('offline-badge');
        const text  = document.getElementById('offline-text');
        if (!badge || !text) return;

        const online = navigator.onLine;
        let count = 0;
        try { count = await OfflineDB.getQueueCount(); } catch (e) {}

        if (online && count === 0) {
            badge.style.display = 'none';
        } else if (online && count > 0) {
            badge.style.display = 'flex';
            badge.classList.remove('badge-offline');
            badge.classList.add('badge-syncing');
            text.textContent = `Sincronizando ${count} cambio${count > 1 ? 's' : ''}...`;
        } else {
            badge.style.display = 'flex';
            badge.classList.remove('badge-syncing');
            badge.classList.add('badge-offline');
            text.textContent = count > 0
                ? `Sin conexión · ${count} cambio${count > 1 ? 's' : ''} pendiente${count > 1 ? 's' : ''}`
                : 'Sin conexión · datos locales';
        }
    }

    // ============================================================
    // 5. PERSONALIZACIÓN DE UI
    // ============================================================
    const savedUser  = localStorage.getItem('user_name')  || 'oasistraveler';
    const userRole   = localStorage.getItem('user_role')   || 'admin';
    const userAvatar = localStorage.getItem('user_avatar') || '👤';
    const userHotel  = localStorage.getItem('user_hotel')  || '';

    document.querySelectorAll('.user-name').forEach(el => el.textContent = savedUser);
    const avatarWrapper = document.querySelector('.avatar-wrapper');
    if (avatarWrapper) { avatarWrapper.innerHTML = `<span style="font-size:24px;">${userAvatar}</span>`; avatarWrapper.style.background = 'transparent'; }
    const userRoleEl = document.querySelector('.user-role');
    if (userRoleEl) userRoleEl.textContent = `${userRole === 'admin' ? 'Administrador' : 'Gerente'}${userHotel ? ` · ${userHotel}` : ''}`;
    const crudTitle = document.getElementById('crud-title');
    if (crudTitle) crudTitle.textContent = `Bienvenido de nuevo, ${savedUser}`;
    if (userRole !== 'admin') document.querySelectorAll('.admin-only').forEach(b => b.style.display = 'none');

    // ============================================================
    // 6. CARGA DE DATOS — Network-first con fallback a IndexedDB
    // ============================================================

    function setCardsLoading(loading) {
        document.querySelectorAll('.card-number').forEach(el => {
            if (loading) { el.textContent = '—'; el.classList.add('is-loading'); }
            else { el.classList.remove('is-loading'); }
        });
    }

    async function loadRoomsFromSupabase() {
        try {
            const { data, error } = await supabaseClient.from('rooms').select('*').eq('property_id', currentPropertyId).order('number');
            if (error) throw error;
            const mapped = (data || []).map(r => ({ id: r.id, number: r.number, type: r.type, status: r.status, price: parseFloat(r.price) }));
            roomsData = mapped;
            // Guarda snapshot offline
            try { await OfflineDB.saveSnapshot('rooms', mapped); } catch (e) {}
            const available = mapped.filter(r => r.status === 'Disponible').length;
            const card = document.querySelectorAll('.card-number')[2];
            if (card) card.textContent = available;
            console.log('✅ Habitaciones cargadas:', mapped.length);
        } catch (error) {
            console.warn('⚠️ Supabase no disponible, cargando habitaciones desde IndexedDB');
            try {
                roomsData = await OfflineDB.getSnapshot('rooms');
                const available = roomsData.filter(r => r.status === 'Disponible').length;
                const card = document.querySelectorAll('.card-number')[2];
                if (card) card.textContent = available;
                console.log('📦 Habitaciones desde IndexedDB:', roomsData.length);
            } catch (e) { console.error('Error cargando habitaciones offline:', e); }
        }
    }

    async function loadGuestsFromSupabase() {
        try {
            const { data, error } = await supabaseClient.from('guests').select('*').eq('property_id', currentPropertyId).order('created_at', { ascending: false });
            if (error) throw error;
            const mapped = (data || []).map(g => ({ id: g.id, name: g.name, email: g.email, phone: g.phone || '' }));
            guestsData = mapped;
            try { await OfflineDB.saveSnapshot('guests', mapped); } catch (e) {}
            const card = document.querySelectorAll('.card-number')[1];
            if (card) card.textContent = mapped.length;
            console.log('✅ Huéspedes cargados:', mapped.length);
        } catch (error) {
            console.warn('⚠️ Supabase no disponible, cargando huéspedes desde IndexedDB');
            try {
                guestsData = await OfflineDB.getSnapshot('guests');
                const card = document.querySelectorAll('.card-number')[1];
                if (card) card.textContent = guestsData.length;
                console.log('📦 Huéspedes desde IndexedDB:', guestsData.length);
            } catch (e) { console.error('Error cargando huéspedes offline:', e); }
        }
    }

    async function loadReservationsFromSupabase() {
        try {
            const { data, error } = await supabaseClient.from('reservations').select(`*, rooms:room_id (number, type, price), guests:guest_id (id, name, email, phone)`).eq('property_id', currentPropertyId).order('check_in', { ascending: false });
            if (error) throw error;
            const mapped = (data || []).map(res => ({
                id: res.id, guestId: res.guest_id, name: res.guest_name,
                room: res.rooms?.number || 'Sin asignar', checkin: res.check_in, checkout: res.check_out,
                price: parseFloat(res.total_amount), channel: res.channel,
                email: res.guest_email, phone: res.guest_phone || 'No registrado', status: res.status || 'pending'
            }));
            guestsReservationsData = mapped;
            try { await OfflineDB.saveSnapshot('reservations', mapped); } catch (e) {}
            const active = (data || []).filter(r => r.status === 'confirmed').length;
            const card = document.querySelectorAll('.card-number')[0];
            if (card) card.textContent = active;
            console.log('✅ Reservaciones cargadas:', mapped.length);
        } catch (error) {
            console.warn('⚠️ Supabase no disponible, cargando reservaciones desde IndexedDB');
            try {
                guestsReservationsData = await OfflineDB.getSnapshot('reservations');
                const active = guestsReservationsData.filter(r => r.status === 'confirmed').length;
                const card = document.querySelectorAll('.card-number')[0];
                if (card) card.textContent = active;
                console.log('📦 Reservaciones desde IndexedDB:', guestsReservationsData.length);
            } catch (e) { console.error('Error cargando reservaciones offline:', e); }
        }
    }

    async function loadConsumptionsFromSupabase() {
        try {
            const { data, error } = await supabaseClient.from('consumptions').select(`*, rooms:room_id (number)`).eq('property_id', currentPropertyId).order('date', { ascending: false });
            if (error) throw error;
            const mapped = (data || []).map(c => ({
                id: c.id, room: c.rooms?.number || '', item: c.item,
                category: c.category, amount: parseFloat(c.amount), date: c.date.split('T')[0]
            }));
            billingData = mapped;
            try { await OfflineDB.saveSnapshot('consumptions', mapped); } catch (e) {}
            console.log('✅ Consumos cargados:', mapped.length);
        } catch (error) {
            console.warn('⚠️ Supabase no disponible, cargando consumos desde IndexedDB');
            try {
                billingData = await OfflineDB.getSnapshot('consumptions');
                console.log('📦 Consumos desde IndexedDB:', billingData.length);
            } catch (e) { console.error('Error cargando consumos offline:', e); }
        }
    }

    async function loadAllDataFromSupabase() {
        console.log('🔄 Cargando datos...');
        setCardsLoading(true);
        await Promise.all([loadRoomsFromSupabase(), loadGuestsFromSupabase(), loadConsumptionsFromSupabase()]);
        await loadReservationsFromSupabase();
        setCardsLoading(false);
        await updateOfflineBadge();
        console.log('✅ Todos los datos cargados');
    }

    // ============================================================
    // 7. SINCRONIZACIÓN DE LA COLA
    // ============================================================
    async function syncQueue() {
        let queue;
        try { queue = await OfflineDB.getQueue(); } catch (e) { return; }
        if (!queue || queue.length === 0) return;

        console.log(`[Sync] Sincronizando ${queue.length} operaciones pendientes...`);
        await updateOfflineBadge();

        let synced = 0;
        for (const item of queue) {
            try {
                if (item.action === 'create') {
                    // Eliminar el localId temporal antes de insertar en Supabase
                    const { localId, queueId, timestamp, propertyId, action, table, ...payload } = item;
                    const cleanPayload = { ...item.payload };
                    if (cleanPayload._localId) delete cleanPayload._localId;
                    await supabaseClient.from(item.table).insert({ property_id: propertyId, ...cleanPayload });
                } else if (item.action === 'update') {
                    await supabaseClient.from(item.table).update(item.payload).eq('id', item.payload.id).eq('property_id', item.propertyId);
                } else if (item.action === 'delete') {
                    await supabaseClient.from(item.table).delete().eq('id', item.payload.id);
                }
                await OfflineDB.removeFromQueue(item.queueId);
                synced++;
                console.log(`[Sync] ✅ ${item.action} en ${item.table}`);
            } catch (err) {
                console.error(`[Sync] ❌ Error en ${item.action} ${item.table}:`, err.message);
            }
        }

        if (synced > 0) {
            console.log(`[Sync] ${synced}/${queue.length} operaciones sincronizadas`);
            await loadAllDataFromSupabase(); // recarga desde Supabase para tener los IDs reales
            renderDynamicModule();
        }
        await updateOfflineBadge();
    }

    // Escucha cuando vuelve internet
    window.addEventListener('online',  async () => { console.log('[Offline] Conexión restaurada'); await syncQueue(); await updateOfflineBadge(); });
    window.addEventListener('offline', async () => { console.log('[Offline] Sin conexión'); await updateOfflineBadge(); });

    // ============================================================
    // 8. VARIABLES DE DOM
    // ============================================================
    const navButtons            = document.querySelectorAll('.nav-btn');
    const themeBtn              = document.getElementById('theme-btn');
    const crudSubtitle          = document.getElementById('crud-subtitle');
    const crudActionsPanel      = document.getElementById('crud-actions-panel');
    const btnAddRecord          = document.getElementById('btn-add-record');
    const dashboardCardsSection = document.getElementById('dashboard-cards-section');
    const mainDataBox           = document.getElementById('main-data-box');
    const dataBoxTitle          = document.getElementById('data-box-title');
    const dashboardPlaceholder  = document.getElementById('dashboard-placeholder');
    const crudTableContainer    = document.getElementById('crud-table-container');
    const crudTableHead         = document.getElementById('crud-table-head');
    const tableBody             = document.getElementById('crud-table-body');
    const crudModal             = document.getElementById('crud-modal');
    const crudForm              = document.getElementById('crud-form');
    const modalTitle            = document.getElementById('modal-title');
    const modalFormFields       = document.getElementById('modal-form-fields');
    const btnCloseModal         = document.getElementById('btn-close-modal');
    const recordIdInput         = document.getElementById('record-id');

    let activePill = document.querySelector('.active-pill');
    if (!activePill && navButtons.length > 0) {
        activePill = document.createElement('div');
        activePill.className = 'active-pill';
        activePill.setAttribute('aria-hidden', 'true');
        const navItems = document.querySelector('.nav-items');
        if (navItems) navItems.prepend(activePill);
    }

    // ============================================================
    // 9. DATA STORE
    // ============================================================
    let guestsData             = [];
    let guestsReservationsData = [];
    let roomsData              = [];
    let billingData            = [];
    let currentSection         = 'Dashboard';

    // ============================================================
    // 10. ANIMACIÓN DE LA PÍLDORA
    // ============================================================
    function updatePill(btn, smooth = true) {
        if (!btn || !activePill) return;
        activePill.style.transition = smooth
            ? 'transform .5s cubic-bezier(.34,1.2,.64,1), height .5s cubic-bezier(.34,1.2,.64,1), width .5s cubic-bezier(.34,1.2,.64,1)'
            : 'none';
        if (window.innerWidth <= 768) {
            activePill.style.height    = `${btn.offsetHeight}px`;
            activePill.style.width     = `${btn.offsetWidth}px`;
            activePill.style.transform = `translateX(${btn.offsetLeft}px)`;
        } else {
            activePill.style.height    = `${btn.offsetHeight}px`;
            activePill.style.width     = 'auto';
            activePill.style.transform = `translateY(${btn.offsetTop}px)`;
        }
    }

    // ============================================================
    // 11. NAVEGACIÓN
    // ============================================================
    if (navButtons.length > 0) {
        const initialActive = document.querySelector('.nav-btn.active');
        if (initialActive) setTimeout(() => updatePill(initialActive, false), 100);
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                navButtons.forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
                btn.classList.add('active');
                btn.setAttribute('aria-current', 'page');
                updatePill(btn);
                currentSection = btn.querySelector('span').textContent.trim();
                renderDynamicModule();
            });
        });
    }

    const nav   = document.getElementById('nav');
    const glare = document.getElementById('glare');
    if (nav && glare) {
        nav.addEventListener('mousemove', e => {
            const rect = nav.getBoundingClientRect();
            glare.style.setProperty('--x', `${e.clientX - rect.left}px`);
            glare.style.setProperty('--y', `${e.clientY - rect.top}px`);
        });
    }

    // ============================================================
    // 12. CRUD — OPERACIONES SUPABASE CON FALLBACK A COLA OFFLINE
    // ============================================================

    // Helper que intenta ejecutar en Supabase; si falla, agrega a la cola
    async function trySupabaseOrQueue(action, table, supabaseFn, localFn = null) {
        if (!navigator.onLine) {
            // Sin red → local inmediato + cola
            if (localFn) await localFn();
            await OfflineDB.addToQueue(action, table, null);
            await updateOfflineBadge();
            return { offline: true };
        }
        try {
            return await supabaseFn();
        } catch (err) {
            if (err.message?.includes('offline') || err.message?.includes('network') || err.message?.includes('fetch')) {
                if (localFn) await localFn();
                await OfflineDB.addToQueue(action, table, null);
                await updateOfflineBadge();
                return { offline: true };
            }
            throw err;
        }
    }

    // RESERVACIONES
    async function saveReservationToSupabase(data) {
        const guest = guestsData.find(g => g.id === data.guestId);
        if (!guest) throw new Error('Selecciona un huésped válido');
        const { data: room } = await supabaseClient.from('rooms').select('id').eq('number', data.room).eq('property_id', currentPropertyId).single();
        if (!room) throw new Error('Habitación no encontrada');
        const payload = { property_id: currentPropertyId, room_id: room.id, guest_id: guest.id, guest_name: guest.name, guest_email: guest.email, guest_phone: guest.phone, check_in: data.checkin, check_out: data.checkout, total_amount: data.price, channel: data.channel, status: 'pending' };
        if (!navigator.onLine) {
            const tempRecord = { id: `offline_${Date.now()}`, ...data, status: 'pending', _offline: true };
            guestsReservationsData.unshift(tempRecord);
            try { await OfflineDB.saveSnapshot('reservations', guestsReservationsData); } catch (e) {}
            await OfflineDB.addToQueue('create', 'reservations', payload);
            await updateOfflineBadge();
            return;
        }
        const { data: newRes, error } = await supabaseClient.from('reservations').insert(payload).select().single();
        if (error) throw error;
        await supabaseClient.from('rooms').update({ status: 'Ocupada' }).eq('id', room.id);
        console.log('✅ Reservación guardada en Supabase');
        return newRes;
    }

    async function updateReservationInSupabase(id, data) {
        const guest   = guestsData.find(g => g.id === data.guestId);
        const payload = { check_in: data.checkin, check_out: data.checkout, total_amount: data.price, channel: data.channel, status: data.status };
        if (guest) Object.assign(payload, { guest_id: guest.id, guest_name: guest.name, guest_email: guest.email, guest_phone: guest.phone });
        if (!navigator.onLine) {
            const idx = guestsReservationsData.findIndex(r => r.id == id);
            if (idx !== -1) guestsReservationsData[idx] = { ...guestsReservationsData[idx], ...data };
            try { await OfflineDB.saveSnapshot('reservations', guestsReservationsData); } catch (e) {}
            await OfflineDB.addToQueue('update', 'reservations', { id, ...payload });
            await updateOfflineBadge();
            return;
        }
        const { error } = await supabaseClient.from('reservations').update(payload).eq('id', id).eq('property_id', currentPropertyId);
        if (error) throw error;
        const { data: room } = await supabaseClient.from('rooms').select('id').eq('number', data.room).eq('property_id', currentPropertyId).single();
        if (room) await supabaseClient.from('reservations').update({ room_id: room.id }).eq('id', id);
    }

    async function deleteReservationFromSupabase(id) {
        if (!navigator.onLine) {
            guestsReservationsData = guestsReservationsData.filter(r => r.id != id);
            try { await OfflineDB.saveSnapshot('reservations', guestsReservationsData); } catch (e) {}
            await OfflineDB.addToQueue('delete', 'reservations', { id });
            await updateOfflineBadge();
            return;
        }
        const { error } = await supabaseClient.from('reservations').delete().eq('id', id);
        if (error) throw error;
        console.log('✅ Reservación eliminada');
    }

    // HUÉSPEDES
    async function saveGuestToSupabase(data) {
        if (!navigator.onLine) {
            const temp = { id: `offline_${Date.now()}`, ...data, _offline: true };
            guestsData.unshift(temp);
            try { await OfflineDB.saveSnapshot('guests', guestsData); } catch (e) {}
            await OfflineDB.addToQueue('create', 'guests', { property_id: currentPropertyId, ...data });
            await updateOfflineBadge();
            return;
        }
        const { error } = await supabaseClient.from('guests').insert({ property_id: currentPropertyId, ...data });
        if (error) throw error;
        console.log('✅ Huésped guardado');
    }

    async function updateGuestInSupabase(id, data) {
        if (!navigator.onLine) {
            const idx = guestsData.findIndex(g => g.id == id);
            if (idx !== -1) guestsData[idx] = { ...guestsData[idx], ...data };
            try { await OfflineDB.saveSnapshot('guests', guestsData); } catch (e) {}
            await OfflineDB.addToQueue('update', 'guests', { id, ...data });
            await updateOfflineBadge();
            return;
        }
        const { error } = await supabaseClient.from('guests').update(data).eq('id', id).eq('property_id', currentPropertyId);
        if (error) throw error;
        console.log('✅ Huésped actualizado');
    }

    async function deleteGuestFromSupabase(id) {
        if (!navigator.onLine) {
            guestsData = guestsData.filter(g => g.id != id);
            try { await OfflineDB.saveSnapshot('guests', guestsData); } catch (e) {}
            await OfflineDB.addToQueue('delete', 'guests', { id });
            await updateOfflineBadge();
            return;
        }
        const { error } = await supabaseClient.from('guests').delete().eq('id', id);
        if (error) throw error;
        console.log('✅ Huésped eliminado');
    }

    // HABITACIONES
    async function saveRoomToSupabase(data) {
        if (!navigator.onLine) {
            const temp = { id: `offline_${Date.now()}`, ...data, _offline: true };
            roomsData.push(temp);
            try { await OfflineDB.saveSnapshot('rooms', roomsData); } catch (e) {}
            await OfflineDB.addToQueue('create', 'rooms', { property_id: currentPropertyId, ...data });
            await updateOfflineBadge();
            return;
        }
        const { error } = await supabaseClient.from('rooms').insert({ property_id: currentPropertyId, ...data });
        if (error) throw error;
        console.log('✅ Habitación guardada');
    }

    async function updateRoomInSupabase(id, data) {
        if (!navigator.onLine) {
            const idx = roomsData.findIndex(r => r.id == id);
            if (idx !== -1) roomsData[idx] = { ...roomsData[idx], ...data };
            try { await OfflineDB.saveSnapshot('rooms', roomsData); } catch (e) {}
            await OfflineDB.addToQueue('update', 'rooms', { id, ...data });
            await updateOfflineBadge();
            return;
        }
        const { error } = await supabaseClient.from('rooms').update(data).eq('id', id).eq('property_id', currentPropertyId);
        if (error) throw error;
        console.log('✅ Habitación actualizada');
    }

    async function deleteRoomFromSupabase(id) {
        if (!navigator.onLine) {
            roomsData = roomsData.filter(r => r.id != id);
            try { await OfflineDB.saveSnapshot('rooms', roomsData); } catch (e) {}
            await OfflineDB.addToQueue('delete', 'rooms', { id });
            await updateOfflineBadge();
            return;
        }
        const { error } = await supabaseClient.from('rooms').delete().eq('id', id);
        if (error) throw error;
        console.log('✅ Habitación eliminada');
    }

    // CONSUMOS
    async function saveConsumptionToSupabase(data) {
        const { data: room } = await supabaseClient.from('rooms').select('id').eq('number', data.room).eq('property_id', currentPropertyId).single();
        if (!room && navigator.onLine) throw new Error('Habitación no encontrada para el consumo');
        const payload = { property_id: currentPropertyId, room_id: room?.id, item: data.item, category: data.category, amount: data.amount };
        if (!navigator.onLine) {
            const temp = { id: `offline_${Date.now()}`, ...data, date: new Date().toISOString().split('T')[0], _offline: true };
            billingData.unshift(temp);
            try { await OfflineDB.saveSnapshot('consumptions', billingData); } catch (e) {}
            await OfflineDB.addToQueue('create', 'consumptions', payload);
            await updateOfflineBadge();
            return;
        }
        const { error } = await supabaseClient.from('consumptions').insert(payload);
        if (error) throw error;
        console.log('✅ Consumo guardado');
    }

    async function updateConsumptionInSupabase(id, data) {
        const payload = { item: data.item, category: data.category, amount: data.amount };
        if (data.room) {
            const { data: room } = await supabaseClient.from('rooms').select('id').eq('number', data.room).eq('property_id', currentPropertyId).single();
            if (room) payload.room_id = room.id;
        }
        if (!navigator.onLine) {
            const idx = billingData.findIndex(b => b.id == id);
            if (idx !== -1) billingData[idx] = { ...billingData[idx], ...data };
            try { await OfflineDB.saveSnapshot('consumptions', billingData); } catch (e) {}
            await OfflineDB.addToQueue('update', 'consumptions', { id, ...payload });
            await updateOfflineBadge();
            return;
        }
        const { error } = await supabaseClient.from('consumptions').update(payload).eq('id', id).eq('property_id', currentPropertyId);
        if (error) throw error;
        console.log('✅ Consumo actualizado');
    }

    async function deleteConsumptionFromSupabase(id) {
        if (!navigator.onLine) {
            billingData = billingData.filter(b => b.id != id);
            try { await OfflineDB.saveSnapshot('consumptions', billingData); } catch (e) {}
            await OfflineDB.addToQueue('delete', 'consumptions', { id });
            await updateOfflineBadge();
            return;
        }
        const { error } = await supabaseClient.from('consumptions').delete().eq('id', id);
        if (error) throw error;
        console.log('✅ Consumo eliminado');
    }

    // ============================================================
    // 13. REPORTES
    // ============================================================
    let savedReports = JSON.parse(localStorage.getItem('saved_reports')) || [];

    function saveReportToLocal(report) {
        savedReports.unshift(report);
        if (savedReports.length > 50) savedReports.pop();
        localStorage.setItem('saved_reports', JSON.stringify(savedReports));
        renderReportsList();
    }

    window.deleteReport = function(id) {
        savedReports = savedReports.filter(r => r.id !== id);
        localStorage.setItem('saved_reports', JSON.stringify(savedReports));
        renderReportsList();
    };

    function renderReportsList() {
        const tbody = document.getElementById('reports-table-body');
        if (!tbody) return;
        if (savedReports.length === 0) {
            tbody.innerHTML = '<tr class="row-empty"><td colspan="5" style="text-align:center; color:var(--text-sub);">No hay reportes generados</td></tr>';
            return;
        }
        tbody.innerHTML = savedReports.map(r => `
            <tr>
                <td>${r.name}</td><td>${r.type}</td><td>${r.date}</td><td>${r.size || '—'}</td>
                <td class="report-actions-cell">
                    <button class="btn-icon-sm btn-download" onclick="window.downloadReport(${r.id})">📥 Descargar</button>
                    <button class="btn-icon-sm btn-delete" onclick="window.deleteReport(${r.id})">🗑️ Eliminar</button>
                </td>
            </tr>`).join('');
    }

    window.downloadReport = function(id) {
        const r = savedReports.find(r => r.id === id);
        if (r?.content) {
            const url = URL.createObjectURL(new Blob([r.content], { type: 'text/html' }));
            Object.assign(document.createElement('a'), { href: url, download: `${r.name}.html` }).click();
            URL.revokeObjectURL(url);
        }
    };

    function renderStatusBadge(status) {
        const map = {
            pending:   { label: 'Pendiente',  style: 'background:rgba(255,159,10,0.15); color:var(--warning-color);' },
            confirmed: { label: 'Confirmada', style: 'background:rgba(26,204,60,0.15);  color:var(--success-color);' },
            cancelled: { label: 'Cancelada',  style: 'background:rgba(255,55,95,0.15);  color:var(--danger-color);'  }
        };
        const { label, style } = map[status] || map.pending;
        return `<span class="badge-channel" style="${style} border:none; font-weight:700;">${label}</span>`;
    }

    function generateReportPreview() {
        const type   = document.getElementById('report-type').value;
        const from   = document.getElementById('report-date-from').value;
        const to     = document.getElementById('report-date-to').value;
        const div    = document.getElementById('preview-content');
        const container = document.getElementById('report-preview');
        const previewMap = {
            reservations: { title: 'Reservaciones', headers: ['Huésped','Habitación','Check-In','Check-Out','Monto','Estado'], rows: guestsReservationsData.map(g => [g.name,g.room,g.checkin,g.checkout,`Q${g.price}`,renderStatusBadge(g.status)]) },
            guests:       { title: 'Huéspedes',     headers: ['Nombre','Email','Teléfono'],                                   rows: guestsData.map(g => [g.name,g.email,g.phone]) },
            consumptions: { title: 'Consumos',       headers: ['Concepto','Categoría','Fecha','Monto'],                      rows: billingData.map(b => [b.item,b.category,b.date,`Q${b.amount}`]) },
            occupancy:    { title: 'Ocupación',      headers: ['Métrica','Valor'],                                           rows: [['Total',roomsData.length],['Ocupadas',roomsData.filter(r=>r.status==='Ocupada').length],['Libres',roomsData.filter(r=>r.status!=='Ocupada').length]] },
            revenue:      { title: 'Ingresos',       headers: ['Concepto','Monto'],                                          rows: [['Total reservaciones',`Q${guestsReservationsData.reduce((s,g)=>s+g.price,0)}`]] }
        };
        const p = previewMap[type] || previewMap.reservations;
        div.innerHTML = `<h3>${p.title}</h3><p>Generado: ${new Date().toLocaleString()}</p>${from?`<p>Período: ${from} → ${to||'actual'}</p>`:''}<table class="preview-table"><thead><tr>${p.headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${p.rows.map(row=>`<tr>${row.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        container.style.display = 'block';
    }

   // ============================================================
    // 13. REPORTES — generateAndSaveReport con fallback offline
    // ============================================================
    async function generateAndSaveReport() {
        const type = document.getElementById('report-type').value;
        const from = document.getElementById('report-date-from').value;
        const to   = document.getElementById('report-date-to').value;
        const btn  = document.getElementById('btn-generate-pdf');
        const orig = btn.innerHTML;

        // Sin internet → PDF local con jsPDF
        if (!navigator.onLine) {
            await generateOfflinePDF(type, from, to);
            return;
        }

        btn.innerHTML = '⏳ Generando PDF...';
        btn.disabled  = true;

        const dataMap = {
            reservations: guestsReservationsData.map(g=>({name:g.name,room:g.room,checkin:g.checkin,checkout:g.checkout,monto:g.price,channel:g.channel,email:g.email,phone:g.phone,status:g.status})),
            guests:       guestsData.map(g=>({name:g.name,email:g.email,phone:g.phone})),
            occupancy:    roomsData.map(r=>({number:r.number,type:r.type,status:r.status,price:r.price})),
            revenue:      guestsReservationsData.map(g=>({name:g.name,monto:g.price})),
            consumptions: billingData.map(b=>({item:b.item,category:b.category,monto:b.amount,date:b.date}))
        };

        try {
            const res = await fetch('https://roomdesk.onrender.com/api/generate-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ report_type: type, data: dataMap[type] || [], fecha_inicio: from, fecha_fin: to })
            });
            if (!res.ok) { const e = await res.json().catch(()=>{}); throw new Error(e?.error || `HTTP ${res.status}`); }
            const blob = await res.blob();
            if (blob.type !== 'application/pdf') throw new Error('El servidor no devolvió un PDF válido.');
            const url = window.URL.createObjectURL(blob);
            const a   = Object.assign(document.createElement('a'), { style:'display:none', href:url, download:`reporte_${type}_${Date.now()}.pdf` });
            document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a);
            const names = { reservations:'Reservaciones', occupancy:'Ocupación', guests:'Huéspedes', revenue:'Ingresos', consumptions:'Consumos' };
            saveReportToLocal({ id:Date.now(), name:`reporte_${type}`, type:names[type]||type, date:new Date().toLocaleString(), size:`${Math.round(blob.size/1024)} KB` });
            alert('✅ PDF generado y descargado exitosamente');
        } catch (err) {
            console.error('Error reporte:', err);
            // Si la red falla aunque onLine=true (ej. Render dormido), cae a jsPDF
            if (err.message.includes('fetch') || err.message.includes('Failed') || err.message.includes('network')) {
                console.warn('[Offline] Servidor no disponible, generando PDF local...');
                await generateOfflinePDF(type, from, to);
            } else {
                alert(`❌ Error al generar el reporte:\n${err.message}`);
            }
        } finally {
            btn.innerHTML = orig;
            btn.disabled  = false;
        }
    }

    // ============================================================
    // PDF OFFLINE — 100% en el navegador con jsPDF
    // ============================================================
    async function generateOfflinePDF(type, from, to) {
        const btn  = document.getElementById('btn-generate-pdf');
        const orig = btn.innerHTML;
        btn.innerHTML = '⏳ Generando PDF offline...';
        btn.disabled  = true;

        try {
            if (typeof window.jspdf === 'undefined') {
                alert('⚠️ La librería de PDF no está en caché todavía.\nAbre RoomDesk con internet al menos una vez para habilitarla offline.');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            const PAGE_W   = 210;
            const MARGIN   = 14;
            const COL_W    = PAGE_W - MARGIN * 2;
            const ROW_H    = 8;
            const HEADER_H = 10;
            const names    = { reservations:'Reservaciones', occupancy:'Ocupación', guests:'Huéspedes', revenue:'Ingresos', consumptions:'Consumos' };

            let y = MARGIN;

            // Encabezado azul
            doc.setFillColor(10, 132, 255);
            doc.roundedRect(MARGIN, y, COL_W, 14, 3, 3, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14); doc.setFont('helvetica', 'bold');
            doc.text('RoomDesk', MARGIN + 4, y + 9.5);
            doc.setFontSize(10); doc.setFont('helvetica', 'normal');
            doc.text('by Kawoq', PAGE_W - MARGIN - 4, y + 9.5, { align: 'right' });
            y += 20;

            // Título
            doc.setTextColor(30, 30, 30);
            doc.setFontSize(16); doc.setFont('helvetica', 'bold');
            doc.text(`Reporte de ${names[type] || type}`, MARGIN, y);
            y += 7;

            // Metadata
            doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
            doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, MARGIN, y);
            if (from) doc.text(`Período: ${from} → ${to || 'actual'}`, PAGE_W - MARGIN, y, { align: 'right' });
            doc.setDrawColor(220, 220, 220);
            doc.line(MARGIN, y + 3, PAGE_W - MARGIN, y + 3);
            y += 10;

            // Datos por tipo
            let headers = [], rows = [], colWidths = [];

            switch (type) {
                case 'reservations':
                    headers   = ['Huésped', 'Hab.', 'Check-In', 'Check-Out', 'Monto', 'Estado', 'Canal'];
                    colWidths = [40, 14, 22, 22, 18, 22, 24];
                    rows      = guestsReservationsData.map(g => [truncatePDF(g.name,18), g.room, g.checkin, g.checkout, `Q${g.price}`, statusLabelPDF(g.status), truncatePDF(g.channel,12)]);
                    break;
                case 'guests':
                    headers   = ['Nombre', 'Correo Electrónico', 'Teléfono'];
                    colWidths = [55, 80, 47];
                    rows      = guestsData.map(g => [truncatePDF(g.name,22), truncatePDF(g.email,32), g.phone || '—']);
                    break;
                case 'occupancy': {
                    const total = roomsData.length, occ = roomsData.filter(r=>r.status==='Ocupada').length;
                    drawSummaryBoxPDF(doc, MARGIN, y, COL_W, [
                        { label:'Total habitaciones', value: String(total) },
                        { label:'Ocupadas',           value: String(occ) },
                        { label:'Disponibles',        value: String(total - occ) },
                        { label:'Ocupación',          value: total ? `${((occ/total)*100).toFixed(1)}%` : '0%' }
                    ]);
                    y += 28;
                    headers   = ['Habitación', 'Tipo', 'Precio/Noche', 'Estado'];
                    colWidths = [28, 40, 34, 30];
                    rows      = roomsData.map(r => [r.number, r.type, `Q${r.price}`, r.status]);
                    break;
                }
                case 'revenue': {
                    const total = guestsReservationsData.reduce((s,g)=>s+g.price, 0);
                    drawSummaryBoxPDF(doc, MARGIN, y, COL_W, [
                        { label:'Total ingresos', value:`Q${total.toFixed(2)}` },
                        { label:'Reservaciones',  value: String(guestsReservationsData.length) }
                    ]);
                    y += 20;
                    headers   = ['Huésped', 'Habitación', 'Check-In', 'Check-Out', 'Monto'];
                    colWidths = [48, 18, 24, 24, 24];
                    rows      = guestsReservationsData.map(g => [truncatePDF(g.name,20), g.room, g.checkin, g.checkout, `Q${g.price}`]);
                    break;
                }
                case 'consumptions':
                    headers   = ['Habitación', 'Concepto', 'Categoría', 'Fecha', 'Monto'];
                    colWidths = [22, 58, 28, 22, 22];
                    rows      = billingData.map(b => [b.room||'—', truncatePDF(b.item,26), b.category, b.date, `Q${b.amount}`]);
                    break;
            }

            if (headers.length > 0) drawTablePDF(doc, headers, rows, colWidths, MARGIN, y, PAGE_W, MARGIN, ROW_H, HEADER_H);

            // Footer en cada página
            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(7); doc.setTextColor(170, 170, 170);
                doc.text(`RoomDesk by Kawoq · Página ${i} de ${totalPages}`, PAGE_W / 2, 292, { align: 'center' });
            }

            const filename = `reporte_${type}_${Date.now()}.pdf`;
            doc.save(filename);

            saveReportToLocal({ id:Date.now(), name:`reporte_${type}`, type:names[type]||type, date:new Date().toLocaleString(), size:'— KB', note:'(offline)' });
            alert('✅ PDF generado offline y descargado correctamente');

        } catch (err) {
            console.error('Error PDF offline:', err);
            alert(`❌ Error al generar el PDF:\n${err.message}`);
        } finally {
            btn.innerHTML = orig;
            btn.disabled  = false;
        }
    }

    // Helpers del PDF (con sufijo PDF para no colisionar con otras funciones)
    function truncatePDF(str, max) {
        if (!str) return '—';
        return str.length > max ? str.substring(0, max - 1) + '…' : str;
    }

    function statusLabelPDF(s) {
        return { pending:'Pendiente', confirmed:'Confirmada', cancelled:'Cancelada' }[s] || 'Pendiente';
    }

    function drawSummaryBoxPDF(doc, x, y, w, items) {
        const boxH  = 18;
        const itemW = w / items.length;
        doc.setFillColor(245, 247, 250);
        doc.roundedRect(x, y, w, boxH, 2, 2, 'F');
        items.forEach((item, i) => {
            const cx = x + itemW * i + itemW / 2;
            doc.setFontSize(7);  doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
            doc.text(item.label, cx, y + 7, { align: 'center' });
            doc.setFontSize(13); doc.setFont('helvetica', 'bold');   doc.setTextColor(10, 132, 255);
            doc.text(item.value, cx, y + 15, { align: 'center' });
        });
    }

    function drawTablePDF(doc, headers, rows, colWidths, ml, startY, pageW, pm, rowH, headerH) {
        let y = startY;
        // Cabecera
        doc.setFillColor(30, 30, 30);
        doc.rect(ml, y, pageW - ml * 2, headerH, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        let x = ml;
        headers.forEach((h, i) => { doc.text(h, x + 2, y + 7); x += colWidths[i]; });
        y += headerH;

        doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
        rows.forEach((row, ri) => {
            if (y + rowH > 282) {
                doc.addPage(); y = pm;
                doc.setFillColor(30, 30, 30);
                doc.rect(ml, y, pageW - ml * 2, headerH, 'F');
                doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
                let hx = ml;
                headers.forEach((h, i) => { doc.text(h, hx + 2, y + 7); hx += colWidths[i]; });
                y += headerH;
                doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
            }
            if (ri % 2 === 0) { doc.setFillColor(250, 250, 252); doc.rect(ml, y, pageW - ml * 2, rowH, 'F'); }
            doc.setTextColor(40, 40, 40);
            let cx = ml;
            row.forEach((cell, i) => { doc.text(String(cell ?? '—'), cx + 2, y + 5.5); cx += colWidths[i]; });
            doc.setDrawColor(230, 230, 230);
            doc.line(ml, y + rowH, pageW - ml, y + rowH);
            y += rowH;
        });
        if (rows.length === 0) {
            doc.setTextColor(160, 160, 160); doc.setFontSize(9);
            doc.text('No hay datos para este período.', pageW / 2, y + 8, { align: 'center' });
        }
    }

    function mostrarModuloReportes() {

    // ============================================================
    // 15. MODALES Y CRUD
    // ============================================================
    function openViewDetailModal(record) {
        if (!modalTitle || !crudModal || !modalFormFields) return;
        if (currentSection === 'Huéspedes') {
            modalTitle.textContent = 'Ficha del Huésped';
            modalFormFields.innerHTML = `<div class="detail-grid"><div class="detail-item detail-full"><label>Nombre Completo</label><p>${record.name}</p></div><div class="detail-item"><label>Correo Electrónico</label><p>${record.email}</p></div><div class="detail-item"><label>Teléfono</label><p>${record.phone||'—'}</p></div></div>`;
        } else {
            modalTitle.textContent = 'Ficha de Reservación';
            modalFormFields.innerHTML = `<div class="detail-grid"><div class="detail-item detail-full"><label>Nombre</label><p>${record.name}</p></div><div class="detail-item"><label>Habitación</label><p>${record.room}</p></div><div class="detail-item"><label>Tarifa/Noche</label><p>Q${record.price}</p></div><div class="detail-item"><label>Check-In</label><p>${record.checkin}</p></div><div class="detail-item"><label>Check-Out</label><p>${record.checkout}</p></div><div class="detail-item"><label>Canal</label><p>${record.channel}</p></div><div class="detail-item"><label>Estado</label><p>${renderStatusBadge(record.status)}</p></div><div class="detail-item"><label>Teléfono</label><p>${record.phone}</p></div><div class="detail-item detail-full"><label>Email</label><p>${record.email}</p></div></div>`;
        }
        crudModal.classList.add('open');
        const s = document.getElementById('btn-submit-form');
        if (s) s.style.display = 'none';
    }

    function injectFormFields() {
        const s = document.getElementById('btn-submit-form');
        if (s) s.style.display = 'block';
        if (!modalFormFields) return;
        if (currentSection === 'Reservaciones' || currentSection === 'Dashboard') {
            const go = guestsData.map(g=>`<option value="${g.id}">${g.name}</option>`).join('');
            const ro = roomsData.map(r=>`<option value="${r.number}" data-price="${r.price}">${r.number} — ${r.type} (Q${r.price})</option>`).join('');
            modalFormFields.innerHTML = `<div class="form-group"><label>Huésped</label><select id="input-guest" required><option value="">Selecciona un huésped...</option>${go}</select>${guestsData.length===0?'<p class="cell-subtext" style="margin-top:4px;color:var(--warning-color);">No hay huéspedes. Crea uno primero.</p>':''}</div><div class="form-row"><div class="form-group"><label>Habitación</label><select id="input-room" required><option value="">Selecciona...</option>${ro}</select></div><div class="form-group"><label>Precio/Noche (Q)</label><input type="number" id="input-price" required></div></div><div class="form-row"><div class="form-group"><label>Check-In</label><input type="date" id="input-checkin" required></div><div class="form-group"><label>Check-Out</label><input type="date" id="input-checkout" required></div></div><div class="form-row"><div class="form-group"><label>Canal</label><select id="input-channel" required><option value="Booking.com">Booking.com</option><option value="Airbnb">Airbnb</option><option value="Directo Web">Directo Web</option><option value="direct">Directo</option></select></div><div class="form-group"><label>Estado</label><select id="input-status" required><option value="pending">Pendiente</option><option value="confirmed">Confirmada</option><option value="cancelled">Cancelada</option></select></div></div>`;
            const rs = document.getElementById('input-room'); const pi = document.getElementById('input-price');
            if (rs && pi) rs.addEventListener('change', () => { const p = rs.options[rs.selectedIndex]?.getAttribute('data-price'); if (p) pi.value = p; });
        } else if (currentSection === 'Huéspedes') {
            modalFormFields.innerHTML = `<div class="form-group"><label>Nombre Completo</label><input type="text" id="input-guest-name" required placeholder="Ej. Juan Pérez"></div><div class="form-group"><label>Correo Electrónico</label><input type="email" id="input-guest-email" required placeholder="Ej. juan@correo.com"></div><div class="form-group"><label>Teléfono</label><input type="tel" id="input-guest-phone" placeholder="Ej. +502 5555-5555"></div>`;
        } else if (currentSection === 'Habitaciones') {
            modalFormFields.innerHTML = `<div class="form-row"><div class="form-group"><label>Número</label><input type="text" id="input-room-number" required placeholder="Ej. 101"></div><div class="form-group"><label>Tipo</label><select id="input-room-type" required><option value="Doble">Doble</option><option value="Triple">Triple</option><option value="Cuádruple">Cuádruple</option><option value="Quíntuple">Quíntuple</option><option value="Semi">Semi</option><option value="Dorm">Dorm</option></select></div></div><div class="form-row"><div class="form-group"><label>Precio/Noche (Q)</label><input type="number" id="input-room-price" step="0.01" required></div><div class="form-group"><label>Estado</label><select id="input-room-status" required><option value="Disponible">Disponible</option><option value="Ocupada">Ocupada</option><option value="Mantenimiento">Mantenimiento</option></select></div></div>`;
        } else if (currentSection === 'Consumo') {
            const ro = roomsData.map(r=>`<option value="${r.number}">${r.number} — ${r.type}</option>`).join('');
            modalFormFields.innerHTML = `<div class="form-group"><label>Habitación</label><select id="input-consumption-room" required><option value="">Selecciona...</option>${ro}</select></div><div class="form-row"><div class="form-group"><label>Concepto</label><input type="text" id="input-consumption-item" required placeholder="Ej. Cerveza Gallo x6"></div><div class="form-group"><label>Categoría</label><select id="input-consumption-category" required><option value="Restaurante">Restaurante</option><option value="Minibar">Minibar</option><option value="Actividades">Actividades</option><option value="Servicios">Servicios</option></select></div></div><div class="form-group"><label>Monto (Q)</label><input type="number" id="input-consumption-amount" step="0.01" required></div>`;
        }
    }

    function readFormData() {
        if (currentSection === 'Habitaciones') return { number:document.getElementById('input-room-number')?.value||'', type:document.getElementById('input-room-type')?.value||'Doble', price:parseFloat(document.getElementById('input-room-price')?.value||0), status:document.getElementById('input-room-status')?.value||'Disponible' };
        if (currentSection === 'Consumo')      return { room:document.getElementById('input-consumption-room')?.value||'', item:document.getElementById('input-consumption-item')?.value||'', category:document.getElementById('input-consumption-category')?.value||'Restaurante', amount:parseFloat(document.getElementById('input-consumption-amount')?.value||0) };
        if (currentSection === 'Huéspedes')    return { name:document.getElementById('input-guest-name')?.value||'', email:document.getElementById('input-guest-email')?.value||'', phone:document.getElementById('input-guest-phone')?.value||'' };
        return { guestId:document.getElementById('input-guest')?.value||'', room:document.getElementById('input-room')?.value||'', price:parseFloat(document.getElementById('input-price')?.value||0), checkin:document.getElementById('input-checkin')?.value||'', checkout:document.getElementById('input-checkout')?.value||'', channel:document.getElementById('input-channel')?.value||'direct', status:document.getElementById('input-status')?.value||'pending' };
    }

    function fillFormForEdit(r) {
        if (currentSection === 'Habitaciones') { ['number','type','price','status'].forEach(k => { const el = document.getElementById(`input-room-${k}`); if (el) el.value = r[k]||''; }); return; }
        if (currentSection === 'Consumo')      { document.getElementById('input-consumption-room')&&(document.getElementById('input-consumption-room').value=r.room||''); document.getElementById('input-consumption-item')&&(document.getElementById('input-consumption-item').value=r.item||''); document.getElementById('input-consumption-category')&&(document.getElementById('input-consumption-category').value=r.category||'Restaurante'); document.getElementById('input-consumption-amount')&&(document.getElementById('input-consumption-amount').value=r.amount||''); return; }
        if (currentSection === 'Huéspedes')    { document.getElementById('input-guest-name')&&(document.getElementById('input-guest-name').value=r.name||''); document.getElementById('input-guest-email')&&(document.getElementById('input-guest-email').value=r.email||''); document.getElementById('input-guest-phone')&&(document.getElementById('input-guest-phone').value=r.phone||''); return; }
        ['guest','room','price','checkin','checkout','channel','status'].forEach(k => { const el = document.getElementById(`input-${k}`); if (el) el.value = r[k]||r.guestId||''; });
        if (document.getElementById('input-guest')) document.getElementById('input-guest').value = r.guestId||'';
    }

    function openModal(record = null) {
        if (!crudModal) return;
        injectFormFields();
        crudModal.classList.add('open');
        if (record && modalTitle && recordIdInput) { modalTitle.textContent = 'Editar Registro'; recordIdInput.value = record.id; fillFormForEdit(record); }
        else if (modalTitle && crudForm) { modalTitle.textContent = 'Añadir Registro'; if (crudForm.reset) crudForm.reset(); if (recordIdInput) recordIdInput.value = ''; }
    }

    function closeModal() { if (crudModal) crudModal.classList.remove('open'); }
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
    if (btnAddRecord)  btnAddRecord.addEventListener('click', () => openModal());
    if (crudModal)     crudModal.addEventListener('click', e => { if (e.target === crudModal) closeModal(); });

    function findRecordById(id) {
        if (currentSection === 'Habitaciones') return roomsData.find(r => r.id == id);
        if (currentSection === 'Consumo')      return billingData.find(b => b.id == id);
        if (currentSection === 'Huéspedes')    return guestsData.find(g => g.id == id);
        return guestsReservationsData.find(g => g.id == id);
    }

    function attachRowEventListeners() {
        document.querySelectorAll('#crud-table-body tr:not(.row-empty)').forEach(row => {
            row.addEventListener('click', e => {
                if (e.target.closest('.btn-icon')) return;
                if (currentSection === 'Habitaciones' || currentSection === 'Consumo') return;
                const id = row.getAttribute('data-record-id');
                if (!id) return;
                const rec = currentSection === 'Huéspedes' ? guestsData.find(g => g.id == id) : guestsReservationsData.find(g => g.id == id);
                if (rec) openViewDetailModal(rec);
            });
        });
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', e => { e.stopPropagation(); const rec = findRecordById(btn.getAttribute('data-id')); if (rec) openModal(rec); });
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                if (!confirm('¿Estás seguro de eliminar este registro?')) return;
                const id = btn.getAttribute('data-id');
                try {
                    if      (currentSection === 'Habitaciones') await deleteRoomFromSupabase(id);
                    else if (currentSection === 'Consumo')      await deleteConsumptionFromSupabase(id);
                    else if (currentSection === 'Huéspedes')    await deleteGuestFromSupabase(id);
                    else                                        await deleteReservationFromSupabase(id);
                    if (navigator.onLine) await loadAllDataFromSupabase();
                    renderDynamicModule();
                } catch (err) { alert('Error al eliminar: ' + err.message); }
            });
        });
    }

    if (crudForm) {
        crudForm.addEventListener('submit', async e => {
            e.preventDefault();
            const sb = document.getElementById('btn-submit-form');
            if (sb?.style.display === 'none') return;
            const id  = recordIdInput?.value || null;
            const data = readFormData();
            try {
                if (sb) { sb.disabled = true; sb.textContent = navigator.onLine ? 'Guardando...' : 'Guardando offline...'; }
                if      (currentSection === 'Habitaciones') id ? await updateRoomInSupabase(id, data)        : await saveRoomToSupabase(data);
                else if (currentSection === 'Consumo')      id ? await updateConsumptionInSupabase(id, data) : await saveConsumptionToSupabase(data);
                else if (currentSection === 'Huéspedes')    id ? await updateGuestInSupabase(id, data)       : await saveGuestToSupabase(data);
                else                                        id ? await updateReservationInSupabase(id, data) : await saveReservationToSupabase(data);
                if (navigator.onLine) await loadAllDataFromSupabase();
                closeModal();
                renderDynamicModule();
            } catch (err) { alert('Error al guardar: ' + err.message); }
            finally { if (sb) { sb.disabled = false; sb.textContent = 'Guardar Cambios'; } }
        });
    }

    // ============================================================
    // 16. TEMA
    // ============================================================
    const root       = document.documentElement;
    const savedTheme = localStorage.getItem('theme') || 'light';
    root.setAttribute('data-theme', savedTheme);
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', t);
            localStorage.setItem('theme', t);
            setTimeout(() => { const a = document.querySelector('.nav-btn.active'); if (a) updatePill(a); }, 150);
        });
    }
    window.addEventListener('resize', () => { const a = document.querySelector('.nav-btn.active'); if (a) updatePill(a, false); });

    // ============================================================
    // 17. EVENTOS DE REPORTES
    // ============================================================
    const genBtn  = document.getElementById('btn-generate-pdf');
    const prevBtn = document.getElementById('btn-preview-report');
    if (genBtn)  genBtn.addEventListener('click',  generateAndSaveReport);
    if (prevBtn) prevBtn.addEventListener('click', generateReportPreview);

    // ============================================================
    // 18. INICIALIZACIÓN
    // ============================================================
    async function initializeDashboard() {
        if (crudSubtitle) crudSubtitle.textContent = 'Cargando datos...';
        await loadAllDataFromSupabase();
        renderDynamicModule();
        if (crudSubtitle && currentSection === 'Dashboard') crudSubtitle.textContent = 'Aquí tienes el resumen del día.';
        await updateOfflineBadge();
        // Si hay elementos en cola pendientes, intenta sincronizar si hay red
        if (navigator.onLine) await syncQueue();
    }

    await initializeDashboard();
});
