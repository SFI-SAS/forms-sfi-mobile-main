/**
 * FormSyncManager.ts
 * Servicio que maneja sincronización entre endpoints PC y AsyncStorage
 * Soporta modo offline/online automático
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import {
  processFormData,
  serializeForStorage,
  deserializeFromStorage,
  EnrichedFormData,
} from "./FormDataAdapter";

const STORAGE_KEYS = {
  FORM_DATA: (formId: number) => `form_data_${formId}`,
  FORMS_LIST: "forms_list",
  BACKEND_URL: "backend_url",
  AUTH_TOKEN: "authToken",
  LAST_SYNC: (formId: number) => `form_sync_${formId}`,
};

export interface SyncStatus {
  isOnline: boolean;
  lastSync: Date | null;
  hasLocalData: boolean;
}

/**
 * Obtiene el estado de conexión actual
 */
export async function getConnectionStatus(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
}

/**
 * Obtiene datos del formulario desde endpoints PC
 */
async function fetchFormDataFromAPI(formId: number): Promise<{
  formDesign: any;
  questions: any[];
  metadata: any;
}> {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  const backendUrl = await AsyncStorage.getItem(STORAGE_KEYS.BACKEND_URL);

  if (!token || !backendUrl) {
    throw new Error("No hay token o backend URL configurado");
  }

  console.log(
    `🌐 [SyncManager] Obteniendo datos de formulario ${formId} desde API...`
  );

  // Realizar ambas peticiones en paralelo (como en PC)
  const [designResponse, questionsResponse] = await Promise.all([
    fetch(`${backendUrl}/forms/${formId}/form_design`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`${backendUrl}/forms/${formId}/questions`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  // ✅ Manejo especial para formularios que no existen (404)
  if (!designResponse.ok) {
    const errorText = await designResponse.text();

    // Si es 404, el formulario no existe - no es un error crítico
    if (designResponse.status === 404) {
      console.warn(
        `⚠️ [SyncManager] Formulario ${formId} no existe en el backend (404) - será omitido`
      );
      throw new Error(`FORM_NOT_FOUND:${formId}`);
    }

    console.error(
      `❌ Error obteniendo form_design del formulario ${formId}: ${designResponse.status} ${designResponse.statusText}`,
      errorText
    );
    throw new Error(
      `Error al obtener form_design: ${designResponse.status} ${designResponse.statusText}`
    );
  }

  if (!questionsResponse.ok) {
    const errorText = await questionsResponse.text();

    // Si es 404, el formulario no existe
    if (questionsResponse.status === 404) {
      console.warn(
        `⚠️ [SyncManager] Questions del formulario ${formId} no encontradas (404) - será omitido`
      );
      throw new Error(`FORM_NOT_FOUND:${formId}`);
    }

    console.error(
      `❌ Error obteniendo questions del formulario ${formId}: ${questionsResponse.status} ${questionsResponse.statusText}`,
      errorText
    );
    throw new Error(
      `Error al obtener questions: ${questionsResponse.status} ${questionsResponse.statusText}`
    );
  }

  const designData = await designResponse.json();
  const questionsData = await questionsResponse.json();

  // 🔥 LOG COMPLETO DEL ENDPOINT /forms/{formId}/questions
  console.log(`
═══════════════════════════════════════════════════════════
📊 RESPUESTA COMPLETA DE /forms/${formId}/questions
═══════════════════════════════════════════════════════════
${JSON.stringify(questionsData, null, 2)}
═══════════════════════════════════════════════════════════
  `);

  console.log(
    `✅ [SyncManager] Datos obtenidos: ${questionsData.questions?.length || 0} preguntas`
  );

  return {
    formDesign: designData.form_design,
    questions: questionsData.questions || [],
    metadata: {
      formId,
      title: designData.title || `Formulario ${formId}`,
      description: designData.description || "",
    },
  };
}

/**
 * Guarda datos del formulario en AsyncStorage
 */
async function saveFormDataToStorage(
  formId: number,
  data: EnrichedFormData
): Promise<void> {
  const key = STORAGE_KEYS.FORM_DATA(formId);
  const serialized = serializeForStorage(data);

  // 🔥 LOG DETALLADO: Qué opciones estamos guardando
  console.log(`
═══════════════════════════════════════════════════════════
🔍 GUARDANDO EN ASYNCSTORAGE - Formulario ${formId}
═══════════════════════════════════════════════════════════`);

  const logItem = (item: any, level: number = 0) => {
    const indent = "  ".repeat(level);
    if (item.type === "select" && item.props?.label) {
      console.log(`${indent}📌 ${item.props.label}:`);
      console.log(`${indent}   - Type: ${item.type}`);
      console.log(
        `${indent}   - Opciones: ${JSON.stringify(item.props.options)}`
      );
      console.log(`${indent}   - dataSource: ${item.props.dataSource}`);
      console.log(`${indent}   - questionType: ${item.props.questionType}`);
    }
    if (item.children && Array.isArray(item.children)) {
      item.children.forEach((child: any) => logItem(child, level + 1));
    }
  };

  data.formStructure.forEach((item) => logItem(item));
  console.log(`═══════════════════════════════════════════════════════════\n`);

  await AsyncStorage.setItem(key, serialized);
  await AsyncStorage.setItem(
    STORAGE_KEYS.LAST_SYNC(formId),
    new Date().toISOString()
  );

  console.log(
    `💾 [SyncManager] Formulario ${formId} guardado en AsyncStorage (${(serialized.length / 1024).toFixed(2)} KB)`
  );
}

/**
 * Obtiene datos del formulario desde AsyncStorage
 */
async function getFormDataFromStorage(
  formId: number
): Promise<EnrichedFormData | null> {
  const key = STORAGE_KEYS.FORM_DATA(formId);
  const data = await AsyncStorage.getItem(key);

  if (!data) {
    console.log(
      `📭 [SyncManager] No hay datos en AsyncStorage para formulario ${formId}`
    );
    return null;
  }

  const deserialized = deserializeFromStorage(data);
  console.log(
    `📂 [SyncManager] Datos cargados desde AsyncStorage (${(data.length / 1024).toFixed(2)} KB)`
  );

  // 🔥 LOG DETALLADO: Qué opciones estamos cargando
  console.log(`
═══════════════════════════════════════════════════════════
🔍 LEYENDO DE ASYNCSTORAGE - Formulario ${formId}
═══════════════════════════════════════════════════════════`);

  const logItem = (item: any, level: number = 0) => {
    const indent = "  ".repeat(level);
    if (item.type === "select" && item.props?.label) {
      console.log(`${indent}📌 ${item.props.label}:`);
      console.log(`${indent}   - Type: ${item.type}`);
      console.log(
        `${indent}   - Opciones: ${JSON.stringify(item.props.options)}`
      );
      console.log(`${indent}   - dataSource: ${item.props.dataSource}`);
      console.log(`${indent}   - questionType: ${item.props.questionType}`);
    }
    if (item.children && Array.isArray(item.children)) {
      item.children.forEach((child: any) => logItem(child, level + 1));
    }
  };

  deserialized.formStructure.forEach((item) => logItem(item));
  console.log(`═══════════════════════════════════════════════════════════\n`);

  return deserialized;
}

/**
 * Sincroniza un formulario específico
 * 🔥 PRIORIDAD: Datos frescos de API cuando está ONLINE
 * 1. Si ONLINE → SIEMPRE obtiene desde API (datos frescos)
 * 2. Si OFFLINE → Usa AsyncStorage (datos cacheados)
 * 3. Si falla API → Fallback a AsyncStorage
 */
export async function syncFormData(
  formId: number,
  forceRefresh: boolean = false
): Promise<EnrichedFormData> {
  console.log(`🔄 [SyncManager] Sincronizando formulario ${formId}...`);

  const isOnline = await getConnectionStatus();

  // ✅ PRIORIDAD 1: Si está OFFLINE → Usar solo AsyncStorage
  if (!isOnline && !forceRefresh) {
    console.log("📡 [SyncManager] Modo OFFLINE - usando AsyncStorage");
    const cachedData = await getFormDataFromStorage(formId);

    if (!cachedData) {
      throw new Error("No hay datos en caché y no hay conexión a internet");
    }

    return cachedData;
  }

  // ✅ PRIORIDAD 2: Si está ONLINE → SIEMPRE obtener desde API (datos frescos)
  console.log(
    "🌐 [SyncManager] Modo ONLINE - obteniendo datos FRESCOS desde API..."
  );

  try {
    const { formDesign, questions, metadata } =
      await fetchFormDataFromAPI(formId);

    // Procesar datos usando el adaptador (esto consulta question-table-relation)
    const enrichedData = await processFormData(
      formDesign,
      questions,
      formId,
      metadata.title,
      metadata.description
    );

    // Guardar en AsyncStorage para uso offline futuro
    await saveFormDataToStorage(formId, enrichedData);

    console.log("✅ [SyncManager] Datos FRESCOS de API procesados y guardados");
    return enrichedData;
  } catch (error) {
    // ✅ Si es un error de formulario no encontrado (404), no intentar caché
    if (error instanceof Error && error.message.startsWith("FORM_NOT_FOUND:")) {
      console.log(
        `🚫 [SyncManager] Formulario ${formId} no existe - no se intentará caché`
      );
      throw error; // Re-lanzar para que el componente lo maneje
    }

    console.error("❌ [SyncManager] Error al sincronizar desde API:", error);

    // ✅ PRIORIDAD 3: Fallback a AsyncStorage solo si falla la API
    console.warn(
      "⚠️ [SyncManager] API falló - intentando usar caché como fallback..."
    );
    const cachedData = await getFormDataFromStorage(formId);

    if (!cachedData) {
      throw new Error("No se pudo obtener datos ni desde API ni desde caché");
    }

    console.log("⚠️ [SyncManager] Usando datos en caché debido a error en API");
    return cachedData;
  }
}

/**
 * Obtiene el estado de sincronización de un formulario
 */
export async function getSyncStatus(formId: number): Promise<SyncStatus> {
  const isOnline = await getConnectionStatus();
  const hasLocalData = (await getFormDataFromStorage(formId)) !== null;
  const lastSyncStr = await AsyncStorage.getItem(
    STORAGE_KEYS.LAST_SYNC(formId)
  );
  const lastSync = lastSyncStr ? new Date(lastSyncStr) : null;

  return {
    isOnline,
    lastSync,
    hasLocalData,
  };
}

/**
 * Limpia datos en caché de un formulario específico
 */
export async function clearFormCache(formId: number): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.FORM_DATA(formId));
  await AsyncStorage.removeItem(STORAGE_KEYS.LAST_SYNC(formId));
  console.log(`🗑️ [SyncManager] Caché limpiado para formulario ${formId}`);
}

/**
 * Limpia todos los datos en caché
 */
export async function clearAllCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const formKeys = keys.filter(
    (key) => key.startsWith("form_data_") || key.startsWith("form_sync_")
  );

  await AsyncStorage.multiRemove(formKeys);
  console.log(`🗑️ [SyncManager] ${formKeys.length} items eliminados del caché`);
}

/**
 * Pre-carga múltiples formularios (usado por Dashboard)
 */
export async function preloadForms(formIds: number[]): Promise<void> {
  const isOnline = await getConnectionStatus();

  if (!isOnline) {
    console.log("📡 [SyncManager] Modo OFFLINE - saltando precarga");
    return;
  }

  console.log(`⚡ [SyncManager] Precargando ${formIds.length} formularios...`);

  const results = await Promise.allSettled(
    formIds.map((id) => syncFormData(id, false))
  );

  const successful = results.filter((r) => r.status === "fulfilled").length;
  console.log(
    `✅ [SyncManager] Precarga completada: ${successful}/${formIds.length} exitosos`
  );
}
