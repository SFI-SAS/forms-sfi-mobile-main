import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Utilidad para operaciones optimizadas de AsyncStorage
 * Usa Promise.all y multiSet/multiGet para operaciones paralelas y batching
 */

/**
 * Obtiene múltiples valores de AsyncStorage en paralelo
 * @param {string[]} keys - Array de keys a obtener
 * @returns {Promise<Object>} Objeto con key-value pairs
 */
export async function getMultipleItems(keys) {
  try {
    // Obtener todos los valores en paralelo
    const values = await Promise.all(
      keys.map((key) => AsyncStorage.getItem(key))
    );

    // Crear objeto con los resultados
    const result = {};
    keys.forEach((key, index) => {
      result[key] = values[index];
    });

    return result;
  } catch (error) {
    console.error("Error getting multiple items from AsyncStorage:", error);
    throw error;
  }
}

/**
 * Obtiene múltiples valores y los parsea como JSON
 * @param {string[]} keys - Array de keys a obtener
 * @param {*} defaultValue - Valor por defecto si no existe o hay error al parsear
 * @returns {Promise<Object>} Objeto con key-value pairs parseados
 */
export async function getMultipleItemsParsed(keys, defaultValue = null) {
  try {
    const items = await getMultipleItems(keys);

    const result = {};
    for (const [key, value] of Object.entries(items)) {
      try {
        result[key] = value ? JSON.parse(value) : defaultValue;
      } catch (parseError) {
        console.warn(`Error parsing ${key}:`, parseError);
        result[key] = defaultValue;
      }
    }

    return result;
  } catch (error) {
    console.error("Error getting and parsing multiple items:", error);
    throw error;
  }
}

/**
 * Guarda múltiples valores en AsyncStorage usando multiSet (operación atómica)
 * @param {Object} keyValuePairs - Objeto con pares key-value
 * @returns {Promise<void>}
 */
export async function setMultipleItems(keyValuePairs) {
  try {
    // Convertir objeto a array de pares [key, value]
    const pairs = Object.entries(keyValuePairs);

    // Usar multiSet para operación atómica
    await AsyncStorage.multiSet(pairs);
  } catch (error) {
    console.error("Error setting multiple items in AsyncStorage:", error);
    throw error;
  }
}

/**
 * Guarda múltiples valores stringificando objetos/arrays
 * @param {Object} keyValuePairs - Objeto con pares key-value
 * @returns {Promise<void>}
 */
export async function setMultipleItemsStringified(keyValuePairs) {
  try {
    const pairs = Object.entries(keyValuePairs).map(([key, value]) => {
      const stringValue =
        typeof value === "string" ? value : JSON.stringify(value);
      return [key, stringValue];
    });

    await AsyncStorage.multiSet(pairs);
  } catch (error) {
    console.error("Error setting and stringifying multiple items:", error);
    throw error;
  }
}

/**
 * Elimina múltiples keys en una sola operación
 * @param {string[]} keys - Array de keys a eliminar
 * @returns {Promise<void>}
 */
export async function removeMultipleItems(keys) {
  try {
    await AsyncStorage.multiRemove(keys);
  } catch (error) {
    console.error("Error removing multiple items from AsyncStorage:", error);
    throw error;
  }
}

/**
 * Obtiene el tamaño total usado por AsyncStorage
 * @returns {Promise<{totalKeys: number, totalSizeKB: number, totalSizeMB: string}>}
 */
export async function getStorageSize() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();

    let totalSize = 0;
    const values = await Promise.all(
      allKeys.map((key) => AsyncStorage.getItem(key))
    );

    values.forEach((value) => {
      if (value) {
        totalSize += value.length;
      }
    });

    return {
      totalKeys: allKeys.length,
      totalSizeKB: Math.round(totalSize / 1024),
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
    };
  } catch (error) {
    console.error("Error getting storage size:", error);
    return { totalKeys: 0, totalSizeKB: 0, totalSizeMB: "0.00" };
  }
}

/**
 * Limpia storage de keys que coincidan con un patrón
 * @param {string} pattern - Patrón a buscar (ejemplo: "form_")
 * @returns {Promise<number>} Número de keys eliminadas
 */
export async function clearStorageByPattern(pattern) {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter((key) => key.includes(pattern));

    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }

    return keysToRemove.length;
  } catch (error) {
    console.error("Error clearing storage by pattern:", error);
    throw error;
  }
}

/**
 * Obtiene todas las keys que coincidan con un patrón
 * @param {string} pattern - Patrón a buscar
 * @returns {Promise<string[]>}
 */
export async function getKeysByPattern(pattern) {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    return allKeys.filter((key) => key.includes(pattern));
  } catch (error) {
    console.error("Error getting keys by pattern:", error);
    return [];
  }
}

// Export default para importación simple
export default {
  getMultipleItems,
  getMultipleItemsParsed,
  setMultipleItems,
  setMultipleItemsStringified,
  removeMultipleItems,
  getStorageSize,
  clearStorageByPattern,
  getKeysByPattern,
};
