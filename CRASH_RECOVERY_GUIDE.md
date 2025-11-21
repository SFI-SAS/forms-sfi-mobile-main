# 🔥 Guía de Recuperación de Errores y Crashes

## 📋 Sistema de Logs Mejorado

El sistema de logs ha sido actualizado para **GARANTIZAR** que los errores se guarden incluso cuando la app crashea abruptamente.

## 🛡️ Mecanismos de Protección

### 1. **Triple Guardado**
Cada error fatal se guarda en **3 lugares** simultáneamente:

1. **Archivo de logs** (`app_error_logs.txt` en FileSystem)
2. **AsyncStorage** (backup inmediato: `LAST_FATAL_ERROR` y `LAST_REACT_ERROR`)
3. **Console nativa** (visible en logcat de Android o Console de iOS)

### 2. **Escritura No-Bloqueante**
- Los logs se escriben **sin await** para evitar que se pierdan
- El sistema operativo completa la escritura incluso si la app crashea
- No se espera confirmación para continuar

### 3. **Recuperación Automática**
Al iniciar la app después de un crash:
- Se recuperan errores guardados en AsyncStorage
- Se agregan al archivo de logs con marca `[RECOVERED FROM CRASH]`
- Se limpian automáticamente los backups

## 📱 Cómo Ver los Logs

### Opción 1: Desde la App (Recomendado)
1. Abre la app
2. Ve a **Settings** (Configuración)
3. Busca la sección **"Logs de Errores 📋🔍"**
4. Toca el botón para abrir el visor de logs
5. Puedes:
   - Ver todos los logs
   - Exportar/Compartir los logs
   - Limpiar los logs

### Opción 2: Logs Nativos del Dispositivo

#### Android (Logcat)
```bash
# En terminal/PowerShell
adb logcat | findstr "FATAL ERROR"
```

Busca líneas como:
```
🔥🔥🔥 FATAL ERROR 🔥🔥🔥
Timestamp: 2025-11-20T...
Error: ...
Stack: ...
🔥🔥🔥 END FATAL ERROR 🔥🔥🔥
```

#### iOS (Device Console)
1. Conecta el iPhone a tu Mac
2. Abre **Console.app**
3. Selecciona tu dispositivo
4. Busca "FATAL ERROR"

### Opción 3: Archivo Directo
El archivo se guarda en:
```
FileSystem.documentDirectory + "app_error_logs.txt"
```

En Android: `/data/data/[package-name]/files/app_error_logs.txt`

## 🔍 Entender los Logs

### Formato de Log
```json
{
  "timestamp": "2025-11-20T15:30:45.123Z",
  "sessionId": "session_1234567890_abc123",
  "level": "FATAL",
  "message": "FATAL - TypeError: Cannot read property 'x' of undefined",
  "stack": "Error stack trace...",
  "isFatal": true,
  "errorType": "Global JS Error"
}
---
```

### Niveles de Log
- **INFO**: Información general
- **WARN**: Advertencias
- **ERROR**: Errores recuperables
- **FATAL**: Errores que causan crash

### Tipos de Error
- **Global JS Error**: Errores JavaScript no capturados
- **React Component Error**: Errores en componentes de React
- **Promise Rejection**: Promesas rechazadas no manejadas

## 🚨 Qué Hacer Cuando la App Crashea

### Paso 1: Reinicia la App
Los errores se recuperan automáticamente al iniciar.

### Paso 2: Ve a Settings → Logs
Abre el visor de logs dentro de la app.

### Paso 3: Busca `[RECOVERED FROM CRASH]`
Estos son los errores que causaron el último crash.

### Paso 4: Exporta los Logs
Toca **"Exportar/Compartir"** para enviar los logs por email, WhatsApp, etc.

### Paso 5: Comparte los Logs
Envía el archivo de logs al desarrollador para análisis.

## 🛠️ Para Desarrolladores

### Ver Logs en Desarrollo

**React Native CLI:**
```bash
# Android
npx react-native log-android

# iOS
npx react-native log-ios
```

**Expo:**
```bash
npx expo start
# Los logs aparecen en la terminal automáticamente
```

### Agregar Logs Personalizados

```javascript
import { logInfo, logWarn, logError, logFatal } from './utils/errorLogger';

// Log informativo
logInfo('Usuario inició sesión', { userId: 123 });

// Advertencia
logWarn('API lenta', { responseTime: 5000 });

// Error recuperable
logError('Error al cargar datos', { endpoint: '/api/data' });

// Error fatal (causa crash)
logFatal('Error crítico', { reason: 'Out of memory' });
```

### Capturar Errores Personalizados

```javascript
import { captureError, captureFatalError } from './utils/errorLogger';

try {
  // Código que puede fallar
} catch (error) {
  // Error recuperable
  await captureError(error, { 
    context: 'Al cargar formularios',
    userId: currentUser.id 
  });
}

// Error fatal
try {
  // Código crítico
} catch (error) {
  await captureFatalError(error, {
    isFatal: true,
    errorType: 'Critical Database Error'
  });
  // La app puede crashear después de esto
}
```

## 📊 Estadísticas de Logs

El sistema mantiene estadísticas:
- Número total de logs
- Tamaño del archivo
- ID de sesión actual

Ver en Settings o programáticamente:
```javascript
import { getLogStats } from './utils/errorLogger';

const stats = await getLogStats();
console.log(stats);
// {
//   exists: true,
//   size: 12345,
//   count: 42,
//   sessionId: "session_..."
// }
```

## 🧹 Limpiar Logs

### Desde la App
Settings → Logs → Botón "Limpiar"

### Programáticamente
```javascript
import { clearLogs } from './utils/errorLogger';

await clearLogs();
```

## ⚠️ Importante

1. **Los logs persisten entre sesiones** - No se borran al cerrar la app
2. **Límite de tamaño** - El archivo mantiene los últimos 500KB (aprox. 50 logs)
3. **Los logs antiguos se rotan** - Los más viejos se eliminan automáticamente
4. **Session ID** - Cada sesión tiene un ID único para rastrear problemas
5. **Backup en AsyncStorage** - Se mantiene solo el ÚLTIMO error fatal/React

## 🔐 Privacidad

- Los logs se guardan **localmente** en el dispositivo
- **NO se envían automáticamente** a ningún servidor
- Solo se comparten cuando el usuario lo hace manualmente
- Puedes limpiar los logs en cualquier momento

## 📞 Soporte

Si la app crashea repetidamente:
1. Exporta los logs desde Settings
2. Envía los logs al equipo de desarrollo
3. Incluye pasos para reproducir el error
4. Menciona la versión de la app y dispositivo

---

**Sistema implementado:** Noviembre 2025
**Versión:** 2.0 - Con recuperación automática de crashes
