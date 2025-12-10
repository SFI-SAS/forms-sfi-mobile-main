/**
 * Servicio de Permisos
 * Solicita permisos de forma segura sin requerir módulos nativos al inicio
 */

import * as MediaLibrary from "expo-media-library";
import * as Location from "expo-location";
import { Platform, Alert } from "react-native";

/**
 * Verificar y solicitar permiso de cámara usando ImagePicker (carga diferida)
 */
export const requestCameraPermission = async () => {
  try {
    console.log("📸 Solicitando permiso de cámara...");

    // Importación diferida para evitar crash si el módulo nativo no está disponible
    const ImagePicker = await import("expo-image-picker");
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status === "granted") {
      console.log("✅ Permiso de cámara concedido");
      return true;
    } else {
      console.log("❌ Permiso de cámara denegado");
      return false;
    }
  } catch (error) {
    console.warn("⚠️ Permiso de cámara no disponible:", error.message);
    // Retornar true para no bloquear la app si el módulo no está compilado
    return true;
  }
};

/**
 * Verificar y solicitar permiso de galería/almacenamiento
 */
export const requestMediaLibraryPermission = async () => {
  try {
    console.log("🖼️ Solicitando permiso de galería...");
    const { status } = await MediaLibrary.requestPermissionsAsync();

    if (status === "granted") {
      console.log("✅ Permiso de galería concedido");
      return true;
    } else {
      console.log("❌ Permiso de galería denegado");
      return false;
    }
  } catch (error) {
    console.error("❌ Error solicitando permiso de galería:", error);
    return false;
  }
};

/**
 * Verificar y solicitar permiso de ubicación
 */
export const requestLocationPermission = async () => {
  try {
    console.log("📍 Solicitando permiso de ubicación...");
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status === "granted") {
      console.log("✅ Permiso de ubicación concedido");
      return true;
    } else {
      console.log("❌ Permiso de ubicación denegado");
      return false;
    }
  } catch (error) {
    console.error("❌ Error solicitando permiso de ubicación:", error);
    return false;
  }
};

/**
 * Solicitar todos los permisos necesarios
 */
export const requestAllPermissions = async (showAlerts = true) => {
  console.log("🔐 Solicitando todos los permisos necesarios...");

  const results = {
    camera: false,
    mediaLibrary: false,
    location: false,
  };

  try {
    // Solicitar permisos en paralelo para mejor UX
    const [cameraResult, mediaResult, locationResult] = await Promise.all([
      requestCameraPermission(),
      requestMediaLibraryPermission(),
      requestLocationPermission(),
    ]);

    results.camera = cameraResult;
    results.mediaLibrary = mediaResult;
    results.location = locationResult;

    // Verificar si todos fueron concedidos
    const allGranted = Object.values(results).every((granted) => granted);

    if (allGranted) {
      console.log("✅ Todos los permisos concedidos");
      if (showAlerts) {
        Alert.alert(
          "Permisos Concedidos",
          "Todos los permisos necesarios han sido concedidos. La aplicación funcionará correctamente.",
          [{ text: "OK" }]
        );
      }
    } else {
      console.log("⚠️ Algunos permisos fueron denegados:", results);

      if (showAlerts) {
        const deniedPermissions = [];
        if (!results.camera) deniedPermissions.push("Cámara");
        if (!results.mediaLibrary) deniedPermissions.push("Galería");
        if (!results.location) deniedPermissions.push("Ubicación");

        Alert.alert(
          "Permisos Requeridos",
          `Los siguientes permisos son necesarios para el correcto funcionamiento:\n\n${deniedPermissions.join(", ")}\n\nPuedes activarlos más tarde desde la configuración del sistema.`,
          [
            { text: "Continuar de todos modos", style: "cancel" },
            {
              text: "Configuración",
              onPress: () => {
                if (Platform.OS === "ios") {
                  // En iOS, no hay forma directa de abrir ajustes de la app
                  Alert.alert(
                    "Configuración",
                    "Ve a Ajustes > Safemetrics para activar los permisos"
                  );
                }
              },
            },
          ]
        );
      }
    }

    return results;
  } catch (error) {
    console.error("❌ Error solicitando permisos:", error);
    return results;
  }
};

/**
 * Verificar estado de todos los permisos sin solicitar
 */
export const checkAllPermissions = async () => {
  try {
    // Importación diferida de ImagePicker
    const ImagePicker = await import("expo-image-picker");

    const [cameraStatus, mediaStatus, locationStatus] = await Promise.all([
      ImagePicker.getCameraPermissionsAsync().catch(() => ({
        status: "undetermined",
      })),
      MediaLibrary.getPermissionsAsync(),
      Location.getForegroundPermissionsAsync(),
    ]);

    return {
      camera: cameraStatus.status === "granted",
      mediaLibrary: mediaStatus.status === "granted",
      location: locationStatus.status === "granted",
    };
  } catch (error) {
    console.warn("⚠️ Error verificando permisos:", error.message);
    return {
      camera: false,
      mediaLibrary: false,
      location: false,
    };
  }
};

/**
 * Verificar si todos los permisos críticos están concedidos
 */
export const hasAllCriticalPermissions = async () => {
  const permissions = await checkAllPermissions();
  // Cámara es crítica para reconocimiento facial
  return permissions.camera;
};

export default {
  requestAllPermissions,
  requestCameraPermission,
  requestMediaLibraryPermission,
  requestLocationPermission,
  checkAllPermissions,
  hasAllCriticalPermissions,
};
