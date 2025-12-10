/**
 * Firebase Crashlytics Service
 * Maneja el registro de errores y crashes de la aplicación
 */

import crashlytics from "@react-native-firebase/crashlytics";
import { Platform } from "react-native";

class CrashlyticsService {
  constructor() {
    this.enabled = false;
    this.initialize();
  }

  /**
   * Inicializa Crashlytics
   */
  async initialize() {
    try {
      // Habilitar Crashlytics en todos los entornos (dev y prod)
      await crashlytics().setCrashlyticsCollectionEnabled(true);

      this.enabled = true;

      console.log("✅ Firebase Crashlytics habilitado");

      // Log inicial
      this.log("App iniciada", {
        platform: Platform.OS,
        version: Platform.Version,
        isDebug: __DEV__,
      });
    } catch (error) {
      console.error("❌ Error inicializando Crashlytics:", error);
      this.enabled = false;
    }
  }

  /**
   * Registra un log en Crashlytics
   * @param {string} message - Mensaje a registrar
   * @param {object} attributes - Atributos adicionales (opcional)
   */
  log(message, attributes = {}) {
    if (!this.enabled) return;

    try {
      crashlytics().log(`${message} ${JSON.stringify(attributes)}`);
    } catch (error) {
      console.error("Error logging to Crashlytics:", error);
    }
  }

  /**
   * Registra un error NO fatal en Crashlytics
   * @param {Error|string} error - Error a registrar
   * @param {string} context - Contexto donde ocurrió el error
   */
  recordError(error, context = "Unknown") {
    if (!this.enabled) {
      console.error(`[${context}]`, error);
      return;
    }

    try {
      // Si es un string, convertirlo a Error
      const errorObj = typeof error === "string" ? new Error(error) : error;

      // Agregar contexto
      crashlytics().setAttribute("error_context", context);
      crashlytics().setAttribute("timestamp", new Date().toISOString());

      // Registrar el error NO fatal
      crashlytics().recordError(errorObj);

      console.error(`[Crashlytics] Error registrado en ${context}:`, error);
    } catch (e) {
      console.error("Error recording to Crashlytics:", e);
    }
  }

  /**
   * Fuerza un crash (SOLO PARA TESTING)
   */
  forceCrash() {
    if (!this.enabled) {
      console.warn("Crashlytics no habilitado, no se puede forzar crash");
      return;
    }

    console.warn("⚠️ Forzando crash para testing...");
    crashlytics().crash();
  }

  /**
   * Establece el ID del usuario actual
   * @param {string} userId
   */
  setUserId(userId) {
    if (!this.enabled) return;

    try {
      crashlytics().setUserId(userId.toString());
      this.log("Usuario autenticado", { userId });
    } catch (error) {
      console.error("Error setting user ID:", error);
    }
  }

  /**
   * Establece atributos personalizados
   * @param {string} key
   * @param {string} value
   */
  setAttribute(key, value) {
    if (!this.enabled) return;

    try {
      crashlytics().setAttribute(key, value.toString());
    } catch (error) {
      console.error("Error setting attribute:", error);
    }
  }

  /**
   * Establece múltiples atributos
   * @param {object} attributes - Objeto con pares key-value
   */
  setAttributes(attributes) {
    if (!this.enabled) return;

    try {
      Object.entries(attributes).forEach(([key, value]) => {
        crashlytics().setAttribute(key, String(value));
      });
    } catch (error) {
      console.error("Error setting attributes:", error);
    }
  }
}

// Singleton
const crashlyticsService = new CrashlyticsService();

export default crashlyticsService;
