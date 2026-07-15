// ==========================================
// 0. CONFIGURACIÓN SUPABASE
// ADVERTENCIA: Reemplazar por el ANON key desde Supabase Dashboard → Settings → API
// El key actual es el service_role y tiene acceso total sin RLS.
// ==========================================
const SUPABASE_URL = 'https://unkbcfqmgvfmxyvlcqpc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua2JjZnFtZ3ZmbXh5dmxjcXBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkyNjU4NCwiZXhwIjoyMDk1NTAyNTg0fQ.PwFyFmRzp0MjPwHZj685oWW4d0a3nTlV1ZTUP8Rmy78';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentPropertyId = localStorage.getItem('property_id') || 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

document.addEventListener("DOMContentLoaded", async () => {

    // ==========================================
    // 1. VERIFICACIÓN DE SEGURIDAD CON SUPABASE
    // ==========================================
    async function checkSupabaseSession() {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();

            if (!session) {
                localStorage.clear();
                window.location.href = "../Login/index.html";
                return false;
            }

            localStorage.setItem('session_active', 'true');
            localStorage.setItem('user_email', session.user.email);

            const { data: userProfile } = await supabaseClient
                .from('usuarios')
                .select('name, role, property_id')
                .eq('id', session.user.id)
                .single();

            if (userProfile) {
                localStorage.setItem('user_name', userProfile.name);
                localStorage.setItem('user_role', userProfile.role);
                localStorage.setItem('property_id', userProfile.property_id);
                currentPropertyId = userProfile.property_id;
            }

            return true;
        } catch (error) {
            console.error('Error de sesión:', error);
            localStorage.clear();
            window.location.href = "../Login/index.html";
            return false;
        }
    }

    const isAuth = await checkSupabaseSession();
    if (!isAuth) return;

    // ==========================================
    // 2. FUNCIÓN DE LOGOUT CON SUPABASE
    // ==========================================
    // FIX: guardamos el ID del interval para poder limpiarlo y evitar el loop infinito
    let sessionCheckInterval = null;

    async function logout() {
        // Detener el interval ANTES de limpiar localStorage
        if (sessionCheckInterval) {
            clearInterval(sessionCheckInterval);
            sessionCheckInterval = null;
        }
        try {
            await supabaseClient.auth.signOut();
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
        } finally {
            localStorage.clear();
            window.location.href = "../Login/index.html";
        }
    }

    // El botón de logout ahora vive dentro del sidebar en el HTML.
    // Solo lo creamos dinámicamente si por alguna razón no está en el DOM.
    let logoutBtn = document.getElementById("logout-btn");
    if (!logoutBtn) {
        logoutBtn = document.createElement("button");
        logoutBtn.id = "logout-btn";
        logoutBtn.className = "logout-button";
        logoutBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Cerrar Sesión</span>
        `;
        // FIX: appendear al nav, no al body
        const nav = document.getElementById("nav");
        if (nav) nav.appendChild(logoutBtn);
        else document.body.appendChild(logoutBtn);
    }
    logoutBtn.addEventListener("click", logout);

    // ==========================================
    // 3. TIMEOUT DE SESIÓN POR INACTIVIDAD
    // ==========================================
    let sessionTimeout;

    function resetSessionTimeout() {
        clearTimeout(sessionTimeout);
        sessionTimeout = setTimeout(() => {
            alert("Tu sesión ha expirado por inactividad");
            logout();
        }, 30 * 60 * 1000); // 30 minutos
    }

    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, resetSessionTimeout, { passive: true });
    });
    resetSessionTimeout();

    // FIX: guardamos el ID para poder limpiar el interval en logout
    sessionCheckInterval = setInterval(() => {
        if (localStorage.getItem("session_active") !== "true") {
            logout();
        }
    }, 5000);

    // ==========================================
    // 4. PERSONALIZACIÓN DE UI
    // ==========================================
    const savedUser = localStorage.getItem("user_name") || "oasistraveler";
    const userRole  = localStorage.getItem("user_role")  || "admin";
    const userAvatar = localStorage.getItem("user_avatar") || "👤";
    const userHotel  = localStorage.getItem("user_hotel")  || "";

    document.querySelectorAll(".user-name").forEach(el => el.textContent = savedUser);

    const avatarWrapper = document.querySelector(".avatar-wrapper");
    if (avatarWrapper) {
        avatarWrapper.innerHTML = `<span style="font-size:24px;">${userAvatar}</span>`;
        avatarWrapper.style.background = "transparent";
    }

    const userRoleElement = document.querySelector(".user-role");
    if (userRoleElement) {
        const roleText = userRole === "admin" ? "Administrador" : "Gerente";
        userRoleElement.textContent = `${roleText}${userHotel ? ` · ${userHotel}` : ''}`;
    }

    const crudTitle = document.getElementById("crud-title");
    if (crudTitle) crudTitle.textContent = `Bienvenido de nuevo, ${savedUser}`;

    if (userRole !== "admin") {
        document.querySelectorAll(".admin-only").forEach(btn => btn.style.display = "none");
    }

    // ==========================================
    // 5. CARGA DE DATOS DESDE SUPABASE
    // ==========================================
    function setCardsLoading(loading) {
        document.querySelectorAll('.card-number').forEach(el => {
            if (loading) {
                el.textContent = '—';
                el.classList.add('is-loading');
            } else {
                el.classList.remove('is-loading');
            }
        });
    }

    async function loadRoomsFromSupabase() {
        try {
            const { data, error } = await supabaseClient
                .from('rooms')
                .select('*')
                .eq('property_id', currentPropertyId)
                .order('number');

            if (error) throw error;

            roomsData = (data || []).map(room => ({
                id: room.id,
                number: room.number,
                type: room.type,
                status: room.status,
                price: parseFloat(room.price)
            }));

            const availableRooms = roomsData.filter(r => r.status === 'Disponible').length;
            const cardHabitaciones = document.querySelectorAll('.card-number')[2];
            if (cardHabitaciones) cardHabitaciones.textContent = availableRooms;

            console.log('✅ Habitaciones cargadas:', roomsData.length);
        } catch (error) {
            console.error('Error al cargar habitaciones:', error);
        }
    }

    async function loadReservationsFromSupabase() {
        try {
            const { data, error } = await supabaseClient
                .from('reservations')
                .select(`
                    *,
                    rooms:room_id (number, type, price),
                    guests:guest_id (id, name, email, phone)
                `)
                .eq('property_id', currentPropertyId)
                .order('check_in', { ascending: false });

            if (error) throw error;

            guestsReservationsData = (data || []).map(res => ({
                id: res.id,
                guestId: res.guest_id,
                name: res.guest_name,
                room: res.rooms?.number || 'Sin asignar',
                checkin: res.check_in,
                checkout: res.check_out,
                price: parseFloat(res.total_amount),
                channel: res.channel,
                email: res.guest_email,
                phone: res.guest_phone || 'No registrado',
                status: res.status || 'pending'
            }));

            const activeReservations = (data || []).filter(r => r.status === 'confirmed').length;
            const cardReservas = document.querySelectorAll('.card-number')[0];
            if (cardReservas) cardReservas.textContent = activeReservations;

            console.log('✅ Reservaciones cargadas:', guestsReservationsData.length);
        } catch (error) {
            console.error('Error al cargar reservaciones:', error);
        }
    }

    async function loadGuestsFromSupabase() {
        try {
            const { data, error } = await supabaseClient
                .from('guests')
                .select('*')
                .eq('property_id', currentPropertyId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            guestsData = (data || []).map(g => ({
                id: g.id,
                name: g.name,
                email: g.email,
                phone: g.phone || ''
            }));

            const cardHuespedes = document.querySelectorAll('.card-number')[1];
            if (cardHuespedes) cardHuespedes.textContent = guestsData.length;

            console.log('✅ Huéspedes cargados:', guestsData.length);
        } catch (error) {
            console.error('Error al cargar huéspedes:', error);
        }
    }

    async function loadConsumptionsFromSupabase() {
        try {
            const { data, error } = await supabaseClient
                .from('consumptions')
                .select(`*, rooms:room_id (number)`)
                .eq('property_id', currentPropertyId)
                .order('date', { ascending: false });

            if (error) throw error;

            billingData = (data || []).map(cons => ({
                id: cons.id,
                room: cons.rooms?.number || '',
                item: cons.item,
                category: cons.category,
                amount: parseFloat(cons.amount),
                date: cons.date.split('T')[0]
            }));

            console.log('✅ Consumos cargados:', billingData.length);
        } catch (error) {
            console.error('Error al cargar consumos:', error);
        }
    }

    async function loadAllDataFromSupabase() {
        console.log('🔄 Cargando datos desde Supabase...');
        setCardsLoading(true);
        await Promise.all([
            loadRoomsFromSupabase(),
            loadGuestsFromSupabase(),
            loadConsumptionsFromSupabase()
        ]);
        await loadReservationsFromSupabase();
        setCardsLoading(false);
        console.log('✅ Todos los datos cargados');
    }

    // ==========================================
    // 6. VARIABLES DE DOM
    // ==========================================
    const navButtons       = document.querySelectorAll(".nav-btn");
    const themeBtn         = document.getElementById("theme-btn");
    const crudSubtitle     = document.getElementById("crud-subtitle");
    const crudActionsPanel = document.getElementById("crud-actions-panel");
    const btnAddRecord     = document.getElementById("btn-add-record");
    const dashboardCardsSection = document.getElementById("dashboard-cards-section");
    const mainDataBox      = document.getElementById("main-data-box");
    const dataBoxTitle     = document.getElementById("data-box-title");
    const dashboardPlaceholder  = document.getElementById("dashboard-placeholder");
    const crudTableContainer    = document.getElementById("crud-table-container");
    const crudTableHead    = document.getElementById("crud-table-head");
    const tableBody        = document.getElementById("crud-table-body");
    const crudModal        = document.getElementById("crud-modal");
    const crudForm         = document.getElementById("crud-form");
    const modalTitle       = document.getElementById("modal-title");
    const modalFormFields  = document.getElementById("modal-form-fields");
    const btnCloseModal    = document.getElementById("btn-close-modal");
    const recordIdInput    = document.getElementById("record-id");

    // FIX: la clase correcta es .nav-items, no .nav-menu (que no existe en el HTML)
    let activePill = document.querySelector(".active-pill");
    if (!activePill && navButtons.length > 0) {
        activePill = document.createElement("div");
        activePill.className = "active-pill";
        activePill.setAttribute("aria-hidden", "true");
        const navItems = document.querySelector(".nav-items");
        if (navItems) navItems.prepend(activePill);
    }

    // ==========================================
    // 7. DATA STORE
    // ==========================================
    let guestsData             = [];
    let guestsReservationsData = [];
    let roomsData              = [];
    let billingData            = [];
    let currentSection         = "Dashboard";

    // ==========================================
    // 8. ANIMACIÓN DE LA PÍLDORA
    // ==========================================
    function updatePill(btn, smooth = true) {
        if (!btn || !activePill) return;

        activePill.style.transition = smooth
            ? "transform .5s cubic-bezier(.34,1.2,.64,1), height .5s cubic-bezier(.34,1.2,.64,1), width .5s cubic-bezier(.34,1.2,.64,1)"
            : "none";

        if (window.innerWidth <= 768) {
            activePill.style.height    = `${btn.offsetHeight}px`;
            activePill.style.width     = `${btn.offsetWidth}px`;
            activePill.style.transform = `translateX(${btn.offsetLeft}px)`;
        } else {
            activePill.style.height    = `${btn.offsetHeight}px`;
            activePill.style.width     = "auto";
            activePill.style.transform = `translateY(${btn.offsetTop}px)`;
        }
    }

    // ==========================================
    // 9. ENRUTADOR DE NAVEGACIÓN
    // ==========================================
    if (navButtons.length > 0) {
        const initialActive = document.querySelector(".nav-btn.active");
        if (initialActive) setTimeout(() => updatePill(initialActive, false), 100);

        navButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                navButtons.forEach(b => {
                    b.classList.remove("active");
                    b.removeAttribute("aria-current");
                });
                btn.classList.add("active");
                btn.setAttribute("aria-current", "page");
                updatePill(btn);
                currentSection = btn.querySelector("span").textContent.trim();
                renderDynamicModule();
            });
        });
    }

    // Efecto de brillo dinámico por mouse en el nav
    const nav = document.getElementById("nav");
    const glare = document.getElementById("glare");
    if (nav && glare) {
        nav.addEventListener("mousemove", (e) => {
            const rect = nav.getBoundingClientRect();
            glare.style.setProperty("--x", `${e.clientX - rect.left}px`);
            glare.style.setProperty("--y", `${e.clientY - rect.top}px`);
        });
    }

    // ==========================================
    // 10. FUNCIONES DE REPORTES
    // ==========================================
    let savedReports = JSON.parse(localStorage.getItem('saved_reports')) || [];

    function saveReportToLocal(report) {
        savedReports.unshift(report);
        if (savedReports.length > 50) savedReports.pop();
        localStorage.setItem('saved_reports', JSON.stringify(savedReports));
        renderReportsList();
    }

    window.deleteReport = function(reportId) {
        savedReports = savedReports.filter(r => r.id !== reportId);
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

        tbody.innerHTML = savedReports.map(report => `
            <tr>
                <td>${report.name}</td>
                <td>${report.type}</td>
                <td>${report.date}</td>
                <td>${report.size || '—'}</td>
                <td class="report-actions-cell">
                    <button class="btn-icon-sm btn-download" onclick="window.downloadReport(${report.id})">📥 Descargar</button>
                    <button class="btn-icon-sm btn-delete" onclick="window.deleteReport(${report.id})">🗑️ Eliminar</button>
                </td>
            </tr>
        `).join('');
    }

    window.downloadReport = function(reportId) {
        const report = savedReports.find(r => r.id === reportId);
        if (report && report.content) {
            const blob = new Blob([report.content], { type: 'text/html' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `${report.name}.html`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    // FIX: renderStatusBadge usa variables CSS en vez de colores hardcodeados
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
        const reportType       = document.getElementById('report-type').value;
        const dateFrom         = document.getElementById('report-date-from').value;
        const dateTo           = document.getElementById('report-date-to').value;
        const previewDiv       = document.getElementById('preview-content');
        const previewContainer = document.getElementById('report-preview');

        let data = [], title = '', headers = [];

        switch (reportType) {
            case 'reservations':
                title   = 'Reporte de Reservaciones';
                headers = ['Huésped', 'Habitación', 'Check-In', 'Check-Out', 'Monto', 'Estado'];
                data    = guestsReservationsData.map(g => [g.name, g.room, g.checkin, g.checkout, `Q${g.price}`, renderStatusBadge(g.status)]);
                break;
            case 'occupancy': {
                title   = 'Reporte de Ocupación';
                const total    = roomsData.length;
                const occupied = roomsData.filter(r => r.status === 'Ocupada').length;
                headers = ['Métrica', 'Valor'];
                data    = [
                    ['Total Habitaciones', total],
                    ['Ocupadas', occupied],
                    ['Libres', total - occupied],
                    ['Ocupación %', total ? `${((occupied / total) * 100).toFixed(1)}%` : '0%']
                ];
                break;
            }
            case 'guests':
                title   = 'Reporte de Huéspedes';
                headers = ['Nombre', 'Email', 'Teléfono'];
                data    = guestsData.map(g => [g.name, g.email, g.phone]);
                break;
            case 'revenue': {
                title   = 'Reporte de Ingresos';
                const totalRevenue = guestsReservationsData.reduce((sum, g) => sum + g.price, 0);
                headers = ['Concepto', 'Monto'];
                data    = [['Reservaciones', `Q${totalRevenue}`], ['Total', `Q${totalRevenue}`]];
                break;
            }
            case 'consumptions':
                title   = 'Reporte de Consumos';
                headers = ['Concepto', 'Categoría', 'Fecha', 'Monto'];
                data    = billingData.map(b => [b.item, b.category, b.date, `Q${b.amount}`]);
                break;
        }

        previewDiv.innerHTML = `
            <h3>${title}</h3>
            <p>Generado: ${new Date().toLocaleString()}</p>
            ${dateFrom ? `<p>Período: ${dateFrom} → ${dateTo || 'actual'}</p>` : ''}
            <table class="preview-table">
                <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
                <tbody>${data.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
        `;
        previewContainer.style.display = 'block';
    }

    async function generateAndSaveReport() {
        const reportType  = document.getElementById('report-type').value;
        const dateFrom    = document.getElementById('report-date-from').value;
        const dateTo      = document.getElementById('report-date-to').value;
        const generateBtn = document.getElementById('btn-generate-pdf');
        const originalHTML = generateBtn.innerHTML;

        generateBtn.innerHTML = '⏳ Generando PDF...';
        generateBtn.disabled  = true;

        const dataMap = {
            reservations: guestsReservationsData.map(g => ({
                name: g.name, room: g.room, checkin: g.checkin, checkout: g.checkout,
                monto: g.price, channel: g.channel, email: g.email, phone: g.phone, status: g.status
            })),
            guests:       guestsData.map(g => ({ name: g.name, email: g.email, phone: g.phone })),
            occupancy:    roomsData.map(r => ({ number: r.number, type: r.type, status: r.status, price: r.price })),
            revenue:      guestsReservationsData.map(g => ({ name: g.name, monto: g.price })),
            consumptions: billingData.map(b => ({ item: b.item, category: b.category, monto: b.amount, date: b.date }))
        };

        try {
            const response = await fetch('https://roomdesk.onrender.com/api/generate-pdf', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ report_type: reportType, data: dataMap[reportType] || [], fecha_inicio: dateFrom, fecha_fin: dateTo })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            const blob = await response.blob();
            if (blob.type !== 'application/pdf') throw new Error('El servidor no devolvió un PDF válido.');

            const url = window.URL.createObjectURL(blob);
            const a   = Object.assign(document.createElement('a'), { style: 'display:none', href: url, download: `reporte_${reportType}_${Date.now()}.pdf` });
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            const names = { reservations: 'Reservaciones', occupancy: 'Ocupación', guests: 'Huéspedes', revenue: 'Ingresos', consumptions: 'Consumos' };
            saveReportToLocal({ id: Date.now(), name: `reporte_${reportType}`, type: names[reportType] || reportType, date: new Date().toLocaleString(), size: `${Math.round(blob.size / 1024)} KB` });
            alert('✅ PDF generado y descargado exitosamente');

        } catch (error) {
            console.error('Error al generar reporte:', error);
            alert(`❌ Error al generar el reporte:\n${error.message}`);
        } finally {
            generateBtn.innerHTML = originalHTML;
            generateBtn.disabled  = false;
        }
    }

    function mostrarModuloReportes() {
        const reportsSection = document.getElementById('reports-section');
        if (reportsSection)      reportsSection.style.display      = 'block';
        if (dashboardCardsSection) dashboardCardsSection.style.display = 'none';
        if (crudActionsPanel)    crudActionsPanel.style.display    = 'none';
        if (crudTableContainer)  crudTableContainer.style.display  = 'none';
        if (mainDataBox)         mainDataBox.style.display         = 'none';

        const today        = new Date().toISOString().split('T')[0];
        const thirtyAgo    = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const fromInput    = document.getElementById('report-date-from');
        const toInput      = document.getElementById('report-date-to');
        if (fromInput && !fromInput.value) fromInput.value = thirtyAgo;
        if (toInput   && !toInput.value)   toInput.value   = today;
        renderReportsList();
    }

    // FIX: no mostrar las KPI cards al salir de Reportes si no estamos en Dashboard
    function ocultarModuloReportes() {
        const reportsSection = document.getElementById('reports-section');
        if (reportsSection) reportsSection.style.display = 'none';
        if (mainDataBox)    mainDataBox.style.display    = 'flex';
        if (dataBoxTitle)   dataBoxTitle.style.display   = 'block';
        // Las cards solo se muestran desde renderDynamicModule cuando la sección es Dashboard
        if (currentSection !== "Dashboard" && dashboardCardsSection) {
            dashboardCardsSection.style.display = 'none';
        }
    }

    // ==========================================
    // 11. CRUD: RESERVACIONES
    // ==========================================
    async function saveReservationToSupabase(reservationData) {
        const guest = guestsData.find(g => g.id === reservationData.guestId);
        if (!guest) throw new Error('Selecciona un huésped válido');

        const { data: room } = await supabaseClient.from('rooms').select('id').eq('number', reservationData.room).eq('property_id', currentPropertyId).single();
        if (!room) throw new Error('Habitación no encontrada');

        const { data: newReservation, error: resError } = await supabaseClient.from('reservations').insert({
            property_id: currentPropertyId, room_id: room.id,
            guest_id: guest.id, guest_name: guest.name, guest_email: guest.email, guest_phone: guest.phone,
            check_in: reservationData.checkin, check_out: reservationData.checkout,
            total_amount: reservationData.price, channel: reservationData.channel, status: 'pending'
        }).select().single();

        if (resError) throw resError;
        await supabaseClient.from('rooms').update({ status: 'Ocupada' }).eq('id', room.id);
        console.log('✅ Reservación guardada');
        return newReservation;
    }

    async function updateReservationInSupabase(targetId, dataObj) {
        const guest = guestsData.find(g => g.id === dataObj.guestId);
        const payload = { check_in: dataObj.checkin, check_out: dataObj.checkout, total_amount: dataObj.price, channel: dataObj.channel, status: dataObj.status };
        if (guest) Object.assign(payload, { guest_id: guest.id, guest_name: guest.name, guest_email: guest.email, guest_phone: guest.phone });

        const { error } = await supabaseClient.from('reservations').update(payload).eq('id', targetId).eq('property_id', currentPropertyId);
        if (error) throw error;

        const { data: room } = await supabaseClient.from('rooms').select('id').eq('number', dataObj.room).eq('property_id', currentPropertyId).single();
        if (room) await supabaseClient.from('reservations').update({ room_id: room.id }).eq('id', targetId);
    }

    async function deleteReservationFromSupabase(id) {
        const { error } = await supabaseClient.from('reservations').delete().eq('id', id);
        if (error) throw error;
        console.log('✅ Reservación eliminada');
    }

    // ==========================================
    // 11B. CRUD: HUÉSPEDES
    // ==========================================
    async function saveGuestToSupabase(guestData) {
        const { error } = await supabaseClient.from('guests').insert({ property_id: currentPropertyId, name: guestData.name, email: guestData.email, phone: guestData.phone });
        if (error) throw error;
        console.log('✅ Huésped guardado');
    }

    async function updateGuestInSupabase(targetId, guestData) {
        const { error } = await supabaseClient.from('guests').update({ name: guestData.name, email: guestData.email, phone: guestData.phone }).eq('id', targetId).eq('property_id', currentPropertyId);
        if (error) throw error;
        console.log('✅ Huésped actualizado');
    }

    async function deleteGuestFromSupabase(id) {
        const { error } = await supabaseClient.from('guests').delete().eq('id', id);
        if (error) throw error;
        console.log('✅ Huésped eliminado');
    }

    // ==========================================
    // 11C. CRUD: HABITACIONES
    // ==========================================
    async function saveRoomToSupabase(roomData) {
        const { error } = await supabaseClient.from('rooms').insert({ property_id: currentPropertyId, number: roomData.number, type: roomData.type, status: roomData.status, price: roomData.price });
        if (error) throw error;
        console.log('✅ Habitación guardada');
    }

    async function updateRoomInSupabase(targetId, roomData) {
        const { error } = await supabaseClient.from('rooms').update({ number: roomData.number, type: roomData.type, status: roomData.status, price: roomData.price }).eq('id', targetId).eq('property_id', currentPropertyId);
        if (error) throw error;
        console.log('✅ Habitación actualizada');
    }

    async function deleteRoomFromSupabase(id) {
        const { error } = await supabaseClient.from('rooms').delete().eq('id', id);
        if (error) throw error;
        console.log('✅ Habitación eliminada');
    }

    // ==========================================
    // 11D. CRUD: CONSUMO
    // ==========================================
    async function saveConsumptionToSupabase(data) {
        const { data: room } = await supabaseClient.from('rooms').select('id').eq('number', data.room).eq('property_id', currentPropertyId).single();
        if (!room) throw new Error('Habitación no encontrada para el consumo');
        const { error } = await supabaseClient.from('consumptions').insert({ property_id: currentPropertyId, room_id: room.id, item: data.item, category: data.category, amount: data.amount });
        if (error) throw error;
        console.log('✅ Consumo guardado');
    }

    async function updateConsumptionInSupabase(targetId, data) {
        const payload = { item: data.item, category: data.category, amount: data.amount };
        if (data.room) {
            const { data: room } = await supabaseClient.from('rooms').select('id').eq('number', data.room).eq('property_id', currentPropertyId).single();
            if (room) payload.room_id = room.id;
        }
        const { error } = await supabaseClient.from('consumptions').update(payload).eq('id', targetId).eq('property_id', currentPropertyId);
        if (error) throw error;
        console.log('✅ Consumo actualizado');
    }

    async function deleteConsumptionFromSupabase(id) {
        const { error } = await supabaseClient.from('consumptions').delete().eq('id', id);
        if (error) throw error;
        console.log('✅ Consumo eliminado');
    }

    // ==========================================
    // 12. FUNCIÓN PRINCIPAL DE RENDER
    // ==========================================
    function renderDynamicModule() {
        if (!tableBody || !crudTableHead) return;

        tableBody.innerHTML    = "";
        crudTableHead.innerHTML = "";
        ocultarModuloReportes();

        // --- DASHBOARD ---
        if (currentSection === "Dashboard") {
            if (crudTitle)    crudTitle.textContent    = `Bienvenido de nuevo, ${savedUser}`;
            if (crudSubtitle) crudSubtitle.textContent = "Resumen de ocupación para hoy.";
            if (dataBoxTitle) dataBoxTitle.textContent = "Check-ins / Check-outs de hoy (datos en vivo)";

            if (dashboardCardsSection) dashboardCardsSection.style.display = "grid";
            if (crudActionsPanel)      crudActionsPanel.style.display      = "none";
            if (dashboardPlaceholder)  dashboardPlaceholder.style.display  = "none";
            if (crudTableContainer)    crudTableContainer.style.display    = "block";

            crudTableHead.innerHTML = `<tr><th>Huésped</th><th>Habitación</th><th>Estado de Tránsito</th><th>Canal</th><th>Detalles rápidos</th></tr>`;

            const today = new Date().toISOString().split('T')[0];

            if (guestsReservationsData.length === 0) {
                tableBody.innerHTML = '<tr class="row-empty"><td colspan="5" style="text-align:center; color:var(--text-sub); padding:32px;">No hay reservaciones para hoy.</td></tr>';
            } else {
                guestsReservationsData.forEach(guest => {
                    let badge = '';
                    if      (guest.checkin  === today) badge = `<span class="badge-channel" style="background:rgba(26,204,60,0.15); color:var(--success-color); border:none;">➡ Entrada Hoy</span>`;
                    else if (guest.checkout === today) badge = `<span class="badge-channel" style="background:rgba(255,55,95,0.15);  color:var(--danger-color);  border:none;">⬅ Salida Hoy</span>`;
                    else                               badge = `<span class="badge-channel" style="color:var(--text-sub);">En Curso</span>`;

                    const tr = document.createElement("tr");
                    tr.setAttribute("data-record-id", guest.id);
                    tr.innerHTML = `
                        <td><strong>${guest.name}</strong></td>
                        <td><span class="badge-channel" style="font-weight:700;">${guest.room}</span></td>
                        <td>${badge}</td>
                        <td><span class="badge-channel" style="background:rgba(10,132,255,0.12);">${guest.channel}</span></td>
                        <td style="color:var(--text-sub); font-size:12px;">Click en la fila para ver ficha</td>
                    `;
                    tableBody.appendChild(tr);
                });
            }

            attachRowEventListeners();
            return;
        }

        // --- SECCIONES CON TABLA ---
        if (dashboardCardsSection) dashboardCardsSection.style.display = "none";
        if (dashboardPlaceholder)  dashboardPlaceholder.style.display  = "none";
        if (crudTableContainer)    crudTableContainer.style.display    = "block";
        if (crudTitle)    crudTitle.textContent    = currentSection;
        if (dataBoxTitle) dataBoxTitle.textContent = `Registros en Módulo ${currentSection}`;

        switch (currentSection) {

            case "Reservaciones":
                if (crudSubtitle)     crudSubtitle.textContent          = "Datos completos con habitación, fechas, precio y canal.";
                if (crudActionsPanel) crudActionsPanel.style.display    = "flex";
                crudTableHead.innerHTML = `<tr><th>Huésped</th><th>Habitación</th><th>Check-In / Out</th><th>Precio</th><th>Canal</th><th>Estado</th><th>Contacto</th><th>Acciones</th></tr>`;
                if (guestsReservationsData.length === 0) {
                    tableBody.innerHTML = '<tr class="row-empty"><td colspan="8" style="text-align:center; color:var(--text-sub); padding:32px;">No hay reservaciones registradas.</td></tr>';
                } else {
                    guestsReservationsData.forEach(guest => {
                        const tr = document.createElement("tr");
                        tr.setAttribute("data-record-id", guest.id);
                        tr.innerHTML = `
                            <td><strong>${guest.name}</strong></td>
                            <td><span class="badge-channel" style="font-weight:700;">${guest.room}</span></td>
                            <td>In: ${guest.checkin}<span class="cell-subtext">Out: ${guest.checkout}</span></td>
                            <td><strong>Q${guest.price}</strong>/Noche</td>
                            <td><span class="badge-channel" style="background:rgba(10,132,255,0.12);">${guest.channel}</span></td>
                            <td>${renderStatusBadge(guest.status)}</td>
                            <td>${guest.email}<span class="cell-subtext">${guest.phone}</span></td>
                            <td><div class="action-buttons">${editBtn(guest.id)}${deleteBtn(guest.id)}</div></td>
                        `;
                        tableBody.appendChild(tr);
                    });
                }
                break;

            // FIX: "Huéspedes" con acento — coincide con el texto del botón del nav
            case "Huéspedes":
                if (crudSubtitle)     crudSubtitle.textContent       = "Registro de personas: nombre, correo y teléfono.";
                if (crudActionsPanel) crudActionsPanel.style.display = "flex";
                crudTableHead.innerHTML = `<tr><th>Nombre</th><th>Correo Electrónico</th><th>Teléfono</th><th>Acciones</th></tr>`;
                if (guestsData.length === 0) {
                    tableBody.innerHTML = '<tr class="row-empty"><td colspan="4" style="text-align:center; color:var(--text-sub); padding:32px;">No hay huéspedes registrados.</td></tr>';
                } else {
                    guestsData.forEach(guest => {
                        const tr = document.createElement("tr");
                        tr.setAttribute("data-record-id", guest.id);
                        tr.innerHTML = `
                            <td><strong>${guest.name}</strong></td>
                            <td>${guest.email}</td>
                            <td>${guest.phone || '—'}</td>
                            <td><div class="action-buttons">${editBtn(guest.id)}${deleteBtn(guest.id)}</div></td>
                        `;
                        tableBody.appendChild(tr);
                    });
                }
                break;

            case "Habitaciones":
                if (crudSubtitle)     crudSubtitle.textContent       = "Inventario de habitaciones, tarifas y disponibilidad.";
                if (crudActionsPanel) crudActionsPanel.style.display = "flex";
                crudTableHead.innerHTML = `<tr><th>Nº Habitación</th><th>Tipología</th><th>Precio Base</th><th>Estado Actual</th><th>Acciones</th></tr>`;
                if (roomsData.length === 0) {
                    tableBody.innerHTML = '<tr class="row-empty"><td colspan="5" style="text-align:center; color:var(--text-sub); padding:32px;">No hay habitaciones registradas.</td></tr>';
                } else {
                    roomsData.forEach(room => {
                        const statusStyles = {
                            'Disponible':    'background:rgba(26,204,60,0.15);  color:var(--success-color);',
                            'Ocupada':       'background:rgba(10,132,255,0.15); color:#0a84ff;',
                            'Mantenimiento': 'background:rgba(255,55,95,0.15);  color:var(--danger-color);'
                        };
                        const style = statusStyles[room.status] || statusStyles['Disponible'];
                        const tr = document.createElement("tr");
                        tr.setAttribute("data-record-id", room.id);
                        tr.innerHTML = `
                            <td><strong>${room.number}</strong></td>
                            <td>${room.type}</td>
                            <td><strong>Q${room.price}</strong>/Noche</td>
                            <td><span class="badge-channel" style="${style} border:none;">${room.status}</span></td>
                            <td><div class="action-buttons">${editBtn(room.id)}${deleteBtn(room.id)}</div></td>
                        `;
                        tableBody.appendChild(tr);
                    });
                }
                break;

            case "Consumo":
                if (crudSubtitle)     crudSubtitle.textContent       = "Gastos adicionales, restaurante y minibar.";
                if (crudActionsPanel) crudActionsPanel.style.display = "flex";
                crudTableHead.innerHTML = `<tr><th>Habitación</th><th>Concepto</th><th>Categoría</th><th>Fecha</th><th>Importe</th><th>Acciones</th></tr>`;
                if (billingData.length === 0) {
                    tableBody.innerHTML = '<tr class="row-empty"><td colspan="6" style="text-align:center; color:var(--text-sub); padding:32px;">No hay consumos registrados.</td></tr>';
                } else {
                    billingData.forEach(item => {
                        const tr = document.createElement("tr");
                        tr.setAttribute("data-record-id", item.id);
                        tr.innerHTML = `
                            <td><strong>${item.room || '—'}</strong></td>
                            <td>${item.item}</td>
                            <td><span class="badge-channel">${item.category}</span></td>
                            <td>${item.date}</td>
                            <td><strong style="color:var(--success-color);">Q${item.amount.toFixed(2)}</strong></td>
                            <td><div class="action-buttons">${editBtn(item.id)}${deleteBtn(item.id)}</div></td>
                        `;
                        tableBody.appendChild(tr);
                    });
                }
                break;

            case "Reportes":
                if (crudSubtitle) crudSubtitle.textContent = "Genera y gestiona reportes personalizados";
                mostrarModuloReportes();
                break;
        }

        attachRowEventListeners();
    }

    // Helpers para generar botones de acción (evitan repetir el SVG inline 8 veces)
    function editBtn(id) {
        return `<button class="btn-icon edit-btn" data-id="${id}" aria-label="Editar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        </button>`;
    }
    function deleteBtn(id) {
        return `<button class="btn-icon delete delete-btn" data-id="${id}" aria-label="Eliminar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>`;
    }

    // ==========================================
    // 13. MODALES Y CRUD
    // ==========================================
    function openViewDetailModal(record) {
        if (!modalTitle || !crudModal || !modalFormFields) return;

        // FIX: "Huéspedes" con acento
        if (currentSection === "Huéspedes") {
            modalTitle.textContent = "Ficha del Huésped";
            modalFormFields.innerHTML = `
                <div class="detail-grid">
                    <div class="detail-item detail-full"><label>Nombre Completo</label><p>${record.name}</p></div>
                    <div class="detail-item"><label>Correo Electrónico</label><p>${record.email}</p></div>
                    <div class="detail-item"><label>Teléfono</label><p>${record.phone || '—'}</p></div>
                </div>`;
        } else {
            modalTitle.textContent = "Ficha de Reservación";
            modalFormFields.innerHTML = `
                <div class="detail-grid">
                    <div class="detail-item detail-full"><label>Nombre Completo</label><p>${record.name}</p></div>
                    <div class="detail-item"><label>Habitación</label><p>${record.room}</p></div>
                    <div class="detail-item"><label>Tarifa por Noche</label><p>Q${record.price}</p></div>
                    <div class="detail-item"><label>Check-In</label><p>${record.checkin}</p></div>
                    <div class="detail-item"><label>Check-Out</label><p>${record.checkout}</p></div>
                    <div class="detail-item"><label>Canal</label><p>${record.channel}</p></div>
                    <div class="detail-item"><label>Estado</label><p>${renderStatusBadge(record.status)}</p></div>
                    <div class="detail-item"><label>Teléfono</label><p>${record.phone}</p></div>
                    <div class="detail-item detail-full"><label>Email</label><p>${record.email}</p></div>
                </div>`;
        }

        crudModal.classList.add("open");
        const submitBtn = document.getElementById("btn-submit-form");
        if (submitBtn) submitBtn.style.display = "none";
    }

    function injectFormFields() {
        const submitBtn = document.getElementById("btn-submit-form");
        if (submitBtn) submitBtn.style.display = "block";
        if (!modalFormFields) return;

        if (currentSection === "Reservaciones" || currentSection === "Dashboard") {
            const guestOptions = guestsData.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
            const roomOptions  = roomsData.map(r => `<option value="${r.number}" data-price="${r.price}">${r.number} — ${r.type} (Q${r.price})</option>`).join('');
            modalFormFields.innerHTML = `
                <div class="form-group">
                    <label>Huésped</label>
                    <select id="input-guest" required>
                        <option value="">Selecciona un huésped...</option>${guestOptions}
                    </select>
                    ${guestsData.length === 0 ? '<p class="cell-subtext" style="margin-top:4px; color:var(--warning-color);">No hay huéspedes. Ve a Huéspedes y crea uno primero.</p>' : ''}
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Habitación</label>
                        <select id="input-room" required><option value="">Selecciona...</option>${roomOptions}</select>
                    </div>
                    <div class="form-group"><label>Precio/Noche (Q)</label><input type="number" id="input-price" required></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Check-In</label><input type="date" id="input-checkin" required></div>
                    <div class="form-group"><label>Check-Out</label><input type="date" id="input-checkout" required></div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Canal</label>
                        <select id="input-channel" required>
                            <option value="Booking.com">Booking.com</option>
                            <option value="Airbnb">Airbnb</option>
                            <option value="Directo Web">Directo Web</option>
                            <option value="direct">Directo</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Estado</label>
                        <select id="input-status" required>
                            <option value="pending">Pendiente</option>
                            <option value="confirmed">Confirmada</option>
                            <option value="cancelled">Cancelada</option>
                        </select>
                    </div>
                </div>`;
            const roomSelect = document.getElementById("input-room");
            const priceInput = document.getElementById("input-price");
            if (roomSelect && priceInput) {
                roomSelect.addEventListener("change", () => {
                    const price = roomSelect.options[roomSelect.selectedIndex]?.getAttribute("data-price");
                    if (price) priceInput.value = price;
                });
            }

        // FIX: "Huéspedes" con acento
        } else if (currentSection === "Huéspedes") {
            modalFormFields.innerHTML = `
                <div class="form-group"><label>Nombre Completo</label><input type="text" id="input-guest-name" required placeholder="Ej. Juan Pérez"></div>
                <div class="form-group"><label>Correo Electrónico</label><input type="email" id="input-guest-email" required placeholder="Ej. juan@correo.com"></div>
                <div class="form-group"><label>Teléfono</label><input type="tel" id="input-guest-phone" placeholder="Ej. +502 5555-5555"></div>`;

        } else if (currentSection === "Habitaciones") {
            modalFormFields.innerHTML = `
                <div class="form-row">
                    <div class="form-group"><label>Número</label><input type="text" id="input-room-number" required placeholder="Ej. 101"></div>
                    <div class="form-group">
                        <label>Tipo</label>
                        <select id="input-room-type" required>
                            <option value="Doble">Doble</option><option value="Triple">Triple</option>
                            <option value="Cuádruple">Cuádruple</option><option value="Quíntuple">Quíntuple</option>
                            <option value="Semi">Semi</option><option value="Dorm">Dorm</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Precio/Noche (Q)</label><input type="number" id="input-room-price" step="0.01" required></div>
                    <div class="form-group">
                        <label>Estado</label>
                        <select id="input-room-status" required>
                            <option value="Disponible">Disponible</option>
                            <option value="Ocupada">Ocupada</option>
                            <option value="Mantenimiento">Mantenimiento</option>
                        </select>
                    </div>
                </div>`;

        } else if (currentSection === "Consumo") {
            const roomOptions = roomsData.map(r => `<option value="${r.number}">${r.number} — ${r.type}</option>`).join('');
            modalFormFields.innerHTML = `
                <div class="form-group">
                    <label>Habitación</label>
                    <select id="input-consumption-room" required><option value="">Selecciona...</option>${roomOptions}</select>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Concepto</label><input type="text" id="input-consumption-item" required placeholder="Ej. Cerveza Gallo x6"></div>
                    <div class="form-group">
                        <label>Categoría</label>
                        <select id="input-consumption-category" required>
                            <option value="Restaurante">Restaurante</option><option value="Minibar">Minibar</option>
                            <option value="Actividades">Actividades</option><option value="Servicios">Servicios</option>
                        </select>
                    </div>
                </div>
                <div class="form-group"><label>Monto (Q)</label><input type="number" id="input-consumption-amount" step="0.01" required></div>`;
        }
    }

    function readFormData() {
        if (currentSection === "Habitaciones") return { number: document.getElementById("input-room-number")?.value || "", type: document.getElementById("input-room-type")?.value || "Doble", price: parseFloat(document.getElementById("input-room-price")?.value || 0), status: document.getElementById("input-room-status")?.value || "Disponible" };
        if (currentSection === "Consumo")      return { room: document.getElementById("input-consumption-room")?.value || "", item: document.getElementById("input-consumption-item")?.value || "", category: document.getElementById("input-consumption-category")?.value || "Restaurante", amount: parseFloat(document.getElementById("input-consumption-amount")?.value || 0) };
        // FIX: "Huéspedes" con acento
        if (currentSection === "Huéspedes")    return { name: document.getElementById("input-guest-name")?.value || "", email: document.getElementById("input-guest-email")?.value || "", phone: document.getElementById("input-guest-phone")?.value || "" };
        return { guestId: document.getElementById("input-guest")?.value || "", room: document.getElementById("input-room")?.value || "", price: parseFloat(document.getElementById("input-price")?.value || 0), checkin: document.getElementById("input-checkin")?.value || "", checkout: document.getElementById("input-checkout")?.value || "", channel: document.getElementById("input-channel")?.value || "direct", status: document.getElementById("input-status")?.value || "pending" };
    }

    function fillFormForEdit(record) {
        if (currentSection === "Habitaciones") {
            document.getElementById("input-room-number") && (document.getElementById("input-room-number").value = record.number || '');
            document.getElementById("input-room-type")   && (document.getElementById("input-room-type").value   = record.type   || 'Doble');
            document.getElementById("input-room-price")  && (document.getElementById("input-room-price").value  = record.price  || '');
            document.getElementById("input-room-status") && (document.getElementById("input-room-status").value = record.status || 'Disponible');
            return;
        }
        if (currentSection === "Consumo") {
            document.getElementById("input-consumption-room")     && (document.getElementById("input-consumption-room").value     = record.room     || '');
            document.getElementById("input-consumption-item")     && (document.getElementById("input-consumption-item").value     = record.item     || '');
            document.getElementById("input-consumption-category") && (document.getElementById("input-consumption-category").value = record.category || 'Restaurante');
            document.getElementById("input-consumption-amount")   && (document.getElementById("input-consumption-amount").value   = record.amount   || '');
            return;
        }
        // FIX: "Huéspedes" con acento
        if (currentSection === "Huéspedes") {
            document.getElementById("input-guest-name")  && (document.getElementById("input-guest-name").value  = record.name  || '');
            document.getElementById("input-guest-email") && (document.getElementById("input-guest-email").value = record.email || '');
            document.getElementById("input-guest-phone") && (document.getElementById("input-guest-phone").value = record.phone || '');
            return;
        }
        document.getElementById("input-guest")    && (document.getElementById("input-guest").value    = record.guestId  || '');
        document.getElementById("input-room")     && (document.getElementById("input-room").value     = record.room     || '');
        document.getElementById("input-price")    && (document.getElementById("input-price").value    = record.price    || '');
        document.getElementById("input-checkin")  && (document.getElementById("input-checkin").value  = record.checkin  || '');
        document.getElementById("input-checkout") && (document.getElementById("input-checkout").value = record.checkout || '');
        document.getElementById("input-channel")  && (document.getElementById("input-channel").value  = record.channel  || 'direct');
        document.getElementById("input-status")   && (document.getElementById("input-status").value   = record.status   || 'pending');
    }

    function openModal(record = null) {
        if (!crudModal) return;
        injectFormFields();
        crudModal.classList.add("open");
        if (record && modalTitle && recordIdInput) {
            modalTitle.textContent = "Editar Registro";
            recordIdInput.value    = record.id;
            fillFormForEdit(record);
        } else if (modalTitle && crudForm) {
            modalTitle.textContent = "Añadir Registro";
            if (crudForm.reset) crudForm.reset();
            if (recordIdInput) recordIdInput.value = "";
        }
    }

    function closeModal() { if (crudModal) crudModal.classList.remove("open"); }

    if (btnCloseModal) btnCloseModal.addEventListener("click", closeModal);
    if (btnAddRecord)  btnAddRecord.addEventListener("click",  () => openModal());

    // Cerrar modal al hacer click fuera de la card
    if (crudModal) {
        crudModal.addEventListener("click", (e) => {
            if (e.target === crudModal) closeModal();
        });
    }

    function findRecordById(id) {
        if (currentSection === "Habitaciones") return roomsData.find(r => r.id == id);
        if (currentSection === "Consumo")      return billingData.find(b => b.id == id);
        // FIX: "Huéspedes" con acento
        if (currentSection === "Huéspedes")    return guestsData.find(g => g.id == id);
        return guestsReservationsData.find(g => g.id == id);
    }

    function attachRowEventListeners() {
        document.querySelectorAll("#crud-table-body tr:not(.row-empty)").forEach(row => {
            row.addEventListener("click", (e) => {
                if (e.target.closest(".btn-icon")) return;
                if (currentSection === "Habitaciones" || currentSection === "Consumo") return;
                const recordId = row.getAttribute("data-record-id");
                if (!recordId) return;
                // FIX: "Huéspedes" con acento
                const record = currentSection === "Huéspedes"
                    ? guestsData.find(g => g.id == recordId)
                    : guestsReservationsData.find(g => g.id == recordId);
                if (record) openViewDetailModal(record);
            });
        });

        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const record = findRecordById(btn.getAttribute("data-id"));
                if (record) openModal(record);
            });
        });

        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (!confirm('¿Estás seguro de eliminar este registro? Esta acción no se puede deshacer.')) return;
                const id = btn.getAttribute("data-id");
                try {
                    // FIX: "Huéspedes" con acento
                    if      (currentSection === "Habitaciones") await deleteRoomFromSupabase(id);
                    else if (currentSection === "Consumo")      await deleteConsumptionFromSupabase(id);
                    else if (currentSection === "Huéspedes")    await deleteGuestFromSupabase(id);
                    else                                        await deleteReservationFromSupabase(id);
                    await loadAllDataFromSupabase();
                    renderDynamicModule();
                } catch (error) {
                    alert('Error al eliminar: ' + error.message);
                }
            });
        });
    }

    if (crudForm) {
        crudForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById("btn-submit-form");
            if (submitBtn?.style.display === "none") return;

            const targetId = recordIdInput?.value || null;
            const dataObj  = readFormData();

            try {
                if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Guardando...'; }

                // FIX: "Huéspedes" con acento
                if      (currentSection === "Habitaciones") targetId ? await updateRoomInSupabase(targetId, dataObj)         : await saveRoomToSupabase(dataObj);
                else if (currentSection === "Consumo")      targetId ? await updateConsumptionInSupabase(targetId, dataObj)   : await saveConsumptionToSupabase(dataObj);
                else if (currentSection === "Huéspedes")    targetId ? await updateGuestInSupabase(targetId, dataObj)         : await saveGuestToSupabase(dataObj);
                else                                        targetId ? await updateReservationInSupabase(targetId, dataObj)   : await saveReservationToSupabase(dataObj);

                await loadAllDataFromSupabase();
                closeModal();
                renderDynamicModule();
            } catch (error) {
                alert('Error al guardar: ' + error.message);
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Guardar Cambios'; }
            }
        });
    }

    // ==========================================
    // 14. INTERRUPTOR DE TEMA
    // ==========================================
    const root       = document.documentElement;
    const savedTheme = localStorage.getItem("theme") || "light";
    root.setAttribute("data-theme", savedTheme);

    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const newTheme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
            root.setAttribute("data-theme", newTheme);
            localStorage.setItem("theme", newTheme);
            setTimeout(() => {
                const active = document.querySelector(".nav-btn.active");
                if (active) updatePill(active);
            }, 150);
        });
    }

    window.addEventListener("resize", () => {
        const active = document.querySelector(".nav-btn.active");
        if (active) updatePill(active, false);
    });

    // ==========================================
    // 15. EVENTOS DE REPORTES
    // ==========================================
    const generateBtn = document.getElementById('btn-generate-pdf');
    const previewBtn  = document.getElementById('btn-preview-report');
    if (generateBtn) generateBtn.addEventListener('click', generateAndSaveReport);
    if (previewBtn)  previewBtn.addEventListener('click',  generateReportPreview);

    // ==========================================
    // 16. INICIALIZACIÓN
    // ==========================================
    async function initializeDashboard() {
        if (crudSubtitle) crudSubtitle.textContent = 'Cargando datos...';
        await loadAllDataFromSupabase();
        renderDynamicModule();
        if (crudSubtitle && currentSection === "Dashboard") {
            crudSubtitle.textContent = 'Aquí tienes el resumen del día.';
        }
    }

    await initializeDashboard();
});
