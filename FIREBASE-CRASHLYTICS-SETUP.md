# 🔥 Firebase Crashlytics - Configuración Completa

## ✅ Lo que YA está configurado

### 1. Dependencias instaladas
- `@react-native-firebase/app` v21.8.2
- `@react-native-firebase/crashlytics` v21.8.2

### 2. Archivos Gradle configurados

#### `android/build.gradle` (root)
```gradle
buildscript {
  dependencies {
    classpath 'com.google.firebase:firebase-crashlytics-gradle:3.0.6'
    classpath 'com.google.gms:google-services:4.4.1'
  }
}
```

#### `android/app/build.gradle`
```gradle
apply plugin: "com.google.gms.google-services"
apply plugin: "com.google.firebase.crashlytics"

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.6.0"))
    implementation("com.google.firebase:firebase-crashlytics")
    implementation("com.google.firebase:firebase-analytics")
}
```

### 3. Código integrado
- ✅ `services/crashlytics.js` - Servicio de Crashlytics
- ✅ `App.js` - Inicialización al arrancar la app
- ✅ `ErrorBoundary.jsx` - Captura errores de React
- ✅ `globalErrorHandler.js` - Captura errores JS fatales y promesas
- ✅ `Settings.jsx` - Botones de prueba

### 4. Archivo `google-services.json`
- ⚠️ **PLACEHOLDER** en `android/app/google-services.json`
- ⚠️ Necesitas reemplazarlo con el archivo REAL de Firebase

---

## 📋 PASOS QUE DEBES COMPLETAR

### 1️⃣ Descargar el `google-services.json` REAL

1. Ve a **Firebase Console**: https://console.firebase.google.com/
2. Selecciona tu proyecto (o crea uno nuevo)
3. Haz clic en ⚙️ **Project Settings**
4. En **"Your apps"**, busca tu app Android o agrégala:
   - Package name: `com.mauro_morales.formssfi`
   - Descarga el archivo `google-services.json`
5. **Reemplaza** el archivo en:
   ```
   android/app/google-services.json
   ```

### 2️⃣ Habilitar Crashlytics en Firebase

1. En Firebase Console, ve a **Crashlytics** (menú izquierdo)
2. Haz clic en **"Enable Crashlytics"**
3. Acepta los términos

### 3️⃣ (OPCIONAL) Habilitar Google Analytics

Firebase recomienda habilitar Analytics para tener mejor contexto de los crashes:

1. En Firebase Console → **Project Settings**
2. Pestaña **Integrations**
3. Habilita **Google Analytics**

### 4️⃣ Conectar dispositivo Android y compilar

```powershell
# Opción A: Conectar dispositivo físico
# - Habilita "Depuración USB" en el dispositivo
# - Conecta por USB
# - Verifica con: adb devices

# Opción B: Iniciar emulador Android
# - Abre Android Studio
# - AVD Manager → Start emulator

# Compilar y ejecutar
npx expo run:android
```

### 5️⃣ Probar Crashlytics

Una vez que la app esté instalada:

1. Abre la app
2. Ve a **Settings** (⚙️)
3. Baja hasta **"Firebase Crashlytics 🔥"**
4. Prueba primero: **"Test Error NO Fatal"**
   - Registra un error sin cerrar la app
   - Aparecerá en Firebase como "Non-fatal"
5. Prueba luego: **"⚠️ Forzar Crash Fatal"**
   - Cierra la app inmediatamente
   - Aparecerá en Firebase como "Fatal crash"
6. Reinicia la app (el reporte se envía al reiniciar)
7. Espera **3-5 minutos**
8. Ve a **Firebase Console → Crashlytics** para ver los reportes

---

## 🎯 Cómo usar Crashlytics en producción

### Registrar errores NO fatales

```javascript
import crashlyticsService from './services/crashlytics';

try {
  // Código que puede fallar
  await algoQuePodriaFallar();
} catch (error) {
  // Registrar el error sin cerrar la app
  crashlyticsService.recordError(error, 'NombreDelContexto');
}
```

### Agregar contexto a los crashes

```javascript
// Cuando el usuario se autentique
crashlyticsService.setUserId(userId);

// Agregar atributos personalizados
crashlyticsService.setAttribute('screen', 'FormatScreen');
crashlyticsService.setAttribute('formId', '12345');

// Agregar múltiples atributos
crashlyticsService.setAttributes({
  version: '1.0.1',
  environment: 'production',
  lastAction: 'submitForm'
});
```

### Logs para contexto

```javascript
crashlyticsService.log('Usuario comenzó a llenar formulario', {
  formId: '123',
  timestamp: new Date().toISOString()
});
```

---

## 🔍 Qué verás en Firebase Crashlytics

Cuando ocurra un crash o error, verás:

- **Stack trace completo** - Línea exacta del error
- **Contexto del error** - Componente, operación, etc.
- **Información del dispositivo** - Modelo, OS, RAM, etc.
- **Atributos personalizados** - Los que agregaste con `setAttribute`
- **Logs previos** - Los que agregaste con `log()`
- **Sesiones afectadas** - Cuántos usuarios experimentaron el error
- **Tendencias** - Si el error está aumentando o disminuyendo

---

## 🚨 IMPORTANTE

### Crashes se reportan automáticamente si ocurren en:
- ✅ Errores de React (capturados por ErrorBoundary)
- ✅ Errores JS fatales (capturados por globalErrorHandler)
- ✅ Promesas rechazadas no manejadas
- ✅ Crashes nativos (Java/Kotlin en Android)

### Los reportes se envían:
- 🔄 Automáticamente cuando la app se cierra por error
- 🔄 Al reiniciar la app después de un crash
- 🔄 En segundo plano cuando hay conexión a internet

### Tiempo de visualización:
- ⏱️ **3-5 minutos** para que aparezcan en Firebase Console
- ⏱️ En algunos casos puede tomar hasta 15 minutos

---

## ✅ Checklist final

- [ ] Archivo `google-services.json` REAL en `android/app/`
- [ ] Crashlytics habilitado en Firebase Console
- [ ] Analytics habilitado (opcional pero recomendado)
- [ ] Dispositivo Android conectado O emulador iniciado
- [ ] App compilada con `npx expo run:android`
- [ ] Prueba de crash NO fatal realizada
- [ ] Prueba de crash fatal realizada
- [ ] Reportes visibles en Firebase Console (esperar 3-5 min)

---

## 🐛 Troubleshooting

### "No se ven los crashes en Firebase"
- Espera al menos 5 minutos
- Verifica que el `google-services.json` sea el correcto
- Confirma que Crashlytics esté habilitado en Firebase Console
- Reinicia la app después del crash (los reportes se envían al reiniciar)

### "Error al compilar con Gradle"
- Verifica que tengas Gradle 8.0+
- Limpia el build: `cd android && ./gradlew clean && cd ..`
- Vuelve a compilar: `npx expo run:android`

### "Crashlytics no se inicializa"
- Revisa los logs de la app al arrancar
- Deberías ver: `✅ Firebase Crashlytics habilitado`
- Si no aparece, verifica que el archivo `google-services.json` esté en `android/app/`

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs de la app en tiempo real
2. Busca mensajes de Firebase/Crashlytics al iniciar
3. Verifica que el package name coincida: `com.mauro_morales.formssfi`
4. Consulta la documentación oficial: https://rnfirebase.io/crashlytics/usage
