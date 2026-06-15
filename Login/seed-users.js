import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://unkbcfqmgvfmxyvlcqpc.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua2JjZnFtZ3ZmbXh5dmxjcXBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkyNjU4NCwiZXhwIjoyMDk1NTAyNTg0fQ.PwFyFmRzp0MjPwHZj685oWW4d0a3nTlV1ZTUP8Rmy78'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const users = [
  {
    email: 'admin@hoteloasis.com',
    password: 'OasisAdmin2026!',
    name: 'Oasis Admin',
    role: 'admin',
    property_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
  },
  {
    email: 'admin@elportalsemuc.com',
    password: 'ElPortalAdmin2026!',
    name: 'El Portal Admin',
    role: 'admin',
    property_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
  }
]

for (const user of users) {
  // 1. Crear en Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true
  })

  if (authError) {
    console.error(`❌ Error creando ${user.email}:`, authError.message)
    continue
  }

  // 2. Insertar en tabla usuarios
  const { error: profileError } = await supabase
    .from('usuarios')
    .insert({
      id: authData.user.id,
      property_id: user.property_id,
      name: user.name,
      email: user.email,
      role: user.role
    })

  if (profileError) {
    console.error(`❌ Error en perfil ${user.email}:`, profileError.message)
  } else {
    console.log(`✅ Usuario creado: ${user.email}`)
  }
}
