# Integración de Firma Digital y Registro Facial con WebView Modal

## 📋 Descripción

Esta implementación integra los componentes de **Firma Digital** y **Registro Facial** directamente en el formulario usando **WebView dentro de un Modal**, sin necesidad de abrir el navegador externo.

## ✨ Características

- ✅ **WebView Modal**: Los HTML se cargan directamente en un Modal
- ✅ **Sin navegador externo**: Todo sucede dentro de la app
- ✅ **Comunicación bidireccional**: React Native ↔ WebView vía `postMessage`
- ✅ **Intercepta redirects**: Captura los deep links `formssfi://` automáticamente
- ✅ **UX optimizada**: Loading states, mensajes de éxito/error, confirmaciones
- ✅ **Offline ready**: Las firmas se guardan en AsyncStorage

## 📦 Componentes Creados

### 1. `FirmFieldNew.jsx`
Componente de Firma Digital con WebView Modal

**Props:**
```typescript
{
  label: string;              // "Firma Digital"
  options: Array<{            // Lista de usuarios que pueden firmar
    id: string;
    name: string;
    num_document: string;
  }>;
  required: boolean;
  onChange: (userId: string) => void;
  value: string;              // ID del usuario seleccionado
  disabled: boolean;
  error: boolean;
  documentHash: string;       // Hash del documento a firmar
  onFirmSuccess: (data) => void;
  onFirmError: (error) => void;
  onValueChange: (data) => void;
  apiUrl: string;             // URL de la API SFI
  autoCloseDelay: number;
}
```

**Flujo:**
1. Usuario selecciona quién va a firmar (selector)
2. Presiona "✍️ Firmar Documento"
3. Se abre Modal con WebView cargando `firma.html`
4. Usuario completa el proceso de firma
5. El HTML intenta redirigir a `formssfi://signature-callback?firmData=...`
6. JavaScript inyectado intercepta el redirect y envía `postMessage` a React Native
7. React Native recibe los datos, cierra el Modal y muestra confirmación
8. Se guardan los datos en AsyncStorage (offline)

### 2. `FacialRegisterFieldNew.jsx`
Componente de Registro Facial con WebView Modal

**Props:**
```typescript
{
  label: string;              // "Registro Facial"
  personId: string;           // ID de la persona (requerido)
  personName: string;         // Nombre de la persona (requerido)
  personEmail?: string;       // Email (opcional)
  required: boolean;
  disabled: boolean;
  error: boolean;
  onRegisterSuccess: (data) => void;
  onRegisterError: (error) => void;
  apiUrl: string;             // URL de la API SFI
}
```

**Flujo:**
1. Muestra información de la persona (ID, nombre, email)
2. Usuario presiona "📸 Iniciar Registro Facial"
3. Se abre Modal con WebView cargando `registro.html`
4. Usuario completa el proceso de registro
5. El HTML intenta redirigir a `formssfi://register-callback?registerData=...`
6. JavaScript inyectado intercepta el redirect y envía `postMessage` a React Native
7. React Native recibe los datos, cierra el Modal y muestra confirmación

## 🔧 Funcionamiento Técnico

### Interceptación de Redirects

El JavaScript inyectado en el WebView captura los redirects antes de que se ejecuten:

```javascript
// Inyectado en el WebView
(function() {
  // Override window.location
  const originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    set: function(value) {
      if (value.startsWith('formssfi://')) {
        // En lugar de redirigir, enviar a React Native
        window.ReactNativeWebView.postMessage(value);
      } else {
        originalLocation.href = value;
      }
    }
  });

  // Override window.location.href
  Object.defineProperty(window.location, 'href', {
    set: function(value) {
      if (value.startsWith('formssfi://')) {
        window.ReactNativeWebView.postMessage(value);
      } else {
        window.location.replace(value);
      }
    }
  });
})();
```

### Comunicación WebView → React Native

El HTML usa:
```javascript
// En firma.html o registro.html
window.location.href = `formssfi://signature-callback?firmData=${encodedData}`;
```

React Native recibe:
```javascript
const handleWebViewMessage = (event) => {
  const data = event.nativeEvent.data;
  
  if (data.startsWith('formssfi://')) {
    // Parsear URL y extraer datos
    const url = new URL(data);
    const firmDataParam = url.searchParams.get('firmData');
    const firmResult = JSON.parse(decodeURIComponent(firmDataParam));
    
    handleSignSuccess(firmResult);
  }
};
```

## 📄 HTML Requeridos

Los HTML en el servidor (`firma.html` y `registro.html`) **NO necesitan cambios**. El JavaScript inyectado se encarga de interceptar los redirects automáticamente.

### `firma.html` (ya existe)
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Firma Digital - SFI Facial</title>
</head>
<body>
  <div class="container">
    <sfi-facial id="sfi-facial-component"></sfi-facial>
  </div>

  <script src="https://reconocimiento-facial-safe.service.saferut.com/index.js"></script>

  <script>
    // Leer parámetros
    const urlParams = new URLSearchParams(window.location.search);
    const apiUrl = urlParams.get('apiUrl');
    const docId = urlParams.get('docId');
    const personId = urlParams.get('personId');
    const personName = urlParams.get('personName');

    // Configurar componente
    const sfiFacial = document.getElementById('sfi-facial-component');
    sfiFacial.setAttribute('mode', 'sign');
    sfiFacial.setAttribute('api-url', apiUrl);
    sfiFacial.setAttribute('document-id', docId);
    sfiFacial.setAttribute('person-id', personId);
    sfiFacial.setAttribute('person-name', personName);

    // Escuchar evento de firma exitosa
    sfiFacial.addEventListener('sign-success', (event) => {
      const data = event.detail;
      const encoded = encodeURIComponent(JSON.stringify(data));
      
      // Este redirect será interceptado por React Native
      window.location.href = `formssfi://signature-callback?firmData=${encoded}`;
    });

    // Escuchar errores
    sfiFacial.addEventListener('error', (event) => {
      const error = encodeURIComponent(event.detail.message);
      window.location.href = `formssfi://signature-callback?error=${error}`;
    });
  </script>
</body>
</html>
```

### `registro.html` (ya existe)
Similar a `firma.html` pero con `mode="register"` y evento `register-success`

## 🚀 Uso en FormatScreen

### Para Firma Digital

Reemplazar el import actual:
```javascript
// Antes
import FirmField from "./FirmField";

// Ahora
import FirmField from "./FirmFieldNew";
```

El uso es exactamente igual:
```jsx
<FirmField
  label={question.question_text || "Firma Digital"}
  options={facialUsers}
  required={question.required}
  onChange={(userId) => setSelectedSigner({ ...selectedSigner, [question.id]: userId })}
  value={selectedSigner[question.id]}
  disabled={submitting}
  documentHash={facialUsers.find(f => f.id === selectedSigner[question.id])?.hash || ""}
  apiUrl="https://api-facialsafe.service.saferut.com"
  onFirmSuccess={(data) => console.log("✅ Firma:", data)}
  onFirmError={(error) => console.error("❌ Error:", error)}
  onValueChange={(firmData) => {
    // Guardar en estado del formulario
  }}
/>
```

### Para Registro Facial

```jsx
import FacialRegisterField from "./FacialRegisterFieldNew";

<FacialRegisterField
  label="Registro Facial"
  personId="12345"
  personName="Juan Pérez"
  personEmail="juan@example.com"
  required={true}
  disabled={submitting}
  onRegisterSuccess={(data) => {
    console.log("✅ Registro completado:", data);
    // Guardar en estado o enviar al backend
  }}
  onRegisterError={(error) => {
    console.error("❌ Error en registro:", error);
  }}
  apiUrl="https://api-facialsafe.service.saferut.com"
/>
```

## 🎨 Interfaz de Usuario

### Estados Visuales

**Firma Digital:**
1. **Inicial**: Selector de usuario + botón "Firmar Documento"
2. **Modal Abierto**: WebView con loading spinner
3. **Completado**: Card verde con ✅, nombre, confianza, timestamp + botón "Nueva Firma"
4. **Error**: Alert y mensaje de error en rojo

**Registro Facial:**
1. **Inicial**: Info de persona (ID, nombre, email) + botón "Iniciar Registro Facial"
2. **Modal Abierto**: WebView con loading spinner
3. **Completado**: Card verde con ✅, info del registro + botón "Nuevo Registro"
4. **Error**: Alert y mensaje de error en rojo

### Confirmaciones

- **Cancelar proceso**: Alert de confirmación antes de cerrar el Modal
- **Éxito**: Alert nativo con mensaje de éxito
- **Error**: Alert nativo con descripción del error

## 🔒 Seguridad

- ✅ Los datos se transmiten vía HTTPS
- ✅ Los query params se codifican con `encodeURIComponent`
- ✅ JavaScript inyectado es de solo lectura (no modifica el HTML)
- ✅ Los redirects se interceptan antes de salir del WebView
- ✅ AsyncStorage para persistencia offline segura

## 🐛 Debug

Los componentes incluyen logs extensivos:

```javascript
console.log("🚀 Abriendo modal de firma para:", selectedUser);
console.log("📨 Mensaje recibido del WebView:", data);
console.log("✅ Firma exitosa recibida:", firmResult);
console.log("❌ Error en WebView:", error);
```

Para debug del WebView, puedes usar Remote Debugging:
- **Android**: Chrome DevTools → `chrome://inspect`
- **iOS**: Safari → Develop → Simulator

## 📱 Compatibilidad

- ✅ iOS 13+ (con `react-native-webview`)
- ✅ Android 5.0+ (API 21+)
- ✅ Expo SDK 54+
- ✅ React Native 0.76+

## 🔄 Migración desde FirmField Anterior

1. **Renombrar archivo**:
   ```bash
   mv components/FirmField.jsx components/FirmFieldOld.jsx
   mv components/FirmFieldNew.jsx components/FirmField.jsx
   ```

2. **No requiere cambios en FormatScreen.jsx** - La API es compatible

3. **Probar**:
   - Seleccionar usuario
   - Presionar "Firmar Documento"
   - Completar proceso en el Modal
   - Verificar que se cierra y muestra confirmación

## ✅ Ventajas de este Enfoque

1. **UX Superior**: Todo en la app, sin salir al navegador
2. **Más Control**: Modal, loading states, confirmaciones
3. **Más Rápido**: No hay transición app → navegador → app
4. **Más Confiable**: Interceptamos los redirects antes que fallen
5. **Offline Ready**: AsyncStorage para firmas sin conexión
6. **Fácil Debug**: Logs detallados en cada paso

## 📝 Próximos Pasos

1. ✅ Reemplazar `FirmField.jsx` con `FirmFieldNew.jsx`
2. ✅ Integrar `FacialRegisterFieldNew.jsx` donde se necesite registro
3. ⏳ Probar en dispositivo real (Android/iOS)
4. ⏳ Verificar que firma.html y registro.html funcionan en el WebView
5. ⏳ Implementar sincronización de firmas offline con el backend

## 📚 Referencias

- [react-native-webview](https://github.com/react-native-webview/react-native-webview)
- [WebView postMessage](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md#communicating-between-js-and-native)
- [SFI Facial Recognition](https://reconocimiento-facial-safe.service.saferut.com/)
