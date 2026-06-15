// ==========================================================================
// LOGIN JS, MANEJO DE AVATAR ANIMADO Y AUTENTICACIÓN CON SUPABASE O llamado Main Js
// 
// ==========================================================================

// ==========================================================================
// 1. REFERENCIAS A ELEMENTOS DEL DOM
// ==========================================================================
const email = document.querySelector('#email');
const password = document.querySelector('#password');
const loginForm = document.querySelector('#loginForm');
const themeToggleBtn = document.querySelector('#themeToggle');
// Importar Supabase (ya lo tienes en el HTML)
const SUPABASE_URL = 'https://unkbcfqmgvfmxyvlcqpc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua2JjZnFtZ3ZmbXh5dmxjcXBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkyNjU4NCwiZXhwIjoyMDk1NTAyNTg0fQ.PwFyFmRzp0MjPwHZj685oWW4d0a3nTlV1ZTUP8Rmy78';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variable global para manejar sesión
let currentSession = null;

// Elementos del avatar SVG
const mySVG = document.querySelector('.mySVG');
const armL = document.querySelector('.armL');
const armR = document.querySelector('.armR');
const eyeL = document.querySelector('.eyeL');
const eyeR = document.querySelector('.eyeR');
const nose = document.querySelector('.nose');
const mouth = document.querySelector('.mouth');
const mouthBG = document.querySelector('.mouthBG');
const mouthSmallBG = document.querySelector('.mouthSmallBG');
const mouthMediumBG = document.querySelector('.mouthMediumBG');
const mouthLargeBG = document.querySelector('.mouthLargeBG');
const mouthMaskPath = document.querySelector('#mouthMaskPath');
const mouthOutline = document.querySelector('.mouthOutline');
const tooth = document.querySelector('.tooth');
const tongue = document.querySelector('.tongue');
const chin = document.querySelector('.chin');
const face = document.querySelector('.face');
const eyebrow = document.querySelector('.eyebrow');
const outerEarL = document.querySelector('.earL .outerEar');
const outerEarR = document.querySelector('.earR .outerEar');
const earHairL = document.querySelector('.earL .earHair');
const earHairR = document.querySelector('.earR .earHair');
const hair = document.querySelector('.hair');

// ==========================================================================
// 2. CONSTANTES Y VARIABLES GLOBALES
// ==========================================================================
const eyeMaxHorizD = 20;
const eyeMaxVertD = 10;
const noseMaxHorizD = 23;
const noseMaxVertD = 10;

let caretPos, curEmailIndex, screenCenter, svgCoords, dFromC;
let mouthStatus = 'small';

// ==========================================================================
// 3. FUNCIONES DE ANIMACIÓN DEL AVATAR
// ==========================================================================

/**
 * Obtiene las coordenadas del caret y calcula las transformaciones faciales
 * @param {Event} e - Evento de input
 */
function getCoord(e) {
  const carPos = email.selectionEnd;
  const div = document.createElement('div');
  const span = document.createElement('span');
  const copyStyle = getComputedStyle(email);
  
  // Copiar estilos del input al div temporal
  Array.from(copyStyle).forEach(prop => {
    div.style[prop] = copyStyle[prop];
  });
  
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.pointerEvents = 'none';
  document.body.appendChild(div);
  
  div.textContent = email.value.substring(0, carPos);
  span.textContent = email.value.substring(carPos) || '.';
  div.appendChild(span);
  
  // Obtener coordenadas
  const emailCoords = email.getBoundingClientRect();
  const caretCoords = span.getBoundingClientRect();
  const svgRect = mySVG.getBoundingClientRect();
  
  svgCoords = { x: svgRect.left, y: svgRect.top };
  screenCenter = svgCoords.x + (mySVG.offsetWidth / 2);
  caretPos = caretCoords.x + emailCoords.x;
  dFromC = screenCenter - caretPos;
  
  // Calcular distancias para cada elemento facial
  const eyeLCoords = { x: svgCoords.x + 84, y: svgCoords.y + 76 };
  const eyeRCoords = { x: svgCoords.x + 113, y: svgCoords.y + 76 };
  const noseCoords = { x: svgCoords.x + 97, y: svgCoords.y + 81 };
  const mouthCoords = { x: svgCoords.x + 100, y: svgCoords.y + 100 };
  const targetX = emailCoords.x + caretCoords.x;
  const targetY = emailCoords.y + 25;
  
  // Ojos
  const eyeLAngle = getAngle(eyeLCoords.x, eyeLCoords.y, targetX, targetY);
  const eyeLX = Math.cos(eyeLAngle) * eyeMaxHorizD;
  const eyeLY = Math.sin(eyeLAngle) * eyeMaxVertD;
  
  const eyeRAngle = getAngle(eyeRCoords.x, eyeRCoords.y, targetX, targetY);
  const eyeRX = Math.cos(eyeRAngle) * eyeMaxHorizD;
  const eyeRY = Math.sin(eyeRAngle) * eyeMaxVertD;
  
  // Nariz
  const noseAngle = getAngle(noseCoords.x, noseCoords.y, targetX, targetY);
  const noseX = Math.cos(noseAngle) * noseMaxHorizD;
  const noseY = Math.sin(noseAngle) * noseMaxVertD;
  
  // Boca
  const mouthAngle = getAngle(mouthCoords.x, mouthCoords.y, targetX, targetY);
  const mouthX = Math.cos(mouthAngle) * noseMaxHorizD;
  const mouthY = Math.sin(mouthAngle) * noseMaxVertD;
  const mouthR = Math.cos(mouthAngle) * 6;
  
  // Barbilla
  const chinX = mouthX * 0.8;
  const chinY = mouthY * 0.5;
  let chinS = 1 - ((dFromC * 0.15) / 100);
  if (chinS > 1) { chinS = 1 - (chinS - 1); }
  
  // Cara
  const faceX = mouthX * 0.3;
  const faceY = mouthY * 0.4;
  const faceSkew = Math.cos(mouthAngle) * 5;
  const eyebrowSkew = Math.cos(mouthAngle) * 25;
  
  // Orejas y cabello
  const outerEarX = Math.cos(mouthAngle) * 4;
  const outerEarY = Math.cos(mouthAngle) * 5;
  const hairX = Math.cos(mouthAngle) * 6;
  const hairS = 1.2;
  
  // Animar con GSAP 3
  gsap.to(eyeL, { duration: 1, x: -eyeLX, y: -eyeLY, ease: 'expo.out' });
  gsap.to(eyeR, { duration: 1, x: -eyeRX, y: -eyeRY, ease: 'expo.out' });
  gsap.to(nose, { duration: 1, x: -noseX, y: -noseY, rotation: mouthR, transformOrigin: 'center center', ease: 'expo.out' });
  gsap.to(mouth, { duration: 1, x: -mouthX, y: -mouthY, rotation: mouthR, transformOrigin: 'center center', ease: 'expo.out' });
  gsap.to(chin, { duration: 1, x: -chinX, y: -chinY, scaleY: chinS, ease: 'expo.out' });
  gsap.to(face, { duration: 1, x: -faceX, y: -faceY, skewX: -faceSkew, transformOrigin: 'center top', ease: 'expo.out' });
  gsap.to(eyebrow, { duration: 1, x: -faceX, y: -faceY, skewX: -eyebrowSkew, transformOrigin: 'center top', ease: 'expo.out' });
  gsap.to(outerEarL, { duration: 1, x: outerEarX, y: -outerEarY, ease: 'expo.out' });
  gsap.to(outerEarR, { duration: 1, x: outerEarX, y: outerEarY, ease: 'expo.out' });
  gsap.to(earHairL, { duration: 1, x: -outerEarX, y: -outerEarY, ease: 'expo.out' });
  gsap.to(earHairR, { duration: 1, x: -outerEarX, y: outerEarY, ease: 'expo.out' });
  gsap.to(hair, { duration: 1, x: hairX, scaleY: hairS, transformOrigin: 'center bottom', ease: 'expo.out' });
  
  // Limpiar
  document.body.removeChild(div);
}

/**
 * Calcula el ángulo entre dos puntos
 */
function getAngle(x1, y1, x2, y2) {
  return Math.atan2(y1 - y2, x1 - x2);
}

/**
 * Cambia la expresión de la boca según el contenido del email
 */
function updateMouthExpression(value) {
  curEmailIndex = value.length;
  
  if (curEmailIndex > 0) {
    if (value.includes('@')) {
      // Boca grande (sorpresa/feliz)
      mouthStatus = 'large';
      gsap.to([mouthBG, mouthOutline, mouthMaskPath], { duration: 1, morphSVG: mouthLargeBG, ease: 'expo.out' });
      gsap.to(tooth, { duration: 1, x: 3, y: -2, ease: 'expo.out' });
      gsap.to(tongue, { duration: 1, y: 2, ease: 'expo.out' });
      gsap.to([eyeL, eyeR], { duration: 1, scaleX: 0.65, scaleY: 0.65, transformOrigin: 'center center', ease: 'expo.out' });
    } else {
      // Boca media
      mouthStatus = 'medium';
      gsap.to([mouthBG, mouthOutline, mouthMaskPath], { duration: 1, morphSVG: mouthMediumBG, ease: 'expo.out' });
      gsap.to(tooth, { duration: 1, x: 0, y: 0, ease: 'expo.out' });
      gsap.to(tongue, { duration: 1, x: 0, y: 1, ease: 'expo.out' });
      gsap.to([eyeL, eyeR], { duration: 1, scaleX: 0.85, scaleY: 0.85, ease: 'expo.out' });
    }
  } else {
    // Boca pequeña (normal)
    mouthStatus = 'small';
    gsap.to([mouthBG, mouthOutline, mouthMaskPath], { duration: 1, morphSVG: mouthSmallBG, shapeIndex: 9, ease: 'expo.out' });
    gsap.to(tooth, { duration: 1, x: 0, y: 0, ease: 'expo.out' });
    gsap.to(tongue, { duration: 1, y: 0, ease: 'expo.out' });
    gsap.to([eyeL, eyeR], { duration: 1, scaleX: 1, scaleY: 1, ease: 'expo.out' });
  }
}

/**
 * Cubre los ojos con los brazos (al hacer focus en password)
 */
function coverEyes() {
  gsap.to(armL, { duration: 0.45, x: -93, y: 2, rotation: 0, ease: 'quad.out' });
  gsap.to(armR, { duration: 0.45, x: -93, y: 2, rotation: 0, ease: 'quad.out', delay: 0.1 });
}

/**
 * Descubre los ojos (al hacer blur en password)
 */
function uncoverEyes() {
  gsap.to(armL, { duration: 0.7, x: -93, y: 220, rotation: 105, ease: 'quad.out' });
  gsap.to(armR, { duration: 0.7, x: -93, y: 220, rotation: -105, ease: 'quad.out', delay: 0.05 });
}

/**
 * Resetea la cara a su posición original
 */
function resetFace() {
  gsap.to([eyeL, eyeR], { duration: 1, x: 0, y: 0, ease: 'expo.out' });
  gsap.to(nose, { duration: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, ease: 'expo.out' });
  gsap.to(mouth, { duration: 1, x: 0, y: 0, rotation: 0, ease: 'expo.out' });
  gsap.to(chin, { duration: 1, x: 0, y: 0, scaleY: 1, ease: 'expo.out' });
  gsap.to([face, eyebrow], { duration: 1, x: 0, y: 0, skewX: 0, ease: 'expo.out' });
  gsap.to([outerEarL, outerEarR, earHairL, earHairR, hair], { duration: 1, x: 0, y: 0, scaleY: 1, ease: 'expo.out' });
}

// ==========================================================================
// 4. EVENT LISTENERS DEL AVATAR
// ==========================================================================

function onEmailInput(e) {
  getCoord(e);
  updateMouthExpression(e.target.value);
}

function onEmailFocus(e) {
  e.target.parentElement.classList.add('focusWithText');
  getCoord();
}

function onEmailBlur(e) {
  if (e.target.value === '') {
    e.target.parentElement.classList.remove('focusWithText');
  }
  resetFace();
}

function onPasswordFocus() {
  coverEyes();
}

function onPasswordBlur() {
  uncoverEyes();
}

email.addEventListener('focus', onEmailFocus);
email.addEventListener('blur', onEmailBlur);
email.addEventListener('input', onEmailInput);
password.addEventListener('focus', onPasswordFocus);
password.addEventListener('blur', onPasswordBlur);

// ==========================================================================
// 5. INICIALIZACIÓN DE BRAZOS
// ==========================================================================
gsap.set(armL, { x: -93, y: 220, rotation: 105, transformOrigin: 'top left' });
gsap.set(armR, { x: -93, y: 220, rotation: -105, transformOrigin: 'top right' });

// ==========================================================================
// 6. CONMUTADOR DE TEMAS (LIGHT/DARK MODE)
// ==========================================================================

// Cargar tema guardado
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
  document.body.classList.add('light-mode');
}

themeToggleBtn.addEventListener('click', () => {
  document.body.classList.toggle('light-mode');
  const newTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
  localStorage.setItem('theme', newTheme);
});

// ==========================================================================
// 7. LÓGICA DE AUTENTICACIÓN CON SUPABASE (REEMPLAZAR SECCIÓN 7)
// ==========================================================================

/**
 * Verifica si hay una sesión activa en Supabase
 */
async function checkActiveSession() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
        if (session) {
            console.log('✅ Sesión activa encontrada:', session.user.email);
            currentSession = session;
            
            // Verificar a qué propiedad pertenece el usuario
            const { data: userData, error: userError } = await supabaseClient
                .from('usuarios')
                .select('property_id, name, role')
                .eq('id', session.user.id)
                .single();
            
            if (userData && !userError) {
                localStorage.setItem('property_id', userData.property_id);
                localStorage.setItem('user_name', userData.name);
                localStorage.setItem('user_role', userData.role);
            }
            
            window.location.href = 'dashboard.html';
        }
    } catch (error) {
        console.log('No hay sesión activa');
    }
}

/**
 * Iniciar sesión con Supabase
 */
async function loginWithSupabase(email, password) {
    try {
        // 1. Autenticar con Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (authError) {
            // Traducir errores comunes
            if (authError.message.includes('Invalid login credentials')) {
                throw new Error('Correo o contraseña incorrectos');
            }
            throw authError;
        }
        
        if (!authData.user) {
            throw new Error('Error al iniciar sesión');
        }
        
        console.log('✅ Usuario autenticado:', authData.user.email);
        
        // 2. Obtener perfil del usuario desde la tabla usuarios
        const { data: userProfile, error: profileError } = await supabaseClient
            .from('usuarios')
            .select(`
                id,
                name,
                email,
                role,
                property_id,
                properties:property_id (
                    id,
                    name,
                    logo_url
                )
            `)
            .eq('id', authData.user.id)
            .single();
        
        if (profileError) {
            console.warn('⚠️ Perfil no encontrado, usando datos básicos');
        }
        
        // 3. Obtener la propiedad del usuario
        const propertyId = userProfile?.property_id || 
                          (await getDefaultProperty(authData.user.id));
        
        // 4. Guardar datos de sesión
        const sessionData = {
            user_id: authData.user.id,
            user_email: authData.user.email,
            user_name: userProfile?.name || email.split('@')[0],
            user_role: userProfile?.role || 'usuario',
            property_id: propertyId,
            property_name: userProfile?.properties?.name || 'RoomDesk',
            property_logo: userProfile?.properties?.logo_url || null,
            login_time: new Date().toISOString(),
            token: authData.session.access_token
        };
        
        // Guardar en localStorage
        Object.keys(sessionData).forEach(key => {
            localStorage.setItem(key, sessionData[key]);
        });
        
        // También guardar la sesión completa (para el dashboard)
        localStorage.setItem('supabase_session', JSON.stringify(authData.session));
        
        return {
            success: true,
            data: sessionData
        };
        
    } catch (error) {
        console.error('❌ Error de login:', error);
        return {
            success: false,
            error: error.message || 'Error al iniciar sesión'
        };
    }
}

/**
 * Obtiene la propiedad por defecto para el usuario
 */
async function getDefaultProperty(userId) {
    try {
        // Buscar la primera propiedad disponible
        const { data: properties, error } = await supabaseClient
            .from('properties')
            .select('id, name')
            .limit(1);
        
        if (properties && properties.length > 0) {
            // Asignar esta propiedad al usuario
            await supabaseClient
                .from('usuarios')
                .update({ property_id: properties[0].id })
                .eq('id', userId);
            
            return properties[0].id;
        }
        
        return null;
    } catch (error) {
        console.error('Error al obtener propiedad:', error);
        return null;
    }
}

/**
 * Muestra mensaje de error en el formulario
 */
function showLoginError(message) {
    // Remover errores anteriores
    const existingError = document.querySelector('.form-error-message');
    if (existingError) existingError.remove();
    
    // Marcar campos como error
    email.classList.add('error');
    password.classList.add('error');
    
    // Crear mensaje
    const errorMsg = document.createElement('div');
    errorMsg.className = 'form-error-message';
    errorMsg.textContent = message;
    errorMsg.style.cssText = `
        color: var(--error-color, #ff375f);
        text-align: center;
        margin-top: 12px;
        font-size: 0.85rem;
        font-weight: 500;
        animation: fadeIn 0.3s ease;
        background: rgba(255, 55, 95, 0.1);
        padding: 10px;
        border-radius: 8px;
    `;
    
    const submitBtn = document.querySelector('#login');
    submitBtn.parentElement.appendChild(errorMsg);
    
    // Animar error en el avatar
    gsap.to(mySVG, { 
        duration: 0.15, 
        x: 10, 
        repeat: 3, 
        yoyo: true, 
        ease: 'power2.inOut' 
    });
    
    // Limpiar después de 3 segundos
    setTimeout(() => {
        email.classList.remove('error');
        password.classList.remove('error');
        if (errorMsg.parentElement) {
            errorMsg.remove();
        }
    }, 3000);
}

/**
 * Muestra animación de éxito y redirige
 */
function showLoginSuccess(userData) {
    // Limpiar errores
    email.classList.remove('error');
    password.classList.remove('error');
    const existingError = document.querySelector('.form-error-message');
    if (existingError) existingError.remove();
    
    // Mostrar mensaje de éxito
    const successMsg = document.createElement('div');
    successMsg.className = 'form-success-message';
    successMsg.textContent = `¡Bienvenido ${userData.user_name}!`;
    successMsg.style.cssText = `
        color: #4CAF50;
        text-align: center;
        margin-top: 12px;
        font-size: 0.9rem;
        font-weight: 600;
        animation: fadeIn 0.3s ease;
    `;
    
    const submitBtn = document.querySelector('#login');
    submitBtn.parentElement.appendChild(successMsg);
    
    // Deshabilitar botón
    submitBtn.disabled = true;
    submitBtn.textContent = 'Iniciando sesión...';
    
    // Animación de éxito en el avatar
    gsap.to(mySVG, { 
        duration: 0.5, 
        scale: 1.1, 
        ease: 'back.out' 
    });
    gsap.to(mySVG, { 
        duration: 0.5, 
        scale: 1, 
        delay: 0.3, 
        ease: 'back.in' 
    });
    
    // Redirigir al dashboard
    setTimeout(() => {
        window.location.href = 'dashboard.html';
    }, 800);
}

// Verificar sesión activa al cargar
document.addEventListener('DOMContentLoaded', () => {
    checkActiveSession();
});

// Manejar envío del formulario con Supabase
loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const userEmail = email.value.trim();
    const userPassword = password.value;
    
    // Validar campos vacíos
    if (!userEmail || !userPassword) {
        showLoginError('Por favor completa todos los campos');
        return;
    }
    
    // Validar formato de email
    if (!userEmail.includes('@')) {
        showLoginError('Ingresa un correo electrónico válido');
        return;
    }
    
    // Mostrar estado de carga
    const submitBtn = document.querySelector('#login');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando...';
    
    // Intentar login con Supabase
    const result = await loginWithSupabase(userEmail, userPassword);
    
    if (result.success) {
        showLoginSuccess(result.data);
    } else {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        showLoginError(result.error);
        
        // Descubrir ojos (efecto visual)
        uncoverEyes();
        
        // Limpiar contraseña
        password.value = '';
        password.focus();
    }
});

// ==========================================================================
// 8. MANEJO DE TECLAS (ACCESIBILIDAD)
// ==========================================================================

// Permitir submit con Enter desde cualquier campo
password.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    loginForm.dispatchEvent(new Event('submit'));
  }
});

// ==========================================================================
// 9. DETECCIÓN DE GSAP (DEBUG)
// ==========================================================================
if (typeof gsap === 'undefined') {
  console.error('GSAP no está disponible. Verifica la carga del CDN.');
} else {
  console.log('✅ GSAP cargado correctamente v' + gsap.version);
}
