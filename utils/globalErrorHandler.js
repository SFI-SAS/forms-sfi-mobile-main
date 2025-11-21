/**
 * Global Error Handler
 * Captura errores JS fatales antes de que crashee la app
 */

import { captureFatalError, logError, logWarn } from "./errorLogger";

let isHandlerInstalled = false;
let originalHandler = null;

/**
 * Instalar el manejador global de errores
 */
export const installGlobalErrorHandler = () => {
  if (isHandlerInstalled) {
    console.warn("⚠️ Global error handler ya está instalado");
    return;
  }

  // Guardar el handler original
  if (global.ErrorUtils) {
    originalHandler = global.ErrorUtils.getGlobalHandler();
  }

  // Instalar nuestro handler personalizado
  if (global.ErrorUtils) {
    global.ErrorUtils.setGlobalHandler(async (error, isFatal) => {
      console.error("🔥 GLOBAL ERROR CAPTURADO:", error);
      console.error("💀 Es Fatal:", isFatal);

      // Guardar INMEDIATAMENTE - no usar await
      captureFatalError(error, {
        isFatal,
        errorType: "Global JS Error",
        timestamp: new Date().toISOString(),
      }).catch((logError) => {
        console.error("❌ Error guardando log del error global:", logError);
      });

      // Si hay un handler original, llamarlo también
      if (originalHandler && typeof originalHandler === "function") {
        originalHandler(error, isFatal);
      }
    });

    isHandlerInstalled = true;
    console.log("✅ Global error handler instalado correctamente");
  } else {
    console.warn("⚠️ ErrorUtils no está disponible en este entorno");
  }
};

/**
 * Desinstalar el manejador global de errores
 */
export const uninstallGlobalErrorHandler = () => {
  if (!isHandlerInstalled) {
    console.warn("⚠️ Global error handler no está instalado");
    return;
  }

  if (global.ErrorUtils && originalHandler) {
    global.ErrorUtils.setGlobalHandler(originalHandler);
    isHandlerInstalled = false;
    console.log("✅ Global error handler desinstalado");
  }
};

/**
 * Capturar Promise rejections no manejadas
 */
export const installPromiseRejectionHandler = () => {
  // React Native no tiene window.addEventListener, pero podemos capturar
  // promesas no manejadas usando tracking manual

  const originalPromise = global.Promise;

  // Wrapper para Promise.catch
  const originalCatch = originalPromise.prototype.catch;
  originalPromise.prototype.catch = function (onRejected) {
    return originalCatch.call(this, async (error) => {
      try {
        // Log unhandled promise rejection
        await logError("Unhandled Promise Rejection", {
          error: error?.message || String(error),
          stack: error?.stack,
          errorType: "Promise Rejection",
        });
      } catch (e) {
        console.error("Error logging promise rejection:", e);
      }

      if (onRejected) {
        return onRejected(error);
      }
      throw error;
    });
  };

  console.log("✅ Promise rejection handler instalado");
};

/**
 * Capturar errores de consola
 */
export const installConsoleErrorHandler = () => {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = async (...args) => {
    // Llamar al console.error original
    originalError.apply(console, args);

    // Guardar en logs
    try {
      const message = args
        .map((arg) =>
          typeof arg === "object" ? JSON.stringify(arg) : String(arg)
        )
        .join(" ");

      await logError(`Console Error: ${message}`, {
        errorType: "Console Error",
        args: args.map((a) => String(a)),
      });
    } catch (e) {
      originalError("Error logging console.error:", e);
    }
  };

  console.warn = async (...args) => {
    // Llamar al console.warn original
    originalWarn.apply(console, args);

    // Guardar en logs (solo warnings importantes)
    try {
      const message = args
        .map((arg) =>
          typeof arg === "object" ? JSON.stringify(arg) : String(arg)
        )
        .join(" ");

      // Solo guardar warnings que no sean ruido
      if (
        !message.includes("deprecated") &&
        !message.includes("VirtualizedList")
      ) {
        await logWarn(`Console Warning: ${message}`, {
          errorType: "Console Warning",
          args: args.map((a) => String(a)),
        });
      }
    } catch (e) {
      originalWarn("Error logging console.warn:", e);
    }
  };

  console.log("✅ Console error handler instalado");
};

/**
 * Inicializar todos los handlers
 */
export const initializeErrorHandlers = () => {
  console.log("🚀 Inicializando handlers de errores...");

  installGlobalErrorHandler();
  installPromiseRejectionHandler();
  installConsoleErrorHandler();

  console.log("✅ Todos los handlers de errores instalados");
};

export default {
  installGlobalErrorHandler,
  uninstallGlobalErrorHandler,
  installPromiseRejectionHandler,
  installConsoleErrorHandler,
  initializeErrorHandlers,
};
