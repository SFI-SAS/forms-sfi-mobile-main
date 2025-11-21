# Sistema de Captura de Errores y Logs

Sistema completo de captura, registro y visualización de errores para React Native + Expo.

## 🎯 Características

- ✅ **Error Boundary**: Captura errores de componentes React
- ✅ **Global Error Handler**: Captura errores JS fatales antes del crash
- ✅ **Promise Rejection Handler**: Captura promesas rechazadas no manejadas
- ✅ **Console Error Tracking**: Registra console.error y console.warn
- ✅ **Almacenamiento Local**: Logs guardados en archivo persistente
- ✅ **Visor de Logs**: UI para ver, exportar y limpiar logs
- ✅ **Session Tracking**: Identificador único por sesión de app
- ✅ **Export/Share**: Comparte logs por email, chat, etc.

## 📁 Estructura de Archivos

```
/utils
  ├── errorLogger.js         # Sistema de logs persistente
  └── globalErrorHandler.js  # Manejador global de errores

/components
  ├── ErrorBoundary.jsx      # React Error Boundary
  └── LogViewer.jsx          # UI para visualizar logs
```

## 🚀 Cómo Usar

### 1. Sistema de Logs

```javascript
import { 
  logInfo, 
  logWarn, 
  logError, 
  logFatal,
  captureError 
} from './utils/errorLogger';

// Logs simples
logInfo('Usuario inició sesión');
logWarn('Conexión lenta detectada');
logError('Error al cargar formularios');

// Capturar error con contexto
try {
  // código que puede fallar
} catch (error) {
  captureError(error, {
    context: 'Al guardar formulario',
    userId: user.id,
    formId: form.id
  });
}
```

### 2. Ver Logs en la App

1. Ve a **Settings** (⚙️)
2. Busca la sección **"Logs de Errores 📋🔍"**
3. Presiona **"Ver Logs de Errores"**

Desde el visor puedes:
- 📋 Ver todos los logs
- 🔄 Actualizar logs
- 📤 Exportar/Compartir logs
- 🗑️ Limpiar logs

### 3. Formato de Logs

Cada log se guarda en formato JSON con la siguiente estructura:

```json
{
  "timestamp": "2025-11-20T10:30:45.123Z",
  "sessionId": "session_1700481045123_abc123",
  "level": "ERROR",
  "message": "Failed to fetch forms",
  "stack": "Error: Network request failed...",
  "errorType": "Network Error",
  "isFatal": false
}
```

## 🔧 API del Logger

### Métodos Principales

```javascript
// Inicializar (automático en App.js)
initializeLogger();

// Escribir logs
logInfo(message, extra);
logWarn(message, extra);
logError(message, extra);
logFatal(message, extra);

// Capturar errores
captureError(error, context);
captureFatalError(error, context);

// Leer y gestionar logs
const content = await readLogs();
const stats = await getLogStats();
const exportData = await exportLogs();
await clearLogs();
```

### Estadísticas de Logs

```javascript
const stats = await getLogStats();
console.log(stats);
// {
//   exists: true,
//   size: 45632,        // bytes
//   count: 127,         // número de logs
//   sessionId: "session_..."
// }
```

## 📱 Error Boundary

Envuelve automáticamente toda tu app:

```jsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

Captura errores de renderizado y los registra automáticamente.

### UI Personalizada de Error

```jsx
<ErrorBoundary
  fallback={({ error, errorInfo, resetError }) => (
    <View>
      <Text>Algo salió mal: {error.message}</Text>
      <Button onPress={resetError} title="Reintentar" />
    </View>
  )}
  onError={(error, errorInfo) => {
    // Callback personalizado
    console.log('Error capturado:', error);
  }}
>
  <App />
</ErrorBoundary>
```

## 🔍 Handlers Globales

Se instalan automáticamente al iniciar la app:

### 1. Global JS Error Handler
Captura errores fatales antes de que crashee la app:
```javascript
throw new Error('Fatal error'); // ✅ Capturado y guardado
```

### 2. Promise Rejection Handler
Captura promesas rechazadas:
```javascript
Promise.reject('Error'); // ✅ Capturado
fetch(url).catch(e => {}); // ✅ Capturado
```

### 3. Console Error Handler
Registra console.error y console.warn:
```javascript
console.error('Error crítico'); // ✅ Guardado en logs
console.warn('Advertencia'); // ✅ Guardado en logs
```

## 📤 Exportar Logs

### Opción 1: Desde la App
1. Ve a Settings → Logs de Errores
2. Presiona "📤 Exportar"
3. Comparte por WhatsApp, Email, etc.

### Opción 2: Programáticamente
```javascript
import { exportLogs } from './utils/errorLogger';

const { content, filename, uri } = await exportLogs();
// content: texto de los logs
// filename: nombre sugerido
// uri: ruta del archivo local
```

## 🛠️ Configuración

### Tamaño Máximo de Logs
Edita en `errorLogger.js`:
```javascript
const MAX_LOG_SIZE = 500000; // 500KB (ajustar según necesidad)
```

### Logs a Mantener
Cuando se alcanza el límite, se mantienen los últimos 50 logs:
```javascript
const lines = currentContent.split('\n---\n');
currentContent = lines.slice(-50).join('\n---\n');
```

### Expiración de Logs
Los logs no expiran automáticamente. Para implementar expiración:
```javascript
const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días
// Filtrar logs antiguos al leer
```

## 🐛 Debugging

### Ver Logs en Desarrollo

En modo desarrollo (`__DEV__ === true`), los errores también se muestran en:
- React Native Debugger
- Chrome DevTools
- Consola de Metro

### Simular Error para Probar

```javascript
// Agregar botón temporal en Settings
<TouchableOpacity onPress={() => {
  throw new Error('Error de prueba');
}}>
  <Text>Simular Error</Text>
</TouchableOpacity>
```

## 📊 Casos de Uso

### 1. Error de Red
```javascript
try {
  const response = await fetch(url);
} catch (error) {
  await captureError(error, {
    errorType: 'Network Error',
    url,
    method: 'GET'
  });
}
```

### 2. Error de Usuario
```javascript
if (!user.email) {
  logWarn('Usuario sin email', {
    userId: user.id,
    userName: user.name
  });
}
```

### 3. Error Fatal
```javascript
if (criticalServiceDown) {
  await logFatal('Servicio crítico caído', {
    service: 'backend',
    lastCheck: new Date()
  });
}
```

## 🔐 Consideraciones de Seguridad

- ❌ **NO** guardes contraseñas en logs
- ❌ **NO** guardes tokens de autenticación
- ❌ **NO** guardes datos sensibles del usuario
- ✅ **SÍ** sanitiza datos antes de loggear
- ✅ **SÍ** usa IDs en lugar de datos completos

### Sanitizar Datos

```javascript
const sanitize = (data) => {
  const safe = { ...data };
  delete safe.password;
  delete safe.token;
  delete safe.authToken;
  return safe;
};

logError('Error en login', sanitize(userData));
```

## 📈 Monitoreo en Producción

Para producción, considera integrar con servicios profesionales:

### Sentry (Recomendado)
```bash
npx expo install sentry-expo
```

```javascript
import * as Sentry from 'sentry-expo';

Sentry.init({
  dsn: 'YOUR_DSN',
  enableInExpoDevelopment: true,
  debug: true,
});
```

## 🆘 Troubleshooting

### Los logs no se guardan
- Verifica permisos de FileSystem
- Revisa que `initializeLogger()` se llame en App.js
- Verifica espacio disponible en dispositivo

### Error Boundary no captura errores
- Solo captura errores en el árbol de componentes hijos
- No captura errores en event handlers (usa try-catch)
- No captura errores asíncronos (usa .catch())

### Logs muy grandes
- Reduce `MAX_LOG_SIZE`
- Limpia logs periódicamente
- Implementa rotación automática

## 📚 Referencias

- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [React Native Error Handling](https://reactnative.dev/docs/error-handling)
- [Sentry for React Native](https://docs.sentry.io/platforms/react-native/)

## 🎉 Listo para Usar

El sistema está completamente configurado y funcionando. Cualquier error en la app será:
1. Capturado automáticamente
2. Guardado en logs persistentes
3. Visible en Settings → Logs de Errores
4. Exportable para debugging

¡Happy debugging! 🐛✨
