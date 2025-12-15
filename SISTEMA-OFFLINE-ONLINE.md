# Sistema Offline/Online Implementado

## 📋 Resumen

Se ha implementado un sistema completo de gestión offline/online que separa claramente las funciones para cada modo de conexión, evitando confusión de datos y asegurando que:

- **ONLINE**: Usa SOLO endpoints + actualiza AsyncStorage
- **OFFLINE**: Usa SOLO AsyncStorage (caché)
- **NO SE MEZCLAN** datos de ambas fuentes

---

## 🏗️ Arquitectura

### Archivos Creados

1. **`services/offlineManager.js`** (NUEVO)
   - Sistema centralizado de gestión offline/online
   - Funciones separadas para cada modo
   - Detección automática de conexión
   - Sistema de sincronización

2. **`components/ConnectionIndicator.jsx`** (NUEVO)
   - Indicador visual de estado de conexión
   - Muestra "🌐 Conectado" (verde) cuando está online
   - Muestra "📵 Modo Offline" (amarillo) cuando está offline
   - Se actualiza automáticamente

### Archivos Modificados

1. **`App.js`**
   - Inicializa `initializeOfflineManager()` al arrancar
   - Detecta cambios de conexión automáticamente

2. **`components/Dashboard.jsx`**
   - Implementa lógica de detección online/offline
   - Separa completamente las fuentes de datos
   - Actualiza caché cuando está online
   - Lee caché cuando está offline

---

## 🔧 Funciones del OfflineManager

### Funciones ONLINE (solo endpoints)

```javascript
// Usar SOLO cuando hay conexión
getFormsOnline(apiFunction)
getMyFormsOnline(apiFunction)
getPendingFormsOnline(apiFunction)
getFormDesignOnline(formId, apiFunction)
getFormQuestionsOnline(formId, apiFunction)
getCorrelationsOnline(questionId, apiFunction)
getInstructivosOnline(formId, apiFunction)
getAlertMessagesOnline(formId, apiFunction)
getMathOperationsOnline(formId, questionIds, apiFunction)
saveResponseOnline(formId, responses, apiFunction)
```

**Comportamiento**:
- ✅ Valida que hay conexión antes de ejecutar
- ✅ Llama al endpoint de API
- ✅ **Actualiza AsyncStorage** con los datos frescos
- ❌ NO lee de AsyncStorage, solo escribe

### Funciones OFFLINE (solo AsyncStorage)

```javascript
// Usar SOLO cuando NO hay conexión
getFormsOffline()
getMyFormsOffline()
getPendingFormsOffline()
getFormDesignOffline(formId)
getFormQuestionsOffline(formId)
getCorrelationsOffline(questionId)
getInstructivosOffline(formId)
getAlertMessagesOffline(formId)
getMathOperationsOffline(formId)
saveResponseOffline(formId, responses)
```

**Comportamiento**:
- ✅ Lee SOLO de AsyncStorage
- ✅ Retorna datos guardados previamente
- ❌ NO hace llamadas a endpoints
- ⚠️ Si no hay datos en caché, retorna array vacío o error

### Funciones AUTOMÁTICAS (detectan conexión)

```javascript
// Detectan automáticamente online/offline
getForms(apiFunction)
getMyForms(apiFunction)
getPendingForms(apiFunction)
getFormDesign(formId, apiFunction)
getFormQuestions(formId, apiFunction)
saveResponse(formId, responses, apiFunction)
```

**Comportamiento**:
- ✅ Detecta estado de conexión con `isOnline()`
- ✅ Si online: usa función `*Online`
- ✅ Si offline: usa función `*Offline`
- ✅ Si falla online, intenta con offline como fallback

---

## 🔄 Flujo de Datos

### Modo ONLINE

```
Usuario accede → Detecta ONLINE → Llama API endpoint
                                      ↓
                                 Obtiene datos
                                      ↓
                        ┌─────────────┴─────────────┐
                        ↓                           ↓
              Actualiza AsyncStorage          Muestra en UI
              (para uso offline)
```

### Modo OFFLINE

```
Usuario accede → Detecta OFFLINE → Lee AsyncStorage
                                         ↓
                              ¿Hay datos en caché?
                                    ↙        ↘
                                  SÍ          NO
                                   ↓          ↓
                            Muestra datos   Muestra vacío
```

### Sincronización (Offline → Online)

```
Usuario guarda offline → Datos en "pending_sync_responses"
                              ↓
                     Detecta conexión restaurada
                              ↓
                     syncPendingResponses()
                              ↓
                     Envía datos al servidor
                              ↓
                     Marca como sincronizado
```

---

## 📊 Keys de AsyncStorage

### Datos de Formularios

| Key | Contenido | Actualización |
|-----|-----------|---------------|
| `offline_forms` | Lista de formularios disponibles | ONLINE |
| `my_forms_offline` | Mis formularios | ONLINE |
| `pending_forms_offline` | Formularios pendientes | ONLINE |
| `completed_forms_offline` | Formularios completados | ONLINE |
| `assigned_forms_offline` | Formularios asignados | ONLINE |
| `approval_forms_offline` | Formularios por aprobar | ONLINE |

### Datos de Formulario Específico

| Key | Contenido | Actualización |
|-----|-----------|---------------|
| `form_design_{formId}` | Diseño del formulario | ONLINE |
| `form_questions_{formId}` | Preguntas del formulario | ONLINE |
| `correlations_{questionId}` | Correlaciones de pregunta | ONLINE |
| `instructivos_{formId}` | Archivos de ayuda | ONLINE |
| `alert_messages_{formId}` | Mensajes de alerta | ONLINE |
| `math_operations_{formId}` | Operaciones matemáticas | ONLINE |

### Datos de Usuario

| Key | Contenido | Actualización |
|-----|-----------|---------------|
| `user_info_offline` | Info del usuario logueado | ONLINE |
| `authToken` | Token de autenticación | Login |
| `backend_url` | URL del backend | Configuración |

### Datos de Sincronización

| Key | Contenido | Actualización |
|-----|-----------|---------------|
| `pending_sync_responses` | Respuestas pendientes de sincronizar | OFFLINE |
| `offline_responses` | Respuestas guardadas localmente | OFFLINE |

---

## 🎯 Ejemplo de Uso en Componente

### Dashboard.jsx

```javascript
import { isOnline } from "../services/offlineManager";

const Dashboard = () => {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      // Detectar modo
      const online = await isOnline();
      setIsOffline(!online);

      if (online) {
        // ============================================
        // MODO ONLINE: Solo endpoints
        // ============================================
        console.log("🌐 [ONLINE] Obteniendo desde API...");

        const data = await getAssignedFormsSummary();
        
        // Actualizar caché
        await AsyncStorage.setItem(
          "assigned_forms_offline",
          JSON.stringify(data)
        );
        
        setForms(data);
      } else {
        // ============================================
        // MODO OFFLINE: Solo AsyncStorage
        // ============================================
        console.log("📵 [OFFLINE] Obteniendo desde caché...");

        const stored = await AsyncStorage.getItem("assigned_forms_offline");
        const data = stored ? JSON.parse(stored) : [];
        
        setForms(data);
      }
    };

    loadData();
  }, []);

  return (
    <View>
      {/* Indicador de conexión */}
      <ConnectionIndicator />
      
      {/* Contenido */}
    </View>
  );
};
```

---

## 🚀 Inicialización

### En App.js

```javascript
import { initializeOfflineManager } from "./services/offlineManager";

useEffect(() => {
  const initializeApp = async () => {
    // Inicializar gestor offline/online
    initializeOfflineManager();
  };

  initializeApp();
}, []);
```

**¿Qué hace `initializeOfflineManager()`?**

1. ✅ Configura listener de NetInfo
2. ✅ Detecta cambios de online/offline automáticamente
3. ✅ Cuando vuelve online, sincroniza datos pendientes
4. ✅ Registra eventos en console para debugging

---

## 🔄 Sistema de Sincronización

### Guardar Offline para Sincronizar Después

```javascript
// Usuario guarda formulario sin conexión
const result = await saveResponseOffline(formId, responses);

// Resultado:
{
  success: true,
  offline: true,
  pendingSync: true
}
```

### Sincronizar Cuando Vuelve Online

```javascript
// Se ejecuta automáticamente cuando detecta conexión
// También se puede llamar manualmente:

const result = await syncPendingResponses(saveResponseAPI);

// Resultado:
{
  synced: 5,      // Respuestas sincronizadas exitosamente
  failed: 0,      // Respuestas que fallaron
  error: null     // Error si hubo
}
```

### Ver Estado de Sincronización

```javascript
const status = await getSyncStatus();

// Resultado:
{
  total: 10,      // Total de respuestas guardadas
  pending: 5,     // Pendientes de sincronizar
  synced: 5       // Ya sincronizadas
}
```

---

## 🎨 Indicador Visual de Conexión

### ConnectionIndicator Component

**Estados**:

1. **Online (Verde)**
   - Muestra: "🌐 Conectado"
   - Color: Verde (#10B981)
   - Duración: 3 segundos (se auto-oculta)

2. **Offline (Amarillo)**
   - Muestra: "📵 Modo Offline - Los datos se guardarán localmente"
   - Color: Amarillo (#F59E0B)
   - Duración: Permanente (hasta que vuelva online)

**Ubicación**: 
- Posición absoluta en la parte superior
- No bloquea la interfaz
- Se actualiza automáticamente

---

## 📝 Logs de Debugging

### Formato de Logs

```
🌐 [ONLINE] - Operación en modo online
📵 [OFFLINE] - Operación en modo offline
✅ - Operación exitosa
❌ - Error en operación
💾 - Guardado en caché
🔄 - Sincronización
📤 - Subiendo datos
📥 - Descargando datos
```

### Ejemplo de Logs

```javascript
// Online
🌐 [ONLINE] Obteniendo formularios desde API...
💾 [ONLINE] Formularios guardados en caché
✅ [ONLINE] 15 formularios asignados + caché actualizado

// Offline
📵 [OFFLINE] Obteniendo formularios desde caché...
✅ [OFFLINE] 15 formularios asignados desde caché

// Sincronización
🔄 Iniciando sincronización de respuestas pendientes...
📤 Respuesta form-123 sincronizada
✅ Sincronización completada: 3 exitosas, 0 fallidas
```

---

## ✅ Reglas de Implementación

### ✅ HACER

1. ✅ **Online**: Llamar SIEMPRE a endpoints
2. ✅ **Online**: Actualizar AsyncStorage con datos frescos
3. ✅ **Offline**: Leer SIEMPRE de AsyncStorage
4. ✅ **Offline**: Guardar respuestas como pendientes
5. ✅ Usar funciones separadas para cada modo
6. ✅ Validar estado de conexión antes de operar
7. ✅ Mostrar indicador visual al usuario
8. ✅ Registrar logs claros para debugging

### ❌ NO HACER

1. ❌ **NO** mezclar datos de API y AsyncStorage
2. ❌ **NO** leer AsyncStorage cuando estás online
3. ❌ **NO** llamar endpoints cuando estás offline
4. ❌ **NO** usar datos del caché cuando hay conexión
5. ❌ **NO** actualizar UI sin verificar el modo
6. ❌ **NO** asumir que siempre hay datos en caché
7. ❌ **NO** sincronizar sin verificar conexión

---

## 🧪 Testing

### Probar Modo Online

1. ✅ Verificar que hay conexión WiFi/Datos
2. ✅ Abrir Dashboard
3. ✅ Ver logs: `🌐 [ONLINE] Obteniendo desde API...`
4. ✅ Verificar que se actualiza caché
5. ✅ Ver indicador verde "🌐 Conectado"

### Probar Modo Offline

1. ✅ Activar modo avión
2. ✅ Abrir Dashboard
3. ✅ Ver logs: `📵 [OFFLINE] Obteniendo desde caché...`
4. ✅ Ver datos previamente guardados
5. ✅ Ver indicador amarillo "📵 Modo Offline"

### Probar Sincronización

1. ✅ Activar modo avión
2. ✅ Rellenar y guardar formulario
3. ✅ Verificar: "Guardado localmente para sincronización"
4. ✅ Desactivar modo avión
5. ✅ Ver logs de sincronización automática
6. ✅ Verificar en servidor que llegaron los datos

---

## 🔮 Próximos Pasos

### Componentes a Actualizar (misma lógica)

1. **Forms.jsx** - Lista de formularios
2. **MyForms.jsx** - Mis formularios
3. **PendingForms.jsx** - Formularios pendientes
4. **FormatScreen.tsx** - Diseño del formulario
5. **FormDataAdapter.ts** - Adaptación de datos

### Patrón a Seguir

```javascript
const online = await isOnline();

if (online) {
  // ONLINE: API + actualizar caché
  const data = await apiFunction();
  await AsyncStorage.setItem(key, JSON.stringify(data));
  return data;
} else {
  // OFFLINE: Solo caché
  const stored = await AsyncStorage.getItem(key);
  return stored ? JSON.parse(stored) : [];
}
```

---

## 📚 Referencias

- **NetInfo**: https://github.com/react-native-netinfo/react-native-netinfo
- **AsyncStorage**: https://react-native-async-storage.github.io/async-storage/
- **Offline First**: https://offlinefirst.org/

---

## 🎯 Estado Actual

✅ **Implementado**:
- Sistema de detección online/offline
- Funciones separadas para cada modo
- Actualización automática de caché
- Indicador visual de conexión
- Sistema de sincronización
- Dashboard actualizado con lógica offline/online
- Logs de debugging claros

⚠️ **Pendiente**:
- Actualizar Forms.jsx
- Actualizar MyForms.jsx
- Actualizar PendingForms.jsx
- Actualizar FormatScreen.tsx
- Actualizar FormDataAdapter.ts

---

**¡El sistema está listo para funcionar completamente offline con los datos guardados en AsyncStorage hasta que vuelva online!** 🎉
