/**
 * Sistema de captura y registro de errores
 * Guarda logs localmente para debugging
 */

import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOG_FILE = FileSystem.documentDirectory + "app_error_logs.txt";
const MAX_LOG_SIZE = 500000; // 500KB máximo
const LOG_SESSION_KEY = "log_session_id";

// Helper para verificar si el archivo existe usando la nueva API
const fileExists = async (uri) => {
  try {
    const file = new FileSystem.File(uri);
    const info = await file.stat();
    return info.exists;
  } catch (error) {
    return false;
  }
};

// Helper para obtener información del archivo usando la nueva API
const getFileInfo = async (uri) => {
  try {
    const file = new FileSystem.File(uri);
    const info = await file.stat();
    return {
      exists: info.exists,
      size: info.size || 0,
    };
  } catch (error) {
    return {
      exists: false,
      size: 0,
    };
  }
};

// Generar ID de sesión único
const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Obtener o crear ID de sesión
let currentSessionId = null;
export const getSessionId = async () => {
  if (currentSessionId) return currentSessionId;

  try {
    let sessionId = await AsyncStorage.getItem(LOG_SESSION_KEY);
    if (!sessionId) {
      sessionId = generateSessionId();
      await AsyncStorage.setItem(LOG_SESSION_KEY, sessionId);
    }
    currentSessionId = sessionId;
    return sessionId;
  } catch (e) {
    currentSessionId = generateSessionId();
    return currentSessionId;
  }
};

// Formatear mensaje de log
const formatLogMessage = (level, message, extra = {}) => {
  const timestamp = new Date().toISOString();
  const sessionId = currentSessionId || "unknown";

  let logEntry = {
    timestamp,
    sessionId,
    level,
    message: String(message),
  };

  // Agregar información extra si existe
  if (extra.stack) {
    logEntry.stack = String(extra.stack);
  }
  if (extra.componentStack) {
    logEntry.componentStack = String(extra.componentStack);
  }
  if (extra.isFatal !== undefined) {
    logEntry.isFatal = extra.isFatal;
  }
  if (extra.errorType) {
    logEntry.errorType = extra.errorType;
  }

  return JSON.stringify(logEntry) + "\n---\n";
};

// Escribir log en archivo
export const writeLog = async (level, message, extra = {}) => {
  try {
    // Asegurar que tenemos sessionId
    await getSessionId();

    const logMessage = formatLogMessage(level, message, extra);

    // Verificar si el archivo existe usando nueva API
    const exists = await fileExists(LOG_FILE);

    let currentContent = "";
    if (exists) {
      // Leer contenido actual
      currentContent = await FileSystem.readAsStringAsync(LOG_FILE);

      // Si el archivo es muy grande, truncar (mantener últimos logs)
      const fileInfo = await getFileInfo(LOG_FILE);
      if (fileInfo.size > MAX_LOG_SIZE) {
        const lines = currentContent.split("\n---\n");
        currentContent = lines.slice(-50).join("\n---\n"); // Mantener últimos 50 logs
      }
    }

    // Escribir log INMEDIATAMENTE sin await para evitar que se pierda
    // En caso de crash, esto permite que el sistema operativo complete la escritura
    FileSystem.writeAsStringAsync(LOG_FILE, currentContent + logMessage, {
      encoding: FileSystem.EncodingType.UTF8,
    }).catch((writeError) => {
      console.error("❌ Error escribiendo log:", writeError);
    });

    // También mostrar en consola
    console.log(`[${level.toUpperCase()}]`, message);

    // Retornar inmediatamente sin esperar
    return true;
  } catch (error) {
    // Si falla escribir en archivo, al menos mostrar en consola
    console.error("❌ Error escribiendo log:", error);
    console.log(`[${level.toUpperCase()}]`, message);
    return false;
  }
};

// Métodos de conveniencia
export const logInfo = (message, extra) => writeLog("INFO", message, extra);
export const logWarn = (message, extra) => writeLog("WARN", message, extra);
export const logError = (message, extra) => writeLog("ERROR", message, extra);
export const logFatal = (message, extra) =>
  writeLog("FATAL", message, { ...extra, isFatal: true });

// Leer todos los logs
export const readLogs = async () => {
  try {
    const exists = await fileExists(LOG_FILE);
    if (!exists) {
      return "No hay logs disponibles";
    }

    const content = await FileSystem.readAsStringAsync(LOG_FILE);
    return content;
  } catch (error) {
    console.error("❌ Error leyendo logs:", error);
    return "Error leyendo archivo de logs";
  }
};

// Limpiar logs
export const clearLogs = async () => {
  try {
    const exists = await fileExists(LOG_FILE);
    if (exists) {
      await FileSystem.deleteAsync(LOG_FILE);
    }

    // Generar nuevo sessionId
    currentSessionId = null;
    await AsyncStorage.removeItem(LOG_SESSION_KEY);
    await getSessionId();

    await writeLog("INFO", "🗑️ Logs limpiados - Nueva sesión iniciada");
    return true;
  } catch (error) {
    console.error("❌ Error limpiando logs:", error);
    return false;
  }
};

// Exportar logs (para compartir o subir)
export const exportLogs = async () => {
  try {
    const content = await readLogs();
    return {
      content,
      filename: `error_logs_${new Date().toISOString().replace(/:/g, "-")}.txt`,
      uri: LOG_FILE,
    };
  } catch (error) {
    console.error("❌ Error exportando logs:", error);
    return null;
  }
};

// Obtener estadísticas de logs
export const getLogStats = async () => {
  try {
    const fileInfo = await getFileInfo(LOG_FILE);
    if (!fileInfo.exists) {
      return {
        exists: false,
        size: 0,
        count: 0,
      };
    }

    const content = await FileSystem.readAsStringAsync(LOG_FILE);
    const logs = content.split("\n---\n").filter((l) => l.trim());

    return {
      exists: true,
      size: fileInfo.size,
      count: logs.length,
      sessionId: currentSessionId,
    };
  } catch (error) {
    console.error("❌ Error obteniendo estadísticas:", error);
    return {
      exists: false,
      size: 0,
      count: 0,
      error: error.message,
    };
  }
};

// Capturar error y guardarlo
export const captureError = async (error, context = {}) => {
  const errorInfo = {
    message: error?.message || String(error),
    stack: error?.stack || "No stack trace",
    name: error?.name || "Error",
    ...context,
  };

  await logError(`${errorInfo.name}: ${errorInfo.message}`, errorInfo);

  return errorInfo;
};

// Capturar error fatal con guardado FORZADO E INMEDIATO
export const captureFatalError = async (error, context = {}) => {
  const errorInfo = {
    message: error?.message || String(error),
    stack: error?.stack || "No stack trace",
    name: error?.name || "FatalError",
    ...context,
  };

  // Guardar de forma INMEDIATA sin esperar
  const timestamp = new Date().toISOString();
  const sessionId = currentSessionId || "unknown";

  const logEntry = {
    timestamp,
    sessionId,
    level: "FATAL",
    message: `FATAL - ${errorInfo.name}: ${errorInfo.message}`,
    stack: errorInfo.stack,
    isFatal: true,
    errorType: errorInfo.errorType || "Unknown",
    ...context,
  };

  const logMessage = JSON.stringify(logEntry) + "\n---\n";

  // Escribir MÚLTIPLES VECES para asegurar que se guarde
  try {
    // Intento 1: Append rápido
    const exists = await fileExists(LOG_FILE);
    const currentContent = exists
      ? await FileSystem.readAsStringAsync(LOG_FILE)
      : "";

    // NO usar await - dejar que se ejecute en background
    FileSystem.writeAsStringAsync(LOG_FILE, currentContent + logMessage, {
      encoding: FileSystem.EncodingType.UTF8,
    }).catch(() => {});

    // Intento 2: Guardar también en AsyncStorage como backup
    AsyncStorage.setItem("LAST_FATAL_ERROR", JSON.stringify(logEntry)).catch(
      () => {}
    );

    // Intento 3: Log en consola nativa (siempre se guarda en logcat/device logs)
    console.error("🔥🔥🔥 FATAL ERROR 🔥🔥🔥");
    console.error("Timestamp:", timestamp);
    console.error("Error:", errorInfo.message);
    console.error("Stack:", errorInfo.stack);
    console.error("Context:", JSON.stringify(context));
    console.error("🔥🔥🔥 END FATAL ERROR 🔥🔥🔥");
  } catch (e) {
    console.error("❌ Error guardando fatal error:", e);
  }

  return errorInfo;
};

// Inicializar sistema de logs al arrancar la app
export const initializeLogger = async () => {
  try {
    await getSessionId();

    // Recuperar último error fatal si existe
    try {
      const lastFatalError = await AsyncStorage.getItem("LAST_FATAL_ERROR");
      if (lastFatalError) {
        console.log("🔍 Recuperando último error fatal...");
        const errorData = JSON.parse(lastFatalError);

        // Agregar al archivo de logs
        const exists = await fileExists(LOG_FILE);
        const currentContent = exists
          ? await FileSystem.readAsStringAsync(LOG_FILE)
          : "";
        const recoveredMessage = `\n[RECOVERED FATAL ERROR FROM CRASH]\n${JSON.stringify(errorData, null, 2)}\n---\n`;

        await FileSystem.writeAsStringAsync(
          LOG_FILE,
          currentContent + recoveredMessage,
          {
            encoding: FileSystem.EncodingType.UTF8,
          }
        );

        // Limpiar el error recuperado
        await AsyncStorage.removeItem("LAST_FATAL_ERROR");
        console.log("✅ Error fatal recuperado y guardado en logs");
      }
    } catch (recoveryError) {
      console.error("⚠️ Error recuperando fatal error:", recoveryError);
    }

    // Recuperar último error de React si existe
    try {
      const lastReactError = await AsyncStorage.getItem("LAST_REACT_ERROR");
      if (lastReactError) {
        console.log("🔍 Recuperando último error de React...");
        const errorData = JSON.parse(lastReactError);

        // Agregar al archivo de logs
        const exists = await fileExists(LOG_FILE);
        const currentContent = exists
          ? await FileSystem.readAsStringAsync(LOG_FILE)
          : "";
        const recoveredMessage = `\n[RECOVERED REACT ERROR FROM CRASH]\n${JSON.stringify(errorData, null, 2)}\n---\n`;

        await FileSystem.writeAsStringAsync(
          LOG_FILE,
          currentContent + recoveredMessage,
          {
            encoding: FileSystem.EncodingType.UTF8,
          }
        );

        // Limpiar el error recuperado
        await AsyncStorage.removeItem("LAST_REACT_ERROR");
        console.log("✅ Error de React recuperado y guardado en logs");
      }
    } catch (recoveryError) {
      console.error("⚠️ Error recuperando React error:", recoveryError);
    }

    await writeLog("INFO", "🚀 Sistema de logs inicializado");

    const stats = await getLogStats();
    console.log("📊 Estadísticas de logs:", stats);

    return true;
  } catch (error) {
    console.error("❌ Error inicializando logger:", error);
    return false;
  }
};

export default {
  writeLog,
  logInfo,
  logWarn,
  logError,
  logFatal,
  readLogs,
  clearLogs,
  exportLogs,
  getLogStats,
  captureError,
  captureFatalError,
  initializeLogger,
  getSessionId,
};
