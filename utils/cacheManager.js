/**
 * 🔥 CACHE MANAGER - Gestión inteligente de caché para optimizar memoria
 * Previene cierres de app por sobrecarga de datos en AsyncStorage
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================
// CONFIGURACIÓN
// ============================================

const CACHE_CONFIG = {
  // Tamaño máximo de caché en bytes (10MB por defecto)
  MAX_CACHE_SIZE: 10 * 1024 * 1024,

  // Tiempo de expiración por defecto (7 días)
  DEFAULT_TTL: 7 * 24 * 60 * 60 * 1000,

  // Límite de elementos por categoría
  MAX_ITEMS_PER_CATEGORY: {
    forms: 100,
    responses: 50,
    questions: 100,
    metadata: 200,
  },

  // Claves de caché a gestionar
  MANAGED_KEYS: [
    "offline_forms",
    "offline_questions",
    "offline_forms_metadata",
    "offline_related_answers",
    "my_forms_offline",
    "responses_with_answers_offline",
    "responses_detail_offline",
    "user_info_offline",
  ],
};

// ============================================
// UTILIDADES
// ============================================

/**
 * Obtiene el tamaño en bytes de un string
 */
const getStringSize = (str) => {
  return new Blob([str]).size;
};

/**
 * Calcula el tamaño total del caché
 */
export const getCacheSize = async () => {
  try {
    let totalSize = 0;
    const keys = await AsyncStorage.getAllKeys();

    for (const key of keys) {
      const value = await AsyncStorage.getItem(key);
      if (value) {
        totalSize += getStringSize(value);
      }
    }

    return totalSize;
  } catch (error) {
    console.error("❌ Error calculando tamaño de caché:", error);
    return 0;
  }
};

/**
 * Formatea bytes a formato legible
 */
export const formatBytes = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

// ============================================
// GESTIÓN DE CACHÉ CON TTL
// ============================================

/**
 * Guarda un valor en caché con tiempo de expiración
 */
export const setCacheWithTTL = async (
  key,
  value,
  ttl = CACHE_CONFIG.DEFAULT_TTL
) => {
  try {
    const cacheData = {
      value: value,
      timestamp: Date.now(),
      ttl: ttl,
    };

    await AsyncStorage.setItem(key, JSON.stringify(cacheData));
    console.log(`✅ Caché guardado: ${key} (TTL: ${ttl / (1000 * 60)} min)`);

    // Verificar tamaño del caché después de guardar
    await checkCacheSizeAndClean();
  } catch (error) {
    console.error(`❌ Error guardando caché ${key}:`, error);
  }
};

/**
 * Obtiene un valor del caché si no ha expirado
 */
export const getCacheWithTTL = async (key) => {
  try {
    const cached = await AsyncStorage.getItem(key);

    if (!cached) {
      return null;
    }

    const cacheData = JSON.parse(cached);
    const now = Date.now();

    // Verificar si ha expirado
    if (cacheData.timestamp && cacheData.ttl) {
      const expirationTime = cacheData.timestamp + cacheData.ttl;

      if (now > expirationTime) {
        console.log(`⏰ Caché expirado: ${key}`);
        await AsyncStorage.removeItem(key);
        return null;
      }
    }

    return cacheData.value;
  } catch (error) {
    console.error(`❌ Error leyendo caché ${key}:`, error);
    return null;
  }
};

// ============================================
// LIMPIEZA DE CACHÉ
// ============================================

/**
 * Limpia entradas expiradas del caché
 */
export const cleanExpiredCache = async () => {
  try {
    console.log("🧹 Limpiando caché expirado...");
    let removedCount = 0;

    const keys = await AsyncStorage.getAllKeys();
    const now = Date.now();

    for (const key of keys) {
      try {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          const cacheData = JSON.parse(cached);

          if (cacheData.timestamp && cacheData.ttl) {
            const expirationTime = cacheData.timestamp + cacheData.ttl;

            if (now > expirationTime) {
              await AsyncStorage.removeItem(key);
              removedCount++;
              console.log(`🗑️ Eliminado: ${key}`);
            }
          }
        }
      } catch (e) {
        // Ignorar errores de parseo (claves que no son caché con TTL)
      }
    }

    console.log(`✅ ${removedCount} entradas expiradas eliminadas`);
    return removedCount;
  } catch (error) {
    console.error("❌ Error limpiando caché expirado:", error);
    return 0;
  }
};

/**
 * Limpia caché antiguo por límite de items
 */
export const limitCacheItems = async (key, maxItems) => {
  try {
    const cached = await AsyncStorage.getItem(key);

    if (!cached) return;

    const data = JSON.parse(cached);

    if (Array.isArray(data) && data.length > maxItems) {
      // Mantener solo los últimos N items
      const limited = data.slice(-maxItems);
      await AsyncStorage.setItem(key, JSON.stringify(limited));
      console.log(
        `✂️ Limitado ${key}: ${data.length} → ${limited.length} items`
      );
    }
  } catch (error) {
    console.error(`❌ Error limitando ${key}:`, error);
  }
};

/**
 * Verifica el tamaño del caché y limpia si excede el límite
 */
export const checkCacheSizeAndClean = async () => {
  try {
    const currentSize = await getCacheSize();

    console.log(`📊 Tamaño actual de caché: ${formatBytes(currentSize)}`);

    if (currentSize > CACHE_CONFIG.MAX_CACHE_SIZE) {
      console.warn(
        `⚠️ Caché excede límite (${formatBytes(CACHE_CONFIG.MAX_CACHE_SIZE)})`
      );

      // 1. Limpiar caché expirado
      await cleanExpiredCache();

      // 2. Limitar items por categoría
      for (const [category, maxItems] of Object.entries(
        CACHE_CONFIG.MAX_ITEMS_PER_CATEGORY
      )) {
        const key = `offline_${category}`;
        await limitCacheItems(key, maxItems);
      }

      // 3. Verificar tamaño nuevamente
      const newSize = await getCacheSize();
      console.log(`✅ Nuevo tamaño de caché: ${formatBytes(newSize)}`);

      // 4. Si aún excede, limpiar caché antiguo agresivamente
      if (newSize > CACHE_CONFIG.MAX_CACHE_SIZE) {
        console.warn("⚠️ Limpieza agresiva de caché...");
        await clearOldestCache(0.5); // Eliminar 50% más antiguo
      }
    }
  } catch (error) {
    console.error("❌ Error verificando tamaño de caché:", error);
  }
};

/**
 * Limpia el porcentaje más antiguo del caché
 */
export const clearOldestCache = async (percentage = 0.5) => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheItems = [];

    // Recopilar items con timestamp
    for (const key of keys) {
      if (CACHE_CONFIG.MANAGED_KEYS.includes(key)) {
        try {
          const cached = await AsyncStorage.getItem(key);
          if (cached) {
            const data = JSON.parse(cached);
            const timestamp = data.timestamp || 0;
            cacheItems.push({ key, timestamp });
          }
        } catch (e) {
          // Ignorar
        }
      }
    }

    // Ordenar por timestamp (más antiguos primero)
    cacheItems.sort((a, b) => a.timestamp - b.timestamp);

    // Calcular cuántos eliminar
    const toRemove = Math.floor(cacheItems.length * percentage);

    // Eliminar los más antiguos
    for (let i = 0; i < toRemove; i++) {
      await AsyncStorage.removeItem(cacheItems[i].key);
      console.log(`🗑️ Eliminado caché antiguo: ${cacheItems[i].key}`);
    }

    console.log(`✅ ${toRemove} entradas antiguas eliminadas`);
  } catch (error) {
    console.error("❌ Error limpiando caché antiguo:", error);
  }
};

// ============================================
// LIMPIEZA COMPLETA
// ============================================

/**
 * Limpia todo el caché gestionado (excepto datos críticos)
 */
export const clearManagedCache = async (
  excludeKeys = ["authToken", "backend_url"]
) => {
  try {
    console.log("🧹 Limpiando caché gestionado...");
    let removedCount = 0;

    for (const key of CACHE_CONFIG.MANAGED_KEYS) {
      if (!excludeKeys.includes(key)) {
        await AsyncStorage.removeItem(key);
        removedCount++;
        console.log(`🗑️ Eliminado: ${key}`);
      }
    }

    console.log(`✅ ${removedCount} claves eliminadas`);
    return removedCount;
  } catch (error) {
    console.error("❌ Error limpiando caché:", error);
    return 0;
  }
};

/**
 * Obtiene estadísticas del caché
 */
export const getCacheStats = async () => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const totalSize = await getCacheSize();
    const managedKeys = allKeys.filter((k) =>
      CACHE_CONFIG.MANAGED_KEYS.includes(k)
    );

    let expiredCount = 0;
    const now = Date.now();

    for (const key of managedKeys) {
      try {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          const data = JSON.parse(cached);
          if (data.timestamp && data.ttl) {
            const expirationTime = data.timestamp + data.ttl;
            if (now > expirationTime) {
              expiredCount++;
            }
          }
        }
      } catch (e) {
        // Ignorar
      }
    }

    return {
      totalKeys: allKeys.length,
      managedKeys: managedKeys.length,
      totalSize: totalSize,
      totalSizeFormatted: formatBytes(totalSize),
      maxSize: CACHE_CONFIG.MAX_CACHE_SIZE,
      maxSizeFormatted: formatBytes(CACHE_CONFIG.MAX_CACHE_SIZE),
      usagePercentage: Math.round(
        (totalSize / CACHE_CONFIG.MAX_CACHE_SIZE) * 100
      ),
      expiredCount: expiredCount,
    };
  } catch (error) {
    console.error("❌ Error obteniendo estadísticas de caché:", error);
    return null;
  }
};

// ============================================
// INICIALIZACIÓN
// ============================================

/**
 * Inicializa el gestor de caché (llamar al inicio de la app)
 */
export const initCacheManager = async () => {
  try {
    console.log("🚀 Inicializando gestor de caché...");

    // Limpiar caché expirado al inicio
    await cleanExpiredCache();

    // Verificar tamaño y limpiar si es necesario
    await checkCacheSizeAndClean();

    // Mostrar estadísticas
    const stats = await getCacheStats();
    if (stats) {
      console.log("📊 Estadísticas de caché:", {
        totalKeys: stats.totalKeys,
        managedKeys: stats.managedKeys,
        size: stats.totalSizeFormatted,
        usage: `${stats.usagePercentage}%`,
        expired: stats.expiredCount,
      });
    }

    console.log("✅ Gestor de caché inicializado");
  } catch (error) {
    console.error("❌ Error inicializando gestor de caché:", error);
  }
};

export default {
  setCacheWithTTL,
  getCacheWithTTL,
  cleanExpiredCache,
  checkCacheSizeAndClean,
  clearManagedCache,
  getCacheStats,
  getCacheSize,
  formatBytes,
  initCacheManager,
};
